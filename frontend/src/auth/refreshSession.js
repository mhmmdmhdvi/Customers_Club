import { API_BASE_URL, boundedFetch } from "./request";
const REFRESH_LOCK_NAME = "club-auth-refresh";
const REFRESH_BLOCKED_KEY = "club-auth-refresh-blocked";
const REFRESH_STORAGE_PROBE_KEY =
    "club-auth-refresh-storage-probe";
import { parseAuthenticatedSession } from "./sessionResponse";

let refreshInFlight = null;

async function performRefresh(signal) {
    const response = await boundedFetch(
        `${API_BASE_URL}/auth/refresh`,
        {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                "X-CSRF-Protection": "1",
            },
            body: JSON.stringify({}),
            signal,
        },
    );

    if (response.status === 401) {
        return {
            kind: "unauthenticated",
        };
    }

    if (!response.ok) {
        throw new Error("Refresh request failed");
    }

    const data = await response.json();
    const session = parseAuthenticatedSession(data);

    return {
        kind: "authenticated",
        session,
    };
}

function isRefreshBlocked() {
    return localStorage.getItem(REFRESH_BLOCKED_KEY) === "1";
}

function blockRefresh() {
    localStorage.setItem(REFRESH_BLOCKED_KEY, "1");
}

function assertRefreshStorageWritable() {
    localStorage.setItem(
        REFRESH_STORAGE_PROBE_KEY,
        "1",
    );

    if (
        localStorage.getItem(REFRESH_STORAGE_PROBE_KEY) !== "1"
    ) {
        throw new Error(
            "Refresh coordination storage unavailable",
        );
    }

    localStorage.removeItem(REFRESH_STORAGE_PROBE_KEY);
}

export function clearRefreshBlock() {
    try {
        localStorage.removeItem(REFRESH_BLOCKED_KEY);
    } catch {
    }
}

async function withAuthLock(callback, signal) {
    if (
        typeof navigator === "undefined" ||
        typeof navigator.locks?.request !== "function"
    ) {
        throw new Error("Refresh coordination unavailable");
    }

    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => controller.abort(new DOMException("Authentication deadline exceeded", "TimeoutError")), 15000);
    try {
        return await navigator.locks.request(REFRESH_LOCK_NAME, { signal: controller.signal }, () => {
            controller.signal.throwIfAborted();
            return callback(controller.signal);
        });
    } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}

async function performCoordinatedRefresh() {
    return withAuthLock(async signal => {
            if (isRefreshBlocked()) {
                throw new Error("Refresh blocked");
            }

            assertRefreshStorageWritable();

            blockRefresh();

            const result = await performRefresh(signal);

            clearRefreshBlock();

            return result;
    });
}

export function refreshSession() {
    if (!refreshInFlight) {
        refreshInFlight = performCoordinatedRefresh().finally(() => {
            refreshInFlight = null;
        });
    }

    return refreshInFlight;
}

// All cookie mutations share the refresh lock. Discarding stale JSON alone
// cannot prevent the browser from applying an older response's Set-Cookie.
export function credentialRequest(url, options) {
    return withAuthLock(async signal => {
        assertRefreshStorageWritable();
        blockRefresh();
        const response = await boundedFetch(url, { ...options, signal });
        const pathname = new URL(url, API_BASE_URL).pathname;
        if (response.status === 204 && pathname === "/auth/logout") clearRefreshBlock();
        if (response.ok && ["/auth/login", "/auth/register", "/auth/login/mfa"].includes(pathname) && typeof response.json === "function") {
            const data = await response.json();
            response.json = async () => data;
            if (data?.authenticated === true) {
                try { parseAuthenticatedSession(data); clearRefreshBlock(); } catch { /* The caller presents an invalid DTO; keep the block. */ }
            }
        }
        // Validation/recovery stays inside the lock so a late UI update cannot
        // remove a safety block set by a newer operation in another tab.
        return response;
    }, options?.signal);
}
