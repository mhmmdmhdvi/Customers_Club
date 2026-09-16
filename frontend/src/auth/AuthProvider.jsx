import { useEffect, useState } from "react";
import { AuthContext } from "./AuthContext";
import {
    clearRefreshBlock,
    refreshSession,
} from "./refreshSession";

export function AuthProvider({ children }) {
    const [session, setSession] = useState(null);
    const [authStatus, setAuthStatus] = useState("restoring");

    useEffect(() => {
        let isCurrent = true;

        refreshSession()
            .then((result) => {
                if (!isCurrent) return;

                if (result.kind === "authenticated") {
                    setSession(result.session);
                    setAuthStatus("authenticated");
                    return;
                }

                if (result.kind === "unauthenticated") {
                    setSession(null);
                    setAuthStatus("unauthenticated");
                }
            })
            .catch(() => {
                if (!isCurrent) return;
                setAuthStatus("error");
            });

        return () => {
            isCurrent = false;
        };
    }, []);

    function establishSession(nextSession) {
        clearRefreshBlock();
        setSession(nextSession);
        setAuthStatus("authenticated");
    }

    function clearSession() {
        clearRefreshBlock();
        setSession(null);
        setAuthStatus("unauthenticated");
    }

    return (
        <AuthContext.Provider
            value={{
                session,
                authStatus,
                establishSession,
                clearSession,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}