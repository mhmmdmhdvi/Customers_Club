const ALLOWED_OUTCOMES = new Set([
    "SUCCESS",
    "FAILURE",
]);

class AdminSecurityReadError extends Error {
    constructor(
        message,
        statusCode = 400,
    ) {
        super(message);

        this.name =
            "AdminSecurityReadError";
        this.statusCode =
            statusCode;
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
        throw new AdminSecurityReadError(
            `Invalid ${label}`,
        );
    }

    const raw = String(value);

    if (!/^\d+$/.test(raw)) {
        throw new AdminSecurityReadError(
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
        throw new AdminSecurityReadError(
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
        throw new AdminSecurityReadError(
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
        throw new AdminSecurityReadError(
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
        throw new AdminSecurityReadError(
            "Invalid outcome",
        );
    }

    return value;
}

function parseStatusCode(value) {
    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {
        return null;
    }

    const statusCode =
        parsePositiveInteger(
            value,
            {
                label:
                    "status code",
            },
        );

    if (
        statusCode < 100 ||
        statusCode > 599
    ) {
        throw new AdminSecurityReadError(
            "Invalid status code",
        );
    }

    return statusCode;
}

function parseEventId(value) {
    return parsePositiveInteger(
        value,
        {
            label:
                "security event id",
        },
    );
}

function createAdminSecurityReadService(
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
            throw new AdminSecurityReadError(
                "Invalid security query",
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
                    label:
                        "page size",
                    defaultValue: 20,
                    max: 100,
                },
            );

        const actorUserId =
            query.actorUserId ===
                undefined ||
                query.actorUserId ===
                null ||
                query.actorUserId === ""
                ? null
                : parsePositiveInteger(
                    query.actorUserId,
                    {
                        label:
                            "actor user id",
                    },
                );

        const eventType =
            normalizeOptionalText(
                query.eventType,
                "event type",
                80,
            );

        const outcome =
            normalizeOutcome(
                query.outcome,
            );

        const statusCode =
            parseStatusCode(
                query.statusCode,
            );

        const requestId =
            normalizeOptionalText(
                query.requestId,
                "request id",
                128,
            );

        const where = {};

        if (eventType) {
            where.eventType =
                eventType;
        }

        if (outcome) {
            where.outcome =
                outcome;
        }

        if (statusCode !== null) {
            where.statusCode =
                statusCode;
        }

        if (actorUserId !== null) {
            where.actorUserId =
                actorUserId;
        }

        if (requestId) {
            where.requestId =
                requestId;
        }

        const skip =
            (page - 1) *
            pageSize;

        const [total, items] =
            await Promise.all([
                prisma.securityEvent
                    .count({
                        where,
                    }),

                prisma.securityEvent
                    .findMany({
                        where,

                        select: {
                            id: true,
                            eventType: true,
                            outcome: true,
                            actorUserId: true,
                            requestId: true,
                            route: true,
                            statusCode: true,
                            createdAt: true,
                        },

                        orderBy: {
                            createdAt:
                                "desc",
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
            await prisma.securityEvent
                .findUnique({
                    where: {
                        id,
                    },

                    select: {
                        id: true,
                        eventType: true,
                        outcome: true,
                        actorUserId: true,
                        requestId: true,
                        route: true,
                        statusCode: true,
                        details: true,
                        createdAt: true,
                    },
                });

        if (!event) {
            throw new AdminSecurityReadError(
                "Security event not found",
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
    AdminSecurityReadError,
    createAdminSecurityReadService,
};