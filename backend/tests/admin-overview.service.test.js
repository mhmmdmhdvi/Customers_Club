const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createAdminOverviewService,
} = require(
    "../src/services/admin-overview.service.factory",
);

const NOW = new Date(
    "2026-09-20T04:30:00.000Z",
);

test("returns the admin overview metrics", async () => {
    const sevenDaysAgo = new Date(
        NOW.getTime() -
            7 * 24 * 60 * 60 * 1000,
    );

    const prisma = {
        user: {
            async count({ where }) {
                if (where.createdAt) {
                    assert.deepEqual(where, {
                        role: "MEMBER",
                        createdAt: {
                            gte: sevenDaysAgo,
                        },
                    });

                    return 4;
                }

                assert.deepEqual(where, {
                    role: "MEMBER",
                });

                return 120;
            },
        },

        contactMessage: {
            async count(args = {}) {
                if (args.where) {
                    assert.deepEqual(
                        args.where,
                        {
                            status: "NEW",
                        },
                    );

                    return 7;
                }

                return 42;
            },
        },

        authSession: {
            async count({ where }) {
                assert.deepEqual(where, {
                    revokedAt: null,
                    expiresAt: {
                        gt: NOW,
                    },
                });

                return 18;
            },
        },
    };

    const service =
        createAdminOverviewService(
            prisma,
            {
                now: () => NOW,
            },
        );

    const result =
        await service.getOverview();

    assert.deepEqual(result, {
        members: {
            total: 120,
            newLast7Days: 4,
        },

        messages: {
            total: 42,
            new: 7,
        },

        sessions: {
            active: 18,
        },
    });
});