import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AuthContext } from "./AuthContext";
import { createSessionClient, RENEW_EARLY_MS } from "./api";

export function AuthProvider({ children }) {
    const [client] = useState(() => createSessionClient());
    const state = useSyncExternalStore(client.subscribe, client.snapshot);
    useEffect(() => { client.renew().catch(() => {}); }, [client]);
    useEffect(() => {
        if (!state.session) return;
        const expiry = Date.parse(state.session.accessExpiresAt);
        if (!Number.isFinite(expiry)) return;
        const renew = () => {
            if (Date.parse(client.snapshot().session?.accessExpiresAt) - Date.now() <= RENEW_EARLY_MS) client.renew().catch(() => {});
        };
        const timer = setTimeout(renew, Math.max(0, expiry - Date.now() - RENEW_EARLY_MS));
        window.addEventListener("focus", renew);
        document.addEventListener("visibilitychange", renew);
        return () => { clearTimeout(timer); window.removeEventListener("focus", renew); document.removeEventListener("visibilitychange", renew); };
    }, [client, state.session]);
    const value = useMemo(() => ({ ...state, establishSession: client.establishSession, captureSession: client.captureSession, clearSession: client.clearSession, request: client.request, logout: client.logout }), [client, state]);
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
