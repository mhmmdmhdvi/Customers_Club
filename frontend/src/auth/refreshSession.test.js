import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    localStorage.clear();
});

it("serializes refresh across independent page instances", async () => {
    let lockTail = Promise.resolve();
    let activeRefreshes = 0;
    let maxActiveRefreshes = 0;

    const lockRequest = vi.fn((_name, callback) => {
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
    const lockRequest = vi.fn((_name, callback) => callback());

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
    const lockRequest = vi.fn((_name, callback) => callback());

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
    const lockRequest = vi.fn((_name, callback) => callback());

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