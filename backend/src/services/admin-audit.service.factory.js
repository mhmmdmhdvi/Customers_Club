const SENSITIVE_DETAIL_KEYS = new Set([
    "accesstoken",
    "refreshtoken",
    "token",
    "password",
    "otpcode",
    "authorization",
    "cookie",
    "setcookie",
    "message",
    "messagebody",
]);

const ALLOWED_OUTCOMES = new Set([
    "SUCCESS",
    "FAILURE",
]);

class AdminAuditError extends Error {
    constructor(
        message,
        statusCode = 400,
    ) {
        super(message);

        this.name = "AdminAuditError";
        this.statusCode = statusCode;
    }
}

function normalizeRequiredText(
    value,
    label,
    maxLength,
) {
    if (typeof value !== "string") {
        throw new AdminAuditError(
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
        throw new AdminAuditError(
            `Invalid ${label}`,
        );
    }

    return normalized;
}

function normalizeActorUserId(value) {
    if (
        !Number.isSafeInteger(value) ||
        value < 1
    ) {
        throw new AdminAuditError(
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
        throw new AdminAuditError(
            "Invalid audit outcome",
        );
    }

    return value;
}

function normalizeRequestId(value) {
    if (
        value === undefined ||
        value === null
    ) {
        return undefined;
    }

    return normalizeRequiredText(
        value,
        "request id",
        128,
    );
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
        throw new AdminAuditError(
            "Invalid audit details",
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
            throw new AdminAuditError(
                "Invalid audit details",
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
        throw new AdminAuditError(
            "Invalid audit details",
        );
    }

    for (const [key, nestedValue] of
        Object.entries(value)) {
        if (
            SENSITIVE_DETAIL_KEYS.has(
                normalizedKey(key),
            )
        ) {
            throw new AdminAuditError(
                "Sensitive audit details are not allowed",
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
        throw new AdminAuditError(
            "Invalid audit details",
        );
    }

    validateDetailsValue(value);

    const serialized =
        JSON.stringify(value);

    if (
        serialized.length > 4000
    ) {
        throw new AdminAuditError(
            "Audit details are too large",
        );
    }

    return value;
}

function createAdminAuditService(prisma) {
    async function record(
        input,
        transaction,
    ) {
        if (
            !input ||
            typeof input !== "object" ||
            Array.isArray(input)
        ) {
            throw new AdminAuditError(
                "Invalid audit event",
            );
        }

        const data = {
            actorUserId:
                normalizeActorUserId(
                    input.actorUserId,
                ),

            action:
                normalizeRequiredText(
                    input.action,
                    "audit action",
                    80,
                ),

            targetType:
                normalizeRequiredText(
                    input.targetType,
                    "target type",
                    80,
                ),

            targetId:
                normalizeRequiredText(
                    input.targetId,
                    "target id",
                    128,
                ),

            outcome:
                normalizeOutcome(
                    input.outcome,
                ),
        };

        const requestId =
            normalizeRequestId(
                input.requestId,
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

        const db =
            transaction ?? prisma;

        return db.adminAuditEvent.create({
            data,
        });
    }

    return {
        record,
    };
}

module.exports = {
    AdminAuditError,
    createAdminAuditService,
};