const ALLOWED_STATUSES = new Set([
    "NEW",
    "READ",
    "RESOLVED",
]);

const ALLOWED_SUBJECTS = new Set([
    "SUPPORT",
    "SUGGESTION",
    "COMPLAINT",
    "OTHER",
]);

const STATUS_TRANSITIONS = {
    NEW: "READ",
    READ: "RESOLVED",
};

class AdminMessagesError extends Error {
    constructor(
        message,
        statusCode = 400,
    ) {
        super(message);

        this.name = "AdminMessagesError";
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
        throw new AdminMessagesError(
            `Invalid ${label}`,
        );
    }

    const raw = String(value);

    if (!/^\d+$/.test(raw)) {
        throw new AdminMessagesError(
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
        throw new AdminMessagesError(
            `Invalid ${label}`,
        );
    }

    return parsed;
}

function normalizeSearch(value) {
    if (
        value === undefined ||
        value === null
    ) {
        return "";
    }

    if (typeof value !== "string") {
        throw new AdminMessagesError(
            "Invalid search",
        );
    }

    const normalized = value
        .normalize("NFC")
        .trim();

    if (
        Array.from(normalized).length > 80 ||
        /\p{Cc}/u.test(normalized)
    ) {
        throw new AdminMessagesError(
            "Invalid search",
        );
    }

    return normalized;
}

function normalizeEnumFilter(
    value,
    allowed,
    label,
) {
    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {
        return null;
    }

    if (
        typeof value !== "string" ||
        !allowed.has(value)
    ) {
        throw new AdminMessagesError(
            `Invalid ${label}`,
        );
    }

    return value;
}

function parseMessageId(value) {
    if (
        typeof value !== "string" &&
        typeof value !== "number"
    ) {
        throw new AdminMessagesError(
            "Invalid contact message id",
        );
    }

    const raw = String(value);

    if (!/^\d+$/.test(raw)) {
        throw new AdminMessagesError(
            "Invalid contact message id",
        );
    }

    const id = Number(raw);

    if (
        !Number.isSafeInteger(id) ||
        id < 1
    ) {
        throw new AdminMessagesError(
            "Invalid contact message id",
        );
    }

    return id;
}

function createAdminMessagesService(
    prisma,
    {
        adminAuditService,
    } = {},
) {
    async function getMessages(query = {}) {
        if (
            !query ||
            typeof query !== "object" ||
            Array.isArray(query)
        ) {
            throw new AdminMessagesError(
                "Invalid messages query",
            );
        }

        const page = parsePositiveInteger(
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

        const search =
            normalizeSearch(
                query.search,
            );

        const status =
            normalizeEnumFilter(
                query.status,
                ALLOWED_STATUSES,
                "status",
            );

        const subject =
            normalizeEnumFilter(
                query.subject,
                ALLOWED_SUBJECTS,
                "subject",
            );

        const where = {};

        if (status) {
            where.status = status;
        }

        if (subject) {
            where.subject = subject;
        }

        if (search) {
            where.OR = [
                {
                    name: {
                        contains: search,
                        mode: "insensitive",
                    },
                },
                {
                    phone: {
                        contains: search,
                    },
                },
                {
                    email: {
                        contains: search,
                        mode: "insensitive",
                    },
                },
            ];
        }

        const skip =
            (page - 1) * pageSize;

        const [total, items] =
            await Promise.all([
                prisma.contactMessage.count({
                    where,
                }),

                prisma.contactMessage.findMany({
                    where,

                    select: {
                        id: true,
                        name: true,
                        phone: true,
                        email: true,
                        subject: true,
                        status: true,
                        createdAt: true,
                        updatedAt: true,
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
                        total / pageSize,
                    ),
            },
        };
    }

    async function getMessageById(value) {
        const id = parseMessageId(value);

        const message =
            await prisma.contactMessage.findUnique({
                where: {
                    id,
                },

                select: {
                    id: true,
                    name: true,
                    phone: true,
                    email: true,
                    subject: true,
                    message: true,
                    status: true,
                    createdAt: true,
                    updatedAt: true,
                },
            });

        if (!message) {
            throw new AdminMessagesError(
                "Contact message not found",
                404,
            );
        }

        return message;
    }

    async function updateMessageStatus({
        id: rawId,
        status,
        actorUserId,
        requestId,
    }) {
        const id = parseMessageId(rawId);

        if (
            typeof status !== "string" ||
            !ALLOWED_STATUSES.has(status)
        ) {
            throw new AdminMessagesError(
                "Invalid contact message status",
            );
        }

        if (
            !Number.isSafeInteger(actorUserId) ||
            actorUserId < 1
        ) {
            throw new AdminMessagesError(
                "Invalid admin user",
            );
        }

        if (
            !adminAuditService ||
            typeof adminAuditService.record !==
            "function"
        ) {
            throw new Error(
                "Admin audit service unavailable",
            );
        }

        return prisma.$transaction(
            async (tx) => {
                const current =
                    await tx.contactMessage.findUnique({
                        where: {
                            id,
                        },

                        select: {
                            id: true,
                            status: true,
                        },
                    });

                if (!current) {
                    throw new AdminMessagesError(
                        "Contact message not found",
                        404,
                    );
                }

                const expectedNextStatus =
                    STATUS_TRANSITIONS[
                    current.status
                    ];

                if (
                    expectedNextStatus !== status
                ) {
                    throw new AdminMessagesError(
                        "Invalid contact message status transition",
                        409,
                    );
                }

                const mutation =
                    await tx.contactMessage.updateMany({
                        where: {
                            id,
                            status: current.status,
                        },

                        data: {
                            status,
                        },
                    });

                if (mutation.count !== 1) {
                    throw new AdminMessagesError(
                        "Contact message status changed",
                        409,
                    );
                }

                const updated =
                    await tx.contactMessage.findUnique({
                        where: {
                            id,
                        },

                        select: {
                            id: true,
                            status: true,
                            updatedAt: true,
                        },
                    });

                if (!updated) {
                    throw new AdminMessagesError(
                        "Contact message not found",
                        404,
                    );
                }

                const auditEvent = {
                    actorUserId,

                    action:
                        "CONTACT_MESSAGE_STATUS_CHANGED",

                    targetType:
                        "CONTACT_MESSAGE",

                    targetId:
                        String(id),

                    outcome:
                        "SUCCESS",

                    details: {
                        fromStatus:
                            current.status,

                        toStatus:
                            status,
                    },
                };

                if (
                    requestId !== undefined &&
                    requestId !== null
                ) {
                    auditEvent.requestId =
                        requestId;
                }

                await adminAuditService.record(
                    auditEvent,
                    tx,
                );

                return updated;
            },
        );
    }

    return {
        getMessages,
        getMessageById,
        updateMessageStatus,
    };
}

module.exports = {
    AdminMessagesError,
    createAdminMessagesService,
};