import { refreshSession, clearRefreshBlock, credentialRequest } from "./refreshSession";
import { boundedFetch } from "./request";

export const RENEW_EARLY_MS = 60000;
const stale = () => new DOMException("Authentication changed", "AbortError");

function waitForRenewal(operation, signal) {
    if (!signal) return operation;
    return new Promise((resolve, reject) => {
        const abort = () => { cleanup(); reject(signal.reason); };
        const cleanup = () => signal.removeEventListener("abort", abort);
        if (signal.aborted) { reject(signal.reason); return; }
        signal.addEventListener("abort", abort, { once: true });
        operation.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
    });
}

export function createSessionClient({ refresh = refreshSession } = {}) {
    let state = { session: null, authStatus: "restoring" };
    let generation = 0;
    let renewing = null;
    const listeners = new Set();
    const publish = next => { state = next; listeners.forEach(listener => listener()); };
    const clearSession = ({ confirmedLogout = false } = {}) => {
        generation++;
        renewing = null;
        if (confirmedLogout) clearRefreshBlock();
        publish({ session: null, authStatus: "unauthenticated" });
    };
    const establishSession = (session, { coordinatedGrant = false } = {}) => {
        generation++;
        renewing = null;
        if (!coordinatedGrant) clearRefreshBlock();
        publish({ session, authStatus: "authenticated" });
        return true;
    };
    const captureSession = () => {
        const started = generation;
        return session => started === generation ? establishSession(session, { coordinatedGrant: true }) : false;
    };
    const renew = () => {
        if (renewing) return renewing;
        const started = generation;
        const operation = (async () => {
            try {
                const result = await refresh();
                if (started !== generation) throw stale();
                publish(result.kind === "authenticated"
                    ? { session: result.session, authStatus: "authenticated" }
                    : { session: null, authStatus: "unauthenticated" });
                return result.session ?? null;
            } catch (error) {
                if (started === generation) publish({ session: null, authStatus: "error" });
                throw error;
            }
        })();
        renewing = operation;
        operation.finally(() => { if (renewing === operation) renewing = null; }).catch(() => {});
        return operation;
    };
    const request = async (url, options = {}) => {
        const started = generation;
        options.signal?.throwIfAborted();
        if (!state.session) throw new Error("Sign in again to continue");
        if (Date.parse(state.session.accessExpiresAt) - Date.now() <= RENEW_EARLY_MS) await waitForRenewal(renew(), options.signal);
        const send = async () => {
            options.signal?.throwIfAborted();
            if (started !== generation || !state.session) throw stale();
            const headers = new Headers(options.headers);
            headers.set("Authorization", `Bearer ${state.session.accessToken}`);
            const response = await boundedFetch(url, { ...options, headers });
            if (started !== generation) throw stale();
            return response;
        };
        let response = await send();
        if (response.status === 401 && (options.method ?? "GET").toUpperCase() === "GET") {
            await response.body?.cancel();
            await waitForRenewal(renew(), options.signal);
            if (!state.session) return response;
            response = await send();
        }
        if (response.status === 401) clearSession();
        return response;
    };
    const logout = async () => {
        clearSession();
        const started = generation;
        const response = await credentialRequest("/auth/logout", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-CSRF-Protection": "1" }, body: "{}" });
        if (response.status !== 204) throw new Error("Logout was not confirmed; sign in again");
        // The exchange cleared its own block under the Web Lock. Clearing it
        // again here could erase another tab's newer ambiguous operation.
        if (started === generation) clearSession();
    };
    return { snapshot: () => state, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); }, establishSession, captureSession, clearSession, renew, request, logout };
}
