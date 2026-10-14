import { afterEach, expect, it, vi } from "vitest";
import { createSessionClient } from "./api";

const session = (token = "old", seconds = 900) => ({ accessToken: token, tokenType: "Bearer", accessExpiresAt: new Date(Date.now() + seconds * 1000).toISOString(), user: { id: 7 } });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("renews expired sessions once for concurrent safe reads", async () => {
    let resolve;
    const renewal = new Promise(r => { resolve = r; });
    const refresh = vi.fn(() => renewal);
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 200 })));
    const client = createSessionClient({ refresh });
    client.establishSession(session("old", -1));
    const a = client.request("/admin/users");
    const b = client.request("/admin/overview");
    resolve({ kind: "authenticated", session: session("new") });
    await Promise.all([a, b]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls.every(([, options]) => options.headers.get("Authorization") === "Bearer new")).toBe(true);
});

it("retries a safe GET once after 401, then invalidates the session", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 401 })));
    const client = createSessionClient({ refresh: async () => ({ kind: "authenticated", session: session("new") }) });
    client.establishSession(session());
    expect((await client.request("/admin/users")).status).toBe(401);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(client.snapshot().session).toBeNull();
});

it("does not retry mutations after 401", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 401 })));
    const refresh = vi.fn();
    const client = createSessionClient({ refresh });
    client.establishSession(session());
    await client.request("/admin/messages/1", { method: "PATCH" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
    expect(client.snapshot().session).toBeNull();
});

it("never restores a cleared or replaced session from a late refresh", async () => {
    let resolve;
    const client = createSessionClient({ refresh: () => new Promise(r => { resolve = r; }) });
    client.establishSession(session());
    const pending = client.renew();
    client.clearSession();
    client.establishSession(session("fresh-login"));
    resolve({ kind: "authenticated", session: session("late") });
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(client.snapshot().session.accessToken).toBe("fresh-login");
});

it("does not clear a newer login when an older logout completes late", async () => {
    let resolve;
    vi.stubGlobal("fetch", vi.fn(() => new Promise(r => { resolve = r; })));
    const client = createSessionClient();
    client.establishSession(session());
    const pending = client.logout();
    client.establishSession(session("new-login"));
    resolve({ status: 204 });
    await pending;
    expect(client.snapshot().session.accessToken).toBe("new-login");
});

it("rejects an old login grant after logout or another fresh login", () => {
    const client = createSessionClient();
    const applyGrant = client.captureSession();
    client.clearSession();
    expect(applyGrant(session("late-login"))).toBe(false);
    expect(client.snapshot().session).toBeNull();
});

it("does not clear another tab's newer ambiguous block when applying an already coordinated grant", () => {
    const client = createSessionClient();
    const apply = client.captureSession();
    localStorage.setItem("club-auth-refresh-blocked", "1");
    apply(session("validated-login"));
    expect(localStorage.getItem("club-auth-refresh-blocked")).toBe("1");
    localStorage.clear();
});

it("exposes ambiguous renewal as recoverable error and sends no API request", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const client = createSessionClient({ refresh: async () => { throw new Error("Refresh blocked"); } });
    client.establishSession(session("old", -1));
    await expect(client.request("/admin/users")).rejects.toThrow("Refresh blocked");
    expect(client.snapshot().authStatus).toBe("error");
    expect(client.snapshot().session).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
});

it("bounds requests and honors caller cancellation", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_, { signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason)))));
    const client = createSessionClient();
    client.establishSession(session());
    const pending = client.request("/admin/users", { timeoutMs: 20 });
    const assertion = expect(pending).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(20);
    await assertion;
    const controller = new AbortController();
    const canceled = client.request("/admin/users", { signal: controller.signal });
    const canceledAssertion = expect(canceled).rejects.toMatchObject({ name: "AbortError" });
    await Promise.resolve();
    controller.abort();
    await canceledAssertion;
});

it("cancels a caller waiting for shared renewal without aborting the renewal", async () => {
    let finish;
    const client = createSessionClient({ refresh: () => new Promise(r => { finish = r; }) });
    client.establishSession(session("old", -1));
    vi.stubGlobal("fetch", vi.fn());
    const controller = new AbortController();
    const request = client.request("/admin/users", { signal: controller.signal });
    controller.abort();
    let rejected = false;
    const assertion = request.catch(error => { rejected = error.name === "AbortError"; });
    await Promise.resolve(); await Promise.resolve();
    expect(rejected).toBe(true);
    finish({ kind: "authenticated", session: session("new") });
    await assertion;
    expect(fetch).not.toHaveBeenCalled();
});
