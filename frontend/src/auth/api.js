import { refreshSession, clearRefreshBlock, credentialRequest } from "./refreshSession";
import { boundedFetch } from "./request";

export const RENEW_EARLY_MS = 60000;
const RENEW_CHECK_INTERVAL_MS = 15000;
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
    let renewalAt = null;
    let finalDeadline = false;
    const listeners = new Set();
    const publish = next => { state = next; listeners.forEach(listener => listener()); };
    const clearSession = ({ confirmedLogout = false } = {}) => {
        generation++;
        renewing = null;
        renewalAt = null;
        finalDeadline = false;
        if (confirmedLogout) clearRefreshBlock();
        publish({ session: null, authStatus: "unauthenticated" });
    };
    const establishSession = (session, { coordinatedGrant = false } = {}) => {
        generation++;
        renewing = null;
        if (!coordinatedGrant) clearRefreshBlock();
        scheduleRenewal(session);
        publish({ session, authStatus: "authenticated" });
        return true;
    };
    const captureSession = () => {
        const started = generation;
        const apply = session => started === generation ? establishSession(session, { coordinatedGrant: true }) : false;
        apply.isCurrent = () => started === generation;
        return apply;
    };
    function scheduleRenewal(session, previousSession) {
        const expiry = Date.parse(session?.accessExpiresAt);
        const remaining = expiry - Date.now();
        // Short grants may come from a configured short token TTL. Probe at a
        // positive interval; a non-advancing grant in the final minute instead
        // waits for its existing deadline, without extending that deadline.
        finalDeadline = remaining > 0 && remaining <= RENEW_EARLY_MS && expiry <= Date.parse(previousSession?.accessExpiresAt);
        const interval = remaining <= 0 ? 0 : Math.min(RENEW_CHECK_INTERVAL_MS, Math.max(1, remaining / 2));
        renewalAt = finalDeadline ? expiry : Math.max(expiry - RENEW_EARLY_MS, Date.now() + interval);
    }
    const renew = () => {
        if (renewing) return renewing;
        if (finalDeadline && state.session) {
            if (Date.now() >= renewalAt) clearSession();
            return Promise.resolve(state.session);
        }
        const started = generation;
        const operation = (async () => {
            try {
                const result = await refresh();
                if (started !== generation) throw stale();
                if (result.kind === "authenticated") scheduleRenewal(result.session, state.session);
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
    const checkSession = () => {
        if (!state.session) return Promise.resolve(null);
        if (Date.now() < renewalAt) return Promise.resolve(state.session);
        return renew();
    };
    const request = async (url, options = {}) => {
        const started = generation;
        options.signal?.throwIfAborted();
        if (!state.session) throw new Error("Sign in again to continue");
        await waitForRenewal(checkSession(), options.signal);
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
    return { snapshot: () => state, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); }, establishSession, captureSession, clearSession, renew, checkSession, nextRenewalAt: () => renewalAt, request, logout };
}
