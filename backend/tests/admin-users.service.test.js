const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createAdminUsersService,
} = require(
    "../src/services/admin-users.service.factory",
);

test("returns a paginated member list ordered by newest signup", async () => {
    const users = [
        {
            id: 12,
            phone: "09121234567",
            firstName: "خسرو",
            lastName: "وفایی",
            role: "MEMBER",
            createdAt:
                new Date("2026-09-20T05:00:00.000Z"),
            updatedAt:
                new Date("2026-09-20T05:00:00.000Z"),
        },
    ];

    const prisma = {
        user: {
            async count({ where }) {
                assert.deepEqual(where, {});

                return 41;
            },

            async findMany(args) {
                assert.deepEqual(args, {
                    where: {},
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
                    skip: 0,
                    take: 20,
                });

                return users;
            },
        },
    };

    const service =
        createAdminUsersService(prisma);

    const result =
        await service.getUsers({});

    assert.deepEqual(result, {
        items: users,
        pagination: {
            page: 1,
            pageSize: 20,
            total: 41,
            totalPages: 3,
        },
    });
});

test("searches users by phone or name", async () => {
    const prisma = {
        user: {
            async count({ where }) {
                assert.deepEqual(where, {
                    OR: [
                        {
                            phone: {
                                contains: "خسرو",
                            },
                        },
                        {
                            firstName: {
                                contains: "خسرو",
                                mode: "insensitive",
                            },
                        },
                        {
                            lastName: {
                                contains: "خسرو",
                                mode: "insensitive",
                            },
                        },
                    ],
                });

                return 1;
            },

            async findMany(args) {
                assert.deepEqual(
                    args.where,
                    {
                        OR: [
                            {
                                phone: {
                                    contains: "خسرو",
                                },
                            },
                            {
                                firstName: {
                                    contains: "خسرو",
                                    mode: "insensitive",
                                },
                            },
                            {
                                lastName: {
                                    contains: "خسرو",
                                    mode: "insensitive",
                                },
                            },
                        ],
                    },
                );

                assert.equal(
                    args.skip,
                    20,
                );

                assert.equal(
                    args.take,
                    20,
                );

                return [];
            },
        },
    };

    const service =
        createAdminUsersService(prisma);

    const result =
        await service.getUsers({
            search: " خسرو ",
            page: "2",
            pageSize: "20",
        });

    assert.deepEqual(
        result.pagination,
        {
            page: 2,
            pageSize: 20,
            total: 1,
            totalPages: 1,
        },
    );
});

test("rejects invalid pagination before querying the database", async () => {
    let calls = 0;

    const prisma = {
        user: {
            async count() {
                calls += 1;
            },

            async findMany() {
                calls += 1;
            },
        },
    };

    const service =
        createAdminUsersService(prisma);

    await assert.rejects(
        service.getUsers({
            page: "0",
        }),
        (error) =>
            error.statusCode === 400,
    );

    await assert.rejects(
        service.getUsers({
            pageSize: "101",
        }),
        (error) =>
            error.statusCode === 400,
    );

    assert.equal(calls, 0);
});