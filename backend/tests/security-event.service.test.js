const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createSecurityEventService,
} = require(
    "../src/services/security-event.service.factory",
);

test("records a sanitized security event", async () => {
    let createdData;

    const prisma = {
        securityEvent: {
            async create({ data }) {
                createdData = data;

                return {
                    id: 1,
                    ...data,
                };
            },
        },
    };

    const service =
        createSecurityEventService(prisma);

    const result =
        await service.record({
            eventType:
                "AUTHENTICATION_REJECTED",
            outcome: "FAILURE",
            actorUserId: null,
            requestId:
                "2bcf5c08-48b9-44a3-9a09-b28101be5bfd",
            route:
                "/admin/overview",
            statusCode: 401,
            details: {
                reason:
                    "INVALID_SESSION",
            },
        });

    assert.deepEqual(createdData, {
        eventType:
            "AUTHENTICATION_REJECTED",
        outcome: "FAILURE",
        actorUserId: null,
        requestId:
            "2bcf5c08-48b9-44a3-9a09-b28101be5bfd",
        route:
            "/admin/overview",
        statusCode: 401,
        details: {
            reason:
                "INVALID_SESSION",
        },
    });

    assert.equal(
        result.eventType,
        "AUTHENTICATION_REJECTED",
    );
});

test("allows authenticated security events with a user id", async () => {
    let createdData;

    const prisma = {
        securityEvent: {
            async create({ data }) {
                createdData = data;

                return {
                    id: 2,
                    ...data,
                };
            },
        },
    };

    const service =
        createSecurityEventService(prisma);

    await service.record({
        eventType:
            "ADMIN_ACCESS_FORBIDDEN",
        outcome: "FAILURE",
        actorUserId: 14,
        requestId:
            "request-123",
        route: "/admin/users",
        statusCode: 403,
    });

    assert.equal(
        createdData.actorUserId,
        14,
    );
});

test("rejects invalid security events before writing", async () => {
    let writes = 0;

    const prisma = {
        securityEvent: {
            async create() {
                writes += 1;
            },
        },
    };

    const service =
        createSecurityEventService(prisma);

    const invalidEvents = [
        {
            eventType: "",
            outcome: "FAILURE",
            route: "/auth/login",
            statusCode: 401,
        },
        {
            eventType:
                "AUTHENTICATION_REJECTED",
            outcome: "UNKNOWN",
            route: "/auth/login",
            statusCode: 401,
        },
        {
            eventType:
                "AUTHENTICATION_REJECTED",
            outcome: "FAILURE",
            actorUserId: 0,
            route: "/auth/login",
            statusCode: 401,
        },
        {
            eventType:
                "AUTHENTICATION_REJECTED",
            outcome: "FAILURE",
            route: "",
            statusCode: 401,
        },
        {
            eventType:
                "AUTHENTICATION_REJECTED",
            outcome: "FAILURE",
            route: "/auth/login",
            statusCode: 99,
        },
    ];

    for (const event of invalidEvents) {
        await assert.rejects(
            service.record(event),
            (error) =>
                error.statusCode === 400,
        );
    }

    assert.equal(writes, 0);
});

test("rejects sensitive security-event detail keys", async () => {
    let writes = 0;

    const prisma = {
        securityEvent: {
            async create() {
                writes += 1;
            },
        },
    };

    const service =
        createSecurityEventService(prisma);

    for (const details of [
        {
            accessToken: "secret",
        },
        {
            refreshToken: "secret",
        },
        {
            authorization:
                "Bearer secret",
        },
        {
            cookie: "secret",
        },
        {
            otpCode: "123456",
        },
        {
            password: "secret",
        },
        {
            message:
                "customer message body",
        },
    ]) {
        await assert.rejects(
            service.record({
                eventType:
                    "AUTHENTICATION_REJECTED",
                outcome: "FAILURE",
                route:
                    "/auth/login",
                statusCode: 401,
                details,
            }),
            (error) =>
                error.statusCode === 400,
        );
    }

    assert.equal(writes, 0);
});