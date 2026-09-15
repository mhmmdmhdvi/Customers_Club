import { useState } from "react";

import { AuthContext } from "./AuthContext";

export function AuthProvider({ children }) {
    const [session, setSession] = useState(null);

    function establishSession(nextSession) {
        setSession(nextSession);
    }

    function clearSession() {
        setSession(null);
    }

    return (
        <AuthContext.Provider
            value={{
                session,
                establishSession,
                clearSession,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}