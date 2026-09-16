const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
const REFRESH_LOCK_NAME = "club-auth-refresh";
const REFRESH_BLOCKED_KEY = "club-auth-refresh-blocked";
const REFRESH_STORAGE_PROBE_KEY =
    "club-auth-refresh-storage-probe";

let refreshInFlight = null;

async function performRefresh() {
    const response = await fetch(
        `${API_BASE_URL}/auth/refresh`,
        {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                "X-CSRF-Protection": "1",
            },
            body: JSON.stringify({}),
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
    const expiresAt = Date.parse(data?.accessExpiresAt);

    if (
        data?.authenticated !== true ||
        data?.tokenType !== "Bearer" ||
        typeof data?.accessToken !== "string" ||
        data.accessToken.length === 0 ||
        !Number.isSafeInteger(data?.user?.id) ||
        data.user.id <= 0 ||
        typeof data.user.firstName !== "string" ||
        typeof data.user.lastName !== "string" ||
        !Number.isFinite(expiresAt) ||
        expiresAt <= Date.now()
    ) {
        throw new Error("Invalid refresh response");
    }

    return {
        kind: "authenticated",
        session: {
            user: data.user,
            accessToken: data.accessToken,
            tokenType: data.tokenType,
            accessExpiresAt: data.accessExpiresAt,
        },
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

async function performCoordinatedRefresh() {
    if (
        typeof navigator === "undefined" ||
        typeof navigator.locks?.request !== "function"
    ) {
        throw new Error("Refresh coordination unavailable");
    }

    return navigator.locks.request(
        REFRESH_LOCK_NAME,
        async () => {
            if (isRefreshBlocked()) {
                throw new Error("Refresh blocked");
            }

            assertRefreshStorageWritable();

            blockRefresh();

            const result = await performRefresh();

            clearRefreshBlock();

            return result;
        },
    );
}

export function refreshSession() {
    if (!refreshInFlight) {
        refreshInFlight = performCoordinatedRefresh().finally(() => {
            refreshInFlight = null;
        });
    }

    return refreshInFlight;
}