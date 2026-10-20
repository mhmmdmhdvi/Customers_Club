import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
    localStorage.clear();
});

it("bounds waiting for another tab's lock without sending credentials", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", { locks: { request: (_name, { signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason))) } });
    vi.stubGlobal("fetch", vi.fn());
    const module = await import("./refreshSession");
    const assertion = expect(module.refreshSession()).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(15000);
    await assertion;
    expect(fetch).not.toHaveBeenCalled();
    expect(localStorage.getItem("club-auth-refresh-blocked")).toBeNull();
});

it("queues a fresh login cookie exchange behind an older refresh", async () => {
    let tail = Promise.resolve();
    vi.stubGlobal("navigator", { locks: { request: (_name, _options, callback) => {
        const operation = tail.then(callback); tail = operation.catch(() => {}); return operation;
    } } });
    let finish;
    vi.stubGlobal("fetch", vi.fn(url => url.endsWith("/auth/refresh")
        ? new Promise(resolve => { finish = resolve; })
        : Promise.resolve({ status: 200, ok: true })));
    const module = await import("./refreshSession");
    const refresh = module.refreshSession();
    await Promise.resolve();
    const login = module.credentialRequest("/auth/login", { method: "POST" });
    await Promise.resolve();
    expect(fetch).toHaveBeenCalledTimes(1);
    finish({ status: 401, ok: false });
    await Promise.all([refresh, login]);
    expect(fetch.mock.calls.map(([url]) => new URL(url).pathname)).toEqual(["/auth/refresh", "/auth/login"]);
});

it("keeps an ambiguous block through an MFA challenge and failed logout, clearing only confirmed 204", async () => {
    vi.stubGlobal("navigator", { locks: { request: (_name, _options, callback) => callback() } });
    vi.stubGlobal("fetch", vi.fn()
        .mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({ authenticated: false, mfaRequired: true }) })
        .mockResolvedValueOnce({ status: 503, ok: false })
        .mockResolvedValueOnce({ status: 204, ok: true }));
    const module = await import("./refreshSession");
    localStorage.setItem("club-auth-refresh-blocked", "1");
    const response = await module.credentialRequest("/auth/login", { method: "POST" });
    expect((await response.json()).mfaRequired).toBe(true);
    expect(localStorage.getItem("club-auth-refresh-blocked")).toBe("1");
    await module.credentialRequest("/auth/logout", { method: "POST" });
    expect(localStorage.getItem("club-auth-refresh-blocked")).toBe("1");
    await module.credentialRequest("/auth/logout", { method: "POST" });
    expect(localStorage.getItem("club-auth-refresh-blocked")).toBeNull();
});

it("validates a fresh authenticated grant and clears its safety block while holding the cookie lock", async () => {
    vi.stubGlobal("navigator", { locks: { request: (_name, _options, callback) => callback() } });
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 200, ok: true, json: async () => ({ authenticated: true, tokenType: "Bearer", accessToken: "fresh", accessExpiresAt: new Date(Date.now() + 900000).toISOString(), user: { id: 7, phone: "09123456789", firstName: null, lastName: null, role: "MEMBER", createdAt: "2026-01-01T00:00:00Z" } }) })));
    const module = await import("./refreshSession");
    await module.credentialRequest("/auth/login", { method: "POST" });
    expect(localStorage.getItem("club-auth-refresh-blocked")).toBeNull();
});

it("serializes refresh across independent page instances", async () => {
    let lockTail = Promise.resolve();
    let activeRefreshes = 0;
    let maxActiveRefreshes = 0;

    const lockRequest = vi.fn((_name, _options, callback) => {
        const run = lockTail.then(() => callback());

        lockTail = run.catch(() => { });

        return run;
    });

    vi.stubGlobal("navigator", {
        locks: {
            request: lockRequest,
        },
    });

    const fetchMock = vi.fn(async () => {
        activeRefreshes += 1;
        maxActiveRefreshes = Math.max(
            maxActiveRefreshes,
            activeRefreshes,
        );

        // Keep the request alive for one microtask so overlapping
        // refreshes are observable by the test.
        await Promise.resolve();

        activeRefreshes -= 1;

        return {
            ok: true,
            status: 200,
            json: async () => ({
                message: "Session refreshed",
                authenticated: true,
                user: {
                    id: 7,
                    phone: "09123456789",
                    firstName: "سارا",
                    lastName: "احمدی",
                    role: "MEMBER",
                    createdAt: "2026-09-10T08:00:00.000Z",
                },
                tokenType: "Bearer",
                accessToken: "restored.access.token",
                expiresIn: 900,
                accessExpiresAt: new Date(
                    Date.now() + 15 * 60 * 1000,
                ).toISOString(),
            }),
        };
    });

    vi.stubGlobal("fetch", fetchMock);

    // Simulate two tabs. resetModules() gives each import its own
    // module-level refreshInFlight variable.
    vi.resetModules();
    const tabA = await import("./refreshSession");

    vi.resetModules();
    const tabB = await import("./refreshSession");

    await Promise.all([
        tabA.refreshSession(),
        tabB.refreshSession(),
    ]);

    expect(lockRequest).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Both tabs may refresh, but never at the same time.
    expect(maxActiveRefreshes).toBe(1);
});

it("blocks another tab after an ambiguous refresh failure", async () => {
    const lockRequest = vi.fn((_name, _options, callback) => callback());

    vi.stubGlobal("navigator", {
        locks: {
            request: lockRequest,
        },
    });

    const fetchMock = vi
        .fn()
        // Tab A gets an ambiguous server failure.
        .mockResolvedValueOnce({
            ok: false,
            status: 503,
        })
        // This would succeed if Tab B were allowed to retry.
        .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                authenticated: true,
                user: {
                    id: 7,
                    phone: "09123456789",
                    firstName: "سارا",
                    lastName: "احمدی",
                    role: "MEMBER",
                    createdAt: "2026-09-10T08:00:00.000Z",
                },
                tokenType: "Bearer",
                accessToken: "second.access.token",
                expiresIn: 900,
                accessExpiresAt: new Date(
                    Date.now() + 15 * 60 * 1000,
                ).toISOString(),
            }),
        });

    vi.stubGlobal("fetch", fetchMock);

    vi.resetModules();
    const tabA = await import("./refreshSession");

    await expect(
        tabA.refreshSession(),
    ).rejects.toThrow("Refresh request failed");

    // A separate module instance represents another browser tab.
    vi.resetModules();
    const tabB = await import("./refreshSession");

    await expect(
        tabB.refreshSession(),
    ).rejects.toThrow("Refresh blocked");

    // Tab B must not send another refresh request.
    expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("rejects safely when cross-tab coordination is unavailable", async () => {
    vi.stubGlobal("navigator", {});

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    vi.resetModules();
    const auth = await import("./refreshSession");

    let refreshPromise;

    expect(() => {
        refreshPromise = auth.refreshSession();
    }).not.toThrow();

    await expect(refreshPromise).rejects.toThrow(
        "Refresh coordination unavailable",
    );

    expect(fetchMock).not.toHaveBeenCalled();
});

it("does not refresh when shared coordination storage is unavailable", async () => {
    const lockRequest = vi.fn((_name, _options, callback) => callback());

    vi.stubGlobal("navigator", {
        locks: {
            request: lockRequest,
        },
    });

    const getItemSpy = vi
        .spyOn(Storage.prototype, "getItem")
        .mockImplementation(() => {
            throw new DOMException(
                "Storage unavailable",
                "SecurityError",
            );
        });

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    vi.resetModules();
    const auth = await import("./refreshSession");

    await expect(
        auth.refreshSession(),
    ).rejects.toThrow();

    expect(fetchMock).not.toHaveBeenCalled();

    getItemSpy.mockRestore();
});

it("does not refresh when shared coordination storage is not writable", async () => {
    const lockRequest = vi.fn((_name, _options, callback) => callback());

    vi.stubGlobal("navigator", {
        locks: {
            request: lockRequest,
        },
    });

    const setItemSpy = vi
        .spyOn(Storage.prototype, "setItem")
        .mockImplementation(() => {
            throw new DOMException(
                "Storage unavailable",
                "SecurityError",
            );
        });

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    vi.resetModules();
    const auth = await import("./refreshSession");

    await expect(
        auth.refreshSession(),
    ).rejects.toThrow();

    expect(fetchMock).not.toHaveBeenCalled();

    setItemSpy.mockRestore();
});

it("clears the refresh block best-effort when storage removal is unavailable", async () => {
    const removeItemSpy = vi
        .spyOn(Storage.prototype, "removeItem")
        .mockImplementation(() => {
            throw new DOMException(
                "Storage unavailable",
                "SecurityError",
            );
        });

    vi.resetModules();
    const auth = await import("./refreshSession");

    expect(() => {
        auth.clearRefreshBlock();
    }).not.toThrow();

    removeItemSpy.mockRestore();
});

it("does not refresh if the safety block cannot be set before the request", async () => {
    const lockRequest = vi.fn((_name, _options, callback) => callback());

    vi.stubGlobal("navigator", {
        locks: {
            request: lockRequest,
        },
    });

    const originalSetItem = Storage.prototype.setItem;

    let storageWrites = 0;

    vi.spyOn(Storage.prototype, "setItem")
        .mockImplementation(function (key, value) {
            storageWrites += 1;

            // First write is the storage probe and should work.
            if (storageWrites === 2) {
                throw new DOMException(
                    "Storage unavailable",
                    "SecurityError",
                );
            }

            return originalSetItem.call(this, key, value);
        });

    const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
    });

    vi.stubGlobal("fetch", fetchMock);

    vi.resetModules();
    const auth = await import("./refreshSession");

    await expect(
        auth.refreshSession(),
    ).rejects.toThrow();

    expect(fetchMock).not.toHaveBeenCalled();
});
