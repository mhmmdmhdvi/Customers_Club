import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AuthContext } from "./AuthContext";
import { createSessionClient } from "./api";

export function AuthProvider({ children }) {
    const [client] = useState(() => createSessionClient());
    const state = useSyncExternalStore(client.subscribe, client.snapshot);
    useEffect(() => { client.renew().catch(() => {}); }, [client]);
    useEffect(() => {
        if (!state.session) return;
        const nextCheck = client.nextRenewalAt();
        if (!Number.isFinite(nextCheck)) return;
        const renew = () => { client.checkSession().catch(() => {}); };
        const timer = setTimeout(renew, Math.max(0, nextCheck - Date.now()));
        window.addEventListener("focus", renew);
        document.addEventListener("visibilitychange", renew);
        return () => { clearTimeout(timer); window.removeEventListener("focus", renew); document.removeEventListener("visibilitychange", renew); };
    }, [client, state.session]);
    const value = useMemo(() => ({ ...state, establishSession: client.establishSession, captureSession: client.captureSession, clearSession: client.clearSession, request: client.request, logout: client.logout }), [client, state]);
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
