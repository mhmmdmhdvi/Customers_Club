import { act, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { AuthProvider } from "./AuthProvider";
import { useAuth } from "./AuthContext";

let auth;
function Reader() { const value = useAuth(); useEffect(() => { auth = value; }, [value]); return null; }
const session = token => ({ authenticated: true, accessToken: token, tokenType: "Bearer", accessExpiresAt: new Date(Date.now() + 900000).toISOString(), user: { id: 7, phone: "09123456789", firstName: null, lastName: null, role: "MEMBER", createdAt: "2026-01-01T00:00:00Z" } });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });

it("renews one minute early with stable callbacks and cleans timers on unmount", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", { locks: { request: (_, _options, callback) => callback() } });
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 200, ok: true, json: async () => session(`token-${fetch.mock.calls.length}`) })));
    const view = render(<AuthProvider><Reader /></AuthProvider>);
    await act(async () => { await Promise.resolve(); });
    const callbacks = [auth.establishSession, auth.clearSession, auth.request];
    await act(async () => { await vi.advanceTimersByTimeAsync(839999); });
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(auth.session.accessToken).toBe("token-2");
    expect([auth.establishSession, auth.clearSession, auth.request]).toEqual(callbacks);
    view.unmount();
    await vi.advanceTimersByTimeAsync(900000);
    expect(fetch).toHaveBeenCalledTimes(2);
});

it("ignores restoration after logout and retains the ambiguous block on local clear", async () => {
    vi.stubGlobal("navigator", { locks: { request: (_, _options, callback) => callback() } });
    let resolve;
    vi.stubGlobal("fetch", vi.fn(() => new Promise(r => { resolve = r; })));
    render(<AuthProvider><Reader /></AuthProvider>);
    act(() => auth.clearSession());
    expect(localStorage.getItem("club-auth-refresh-blocked")).toBe("1");
    await act(async () => { resolve({ ok: true, status: 200, json: async () => session("late") }); });
    expect(auth.session).toBeNull();
    expect(auth.authStatus).toBe("unauthenticated");
});

it("bounds same-expiry grants near absolute expiry across timers, focus and safe reads", async () => {
    vi.useFakeTimers();
    const expiry = new Date(Date.now() + 45000).toISOString();
    const timers = vi.spyOn(globalThis, "setTimeout");
    vi.stubGlobal("navigator", { locks: { request: (_, _options, callback) => callback() } });
    let refreshes = 0;
    vi.stubGlobal("fetch", vi.fn(async url => {
        if (!url.endsWith("/auth/refresh")) return { status: 200 };
        refreshes++;
        return { status: 200, ok: true, json: async () => ({ ...session(`token-${refreshes}`), accessExpiresAt: expiry }) };
    }));
    render(<AuthProvider><Reader /></AuthProvider>);
    await act(async () => { await Promise.resolve(); });
    expect(timers.mock.calls.some(([callback, delay]) => callback.name === "renew" && delay === 0)).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(refreshes).toBe(2);
    await act(async () => {
        for (let i = 0; i < 5; i++) window.dispatchEvent(new Event("focus"));
        await Promise.all(Array.from({ length: 5 }, () => auth.request("/admin/users")));
    });
    expect(refreshes).toBe(2);
    expect(auth.session.accessExpiresAt).toBe(expiry);
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(refreshes).toBe(2);
    expect(auth.session).toBeNull();
    expect(auth.authStatus).toBe("unauthenticated");
    timers.mockRestore();
});
