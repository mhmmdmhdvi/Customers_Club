const SENSITIVE_DETAIL_KEYS = new Set([
    "accesstoken",
    "refreshtoken",
    "token",
    "authorization",
    "cookie",
    "setcookie",
    "otpcode",
    "password",
    "message",
    "messagebody",
]);

const ALLOWED_OUTCOMES = new Set([
    "SUCCESS",
    "FAILURE",
]);

class SecurityEventError extends Error {
    constructor(
        message,
        statusCode = 400,
    ) {
        super(message);

        this.name = "SecurityEventError";
        this.statusCode = statusCode;
    }
}

function normalizeRequiredText(
    value,
    label,
    maxLength,
) {
    if (typeof value !== "string") {
        throw new SecurityEventError(
            `Invalid ${label}`,
        );
    }

    const normalized = value
        .normalize("NFC")
        .trim();

    if (
        normalized.length < 1 ||
        Array.from(normalized).length >
        maxLength ||
        /\p{Cc}/u.test(normalized)
    ) {
        throw new SecurityEventError(
            `Invalid ${label}`,
        );
    }

    return normalized;
}

function normalizeOptionalText(
    value,
    label,
    maxLength,
) {
    if (
        value === undefined ||
        value === null
    ) {
        return undefined;
    }

    return normalizeRequiredText(
        value,
        label,
        maxLength,
    );
}

function normalizeActorUserId(value) {
    if (
        value === undefined ||
        value === null
    ) {
        return null;
    }

    if (
        !Number.isSafeInteger(value) ||
        value < 1
    ) {
        throw new SecurityEventError(
            "Invalid actor user id",
        );
    }

    return value;
}

function normalizeOutcome(value) {
    if (
        typeof value !== "string" ||
        !ALLOWED_OUTCOMES.has(value)
    ) {
        throw new SecurityEventError(
            "Invalid security event outcome",
        );
    }

    return value;
}

function normalizeStatusCode(value) {
    if (
        !Number.isSafeInteger(value) ||
        value < 100 ||
        value > 599
    ) {
        throw new SecurityEventError(
            "Invalid status code",
        );
    }

    return value;
}

function normalizedKey(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

function validateDetailsValue(
    value,
    depth = 0,
) {
    if (depth > 6) {
        throw new SecurityEventError(
            "Invalid security event details",
        );
    }

    if (
        value === null ||
        typeof value === "string" ||
        typeof value === "boolean"
    ) {
        return;
    }

    if (typeof value === "number") {
        if (!Number.isFinite(value)) {
            throw new SecurityEventError(
                "Invalid security event details",
            );
        }

        return;
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            validateDetailsValue(
                item,
                depth + 1,
            );
        }

        return;
    }

    if (
        typeof value !== "object" ||
        Object.getPrototypeOf(value) !==
        Object.prototype
    ) {
        throw new SecurityEventError(
            "Invalid security event details",
        );
    }

    for (const [key, nestedValue] of
        Object.entries(value)) {
        if (
            SENSITIVE_DETAIL_KEYS.has(
                normalizedKey(key),
            )
        ) {
            throw new SecurityEventError(
                "Sensitive security event details are not allowed",
            );
        }

        validateDetailsValue(
            nestedValue,
            depth + 1,
        );
    }
}

function normalizeDetails(value) {
    if (value === undefined) {
        return undefined;
    }

    if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        Object.getPrototypeOf(value) !==
        Object.prototype
    ) {
        throw new SecurityEventError(
            "Invalid security event details",
        );
    }

    validateDetailsValue(value);

    if (
        JSON.stringify(value).length >
        4000
    ) {
        throw new SecurityEventError(
            "Security event details are too large",
        );
    }

    return value;
}

function createSecurityEventService(prisma) {
    async function record(input) {
        if (
            !input ||
            typeof input !== "object" ||
            Array.isArray(input)
        ) {
            throw new SecurityEventError(
                "Invalid security event",
            );
        }

        const data = {
            eventType:
                normalizeRequiredText(
                    input.eventType,
                    "event type",
                    80,
                ),

            outcome:
                normalizeOutcome(
                    input.outcome,
                ),

            actorUserId:
                normalizeActorUserId(
                    input.actorUserId,
                ),

            route:
                normalizeRequiredText(
                    input.route,
                    "route",
                    255,
                ),

            statusCode:
                normalizeStatusCode(
                    input.statusCode,
                ),
        };

        const requestId =
            normalizeOptionalText(
                input.requestId,
                "request id",
                128,
            );

        const details =
            normalizeDetails(
                input.details,
            );

        if (requestId !== undefined) {
            data.requestId =
                requestId;
        }

        if (details !== undefined) {
            data.details =
                details;
        }

        return prisma.securityEvent.create({
            data,
        });
    }

    return {
        record,
    };
}

module.exports = {
    SecurityEventError,
    createSecurityEventService,
};