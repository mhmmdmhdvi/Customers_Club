const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createAdminAuditReadService,
} = require(
    "../src/services/admin-audit-read.service.factory",
);

test("returns paginated audit events ordered newest first", async () => {
    const events = [
        {
            id: 14,
            actorUserId: 7,
            action:
                "CONTACT_MESSAGE_STATUS_CHANGED",
            targetType:
                "CONTACT_MESSAGE",
            targetId: "9",
            outcome: "SUCCESS",
            requestId:
                "request-123",
            createdAt:
                new Date(
                    "2026-09-20T08:00:00.000Z",
                ),
        },
    ];

    const prisma = {
        adminAuditEvent: {
            async count({ where }) {
                assert.deepEqual(where, {});

                return 43;
            },

            async findMany(args) {
                assert.deepEqual(args, {
                    where: {},

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

                    skip: 0,
                    take: 20,
                });

                return events;
            },
        },
    };

    const service =
        createAdminAuditReadService(
            prisma,
        );

    const result =
        await service.getEvents({});

    assert.deepEqual(result, {
        items: events,

        pagination: {
            page: 1,
            pageSize: 20,
            total: 43,
            totalPages: 3,
        },
    });
});

test("filters audit events by actor, action, outcome and target type", async () => {
    const expectedWhere = {
        actorUserId: 7,

        action:
            "CONTACT_MESSAGE_STATUS_CHANGED",

        outcome: "SUCCESS",

        targetType:
            "CONTACT_MESSAGE",
    };

    const prisma = {
        adminAuditEvent: {
            async count({ where }) {
                assert.deepEqual(
                    where,
                    expectedWhere,
                );

                return 2;
            },

            async findMany(args) {
                assert.deepEqual(
                    args.where,
                    expectedWhere,
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
        createAdminAuditReadService(
            prisma,
        );

    const result =
        await service.getEvents({
            actorUserId: "7",
            action:
                "CONTACT_MESSAGE_STATUS_CHANGED",
            outcome: "SUCCESS",
            targetType:
                "CONTACT_MESSAGE",
            page: "2",
            pageSize: "20",
        });

    assert.deepEqual(
        result.pagination,
        {
            page: 2,
            pageSize: 20,
            total: 2,
            totalPages: 1,
        },
    );
});

test("rejects invalid audit filters before querying the database", async () => {
    let calls = 0;

    const prisma = {
        adminAuditEvent: {
            async count() {
                calls += 1;
            },

            async findMany() {
                calls += 1;
            },
        },
    };

    const service =
        createAdminAuditReadService(
            prisma,
        );

    const invalidQueries = [
        {
            page: "0",
        },
        {
            pageSize: "101",
        },
        {
            actorUserId: "0",
        },
        {
            outcome: "UNKNOWN",
        },
        {
            action:
                "x".repeat(81),
        },
        {
            targetType:
                "x".repeat(81),
        },
    ];

    for (const query of invalidQueries) {
        await assert.rejects(
            service.getEvents(query),
            (error) =>
                error.statusCode === 400,
        );
    }

    assert.equal(calls, 0);
});

test("returns one audit event with sanitized details", async () => {
    const event = {
        id: 14,
        actorUserId: 7,
        action:
            "CONTACT_MESSAGE_STATUS_CHANGED",
        targetType:
            "CONTACT_MESSAGE",
        targetId: "9",
        outcome: "SUCCESS",
        requestId:
            "request-123",
        details: {
            fromStatus: "NEW",
            toStatus: "READ",
        },
        createdAt:
            new Date(
                "2026-09-20T08:00:00.000Z",
            ),
    };

    const prisma = {
        adminAuditEvent: {
            async findUnique(args) {
                assert.deepEqual(args, {
                    where: {
                        id: 14,
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

                return event;
            },
        },
    };

    const service =
        createAdminAuditReadService(
            prisma,
        );

    const result =
        await service.getEventById(
            "14",
        );

    assert.deepEqual(
        result,
        event,
    );
});

test("returns 404 when an audit event does not exist", async () => {
    const prisma = {
        adminAuditEvent: {
            async findUnique() {
                return null;
            },
        },
    };

    const service =
        createAdminAuditReadService(
            prisma,
        );

    await assert.rejects(
        service.getEventById("999"),
        (error) =>
            error.statusCode === 404 &&
            error.message ===
            "Audit event not found",
    );
});