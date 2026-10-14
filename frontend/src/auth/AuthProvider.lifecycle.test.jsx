import { act, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { AuthProvider } from "./AuthProvider";
import { useAuth } from "./AuthContext";

let auth;
function Reader() { const value = useAuth(); useEffect(() => { auth = value; }, [value]); return null; }
const session = token => ({ authenticated: true, accessToken: token, tokenType: "Bearer", accessExpiresAt: new Date(Date.now() + 900000).toISOString(), user: { id: 7, phone: "09123456789", firstName: null, lastName: null, role: "MEMBER", createdAt: "2026-01-01T00:00:00Z" } });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear(); });

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
