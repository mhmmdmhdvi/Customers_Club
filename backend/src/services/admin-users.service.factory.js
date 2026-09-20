class AdminUsersError extends Error {
    constructor(
        message,
        statusCode = 400,
    ) {
        super(message);

        this.name = "AdminUsersError";
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
        throw new AdminUsersError(
            `Invalid ${label}`,
        );
    }

    const raw = String(value);

    if (!/^\d+$/.test(raw)) {
        throw new AdminUsersError(
            `Invalid ${label}`,
        );
    }

    const parsed = Number(raw);

    if (
        !Number.isSafeInteger(parsed) ||
        parsed < 1 ||
        (max !== undefined &&
            parsed > max)
    ) {
        throw new AdminUsersError(
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
        throw new AdminUsersError(
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
        throw new AdminUsersError(
            "Invalid search",
        );
    }

    return normalized;
}

function createAdminUsersService(prisma) {
    async function getUsers(query = {}) {
        if (
            !query ||
            typeof query !== "object" ||
            Array.isArray(query)
        ) {
            throw new AdminUsersError(
                "Invalid users query",
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

        const search = normalizeSearch(
            query.search,
        );

        const where = search
            ? {
                OR: [
                    {
                        phone: {
                            contains: search,
                        },
                    },
                    {
                        firstName: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },
                    {
                        lastName: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },
                ],
            }
            : {};

        const skip =
            (page - 1) * pageSize;

        const [total, items] =
            await Promise.all([
                prisma.user.count({
                    where,
                }),

                prisma.user.findMany({
                    where,

                    select: {
                        id: true,
                        phone: true,
                        firstName: true,
                        lastName: true,
                        role: true,
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

    return {
        getUsers,
    };
}

module.exports = {
    AdminUsersError,
    createAdminUsersService,
};