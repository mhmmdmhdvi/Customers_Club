const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createAdminSecurityReadService,
} = require(
    "../src/services/admin-security-read.service.factory",
);

test("returns paginated security events ordered newest first", async () => {
    const events = [
        {
            id: 21,
            eventType:
                "AUTHENTICATION_REJECTED",
            outcome: "FAILURE",
            actorUserId: null,
            requestId:
                "request-123",
            route:
                "/admin/overview",
            statusCode: 401,
            createdAt:
                new Date(
                    "2026-09-20T09:00:00.000Z",
                ),
        },
    ];

    const prisma = {
        securityEvent: {
            async count({ where }) {
                assert.deepEqual(
                    where,
                    {},
                );

                return 51;
            },

            async findMany(args) {
                assert.deepEqual(args, {
                    where: {},

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
        createAdminSecurityReadService(
            prisma,
        );

    const result =
        await service.getEvents({});

    assert.deepEqual(result, {
        items: events,

        pagination: {
            page: 1,
            pageSize: 20,
            total: 51,
            totalPages: 3,
        },
    });
});

test("filters security events for the monitoring table", async () => {
    const expectedWhere = {
        eventType:
            "AUTHENTICATION_REJECTED",
        outcome: "FAILURE",
        statusCode: 401,
        actorUserId: 7,
        requestId:
            "request-123",
    };

    const prisma = {
        securityEvent: {
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
        createAdminSecurityReadService(
            prisma,
        );

    const result =
        await service.getEvents({
            eventType:
                "AUTHENTICATION_REJECTED",
            outcome: "FAILURE",
            statusCode: "401",
            actorUserId: "7",
            requestId:
                "request-123",
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

test("rejects invalid security filters before querying the database", async () => {
    let calls = 0;

    const prisma = {
        securityEvent: {
            async count() {
                calls += 1;
            },

            async findMany() {
                calls += 1;
            },
        },
    };

    const service =
        createAdminSecurityReadService(
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
            statusCode: "99",
        },
        {
            statusCode: "600",
        },
        {
            outcome: "UNKNOWN",
        },
        {
            eventType:
                "x".repeat(81),
        },
        {
            requestId:
                "x".repeat(129),
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

test("returns one security event with sanitized details", async () => {
    const event = {
        id: 21,
        eventType:
            "AUTHENTICATION_REJECTED",
        outcome: "FAILURE",
        actorUserId: null,
        requestId:
            "request-123",
        route:
            "/admin/overview",
        statusCode: 401,
        details: {
            reason:
                "INVALID_AUTHORIZATION_HEADER",
        },
        createdAt:
            new Date(
                "2026-09-20T09:00:00.000Z",
            ),
    };

    const prisma = {
        securityEvent: {
            async findUnique(args) {
                assert.deepEqual(args, {
                    where: {
                        id: 21,
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

                return event;
            },
        },
    };

    const service =
        createAdminSecurityReadService(
            prisma,
        );

    const result =
        await service.getEventById(
            "21",
        );

    assert.deepEqual(
        result,
        event,
    );
});

test("returns 404 when a security event does not exist", async () => {
    const prisma = {
        securityEvent: {
            async findUnique() {
                return null;
            },
        },
    };

    const service =
        createAdminSecurityReadService(
            prisma,
        );

    await assert.rejects(
        service.getEventById("999"),
        (error) =>
            error.statusCode === 404 &&
            error.message ===
            "Security event not found",
    );
});