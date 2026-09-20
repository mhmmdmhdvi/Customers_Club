const ALLOWED_OUTCOMES = new Set([
    "SUCCESS",
    "FAILURE",
]);

class AdminAuditReadError extends Error {
    constructor(
        message,
        statusCode = 400,
    ) {
        super(message);

        this.name = "AdminAuditReadError";
        this.statusCode = statusCode;
    }
}

function parsePositiveInteger(
    value,
    {
        label,
        defaultValue,
        max,
    },
) {
    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {
        return defaultValue;
    }

    if (
        typeof value !== "string" &&
        typeof value !== "number"
    ) {
        throw new AdminAuditReadError(
            `Invalid ${label}`,
        );
    }

    const raw = String(value);

    if (!/^\d+$/.test(raw)) {
        throw new AdminAuditReadError(
            `Invalid ${label}`,
        );
    }

    const parsed = Number(raw);

    if (
        !Number.isSafeInteger(parsed) ||
        parsed < 1 ||
        (
            max !== undefined &&
            parsed > max
        )
    ) {
        throw new AdminAuditReadError(
            `Invalid ${label}`,
        );
    }

    return parsed;
}

function normalizeOptionalText(
    value,
    label,
    maxLength,
) {
    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {
        return null;
    }

    if (typeof value !== "string") {
        throw new AdminAuditReadError(
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
        throw new AdminAuditReadError(
            `Invalid ${label}`,
        );
    }

    return normalized;
}

function normalizeOutcome(value) {
    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {
        return null;
    }

    if (
        typeof value !== "string" ||
        !ALLOWED_OUTCOMES.has(value)
    ) {
        throw new AdminAuditReadError(
            "Invalid outcome",
        );
    }

    return value;
}

function parseEventId(value) {
    return parsePositiveInteger(
        value,
        {
            label: "audit event id",
        },
    );
}

function createAdminAuditReadService(
    prisma,
) {
    async function getEvents(
        query = {},
    ) {
        if (
            !query ||
            typeof query !== "object" ||
            Array.isArray(query)
        ) {
            throw new AdminAuditReadError(
                "Invalid audit query",
            );
        }

        const page =
            parsePositiveInteger(
                query.page,
                {
                    label: "page",
                    defaultValue: 1,
                },
            );

        const pageSize =
            parsePositiveInteger(
                query.pageSize,
                {
                    label: "page size",
                    defaultValue: 20,
                    max: 100,
                },
            );

        const actorUserId =
            query.actorUserId === undefined ||
                query.actorUserId === null ||
                query.actorUserId === ""
                ? null
                : parsePositiveInteger(
                    query.actorUserId,
                    {
                        label:
                            "actor user id",
                    },
                );

        const action =
            normalizeOptionalText(
                query.action,
                "action",
                80,
            );

        const outcome =
            normalizeOutcome(
                query.outcome,
            );

        const targetType =
            normalizeOptionalText(
                query.targetType,
                "target type",
                80,
            );

        const where = {};

        if (actorUserId !== null) {
            where.actorUserId =
                actorUserId;
        }

        if (action) {
            where.action = action;
        }

        if (outcome) {
            where.outcome = outcome;
        }

        if (targetType) {
            where.targetType =
                targetType;
        }

        const skip =
            (page - 1) * pageSize;

        const [total, items] =
            await Promise.all([
                prisma.adminAuditEvent.count({
                    where,
                }),

                prisma.adminAuditEvent.findMany({
                    where,

                    select: {
                        id: true,
                        actorUserId: true,
                        action: true,
                        targetType: true,
                        targetId: true,
                        outcome: true,
                        requestId: true,
                        createdAt: true,
                    },

                    orderBy: {
                        createdAt: "desc",
                    },

                    skip,
                    take: pageSize,
                }),
            ]);

        return {
            items,

            pagination: {
                page,
                pageSize,
                total,
                totalPages:
                    Math.ceil(
                        total /
                        pageSize,
                    ),
            },
        };
    }

    async function getEventById(
        value,
    ) {
        const id =
            parseEventId(value);

        const event =
            await prisma.adminAuditEvent
                .findUnique({
                    where: {
                        id,
                    },

                    select: {
                        id: true,
                        actorUserId: true,
                        action: true,
                        targetType: true,
                        targetId: true,
                        outcome: true,
                        requestId: true,
                        details: true,
                        createdAt: true,
                    },
                });

        if (!event) {
            throw new AdminAuditReadError(
                "Audit event not found",
                404,
            );
        }

        return event;
    }

    return {
        getEvents,
        getEventById,
    };
}

module.exports = {
    AdminAuditReadError,
    createAdminAuditReadService,
};