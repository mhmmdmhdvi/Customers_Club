const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createAdminSecurityReadController,
} = require(
    "../src/controllers/admin-security-read.controller.factory",
);

const {
    AdminSecurityReadError,
} = require(
    "../src/services/admin-security-read.service.factory",
);

function response() {
    return {
        statusCode: 200,
        headers: {},
        body: null,

        set(name, value) {
            this.headers[name] = value;
            return this;
        },

        status(value) {
            this.statusCode = value;
            return this;
        },

        json(value) {
            this.body = value;
            return this;
        },
    };
}

test("security returns the paginated security event list", async () => {
    const result = {
        items: [
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
            },
        ],

        pagination: {
            page: 1,
            pageSize: 20,
            total: 1,
            totalPages: 1,
        },
    };

    const controller =
        createAdminSecurityReadController({
            adminSecurityReadService: {
                async getEvents(query) {
                    assert.deepEqual(
                        query,
                        {
                            outcome:
                                "FAILURE",
                        },
                    );

                    return result;
                },

                async getEventById() {
                    assert.fail(
                        "detail service should not run",
                    );
                },
            },
        });

    const res = response();

    await controller.security(
        {
            query: {
                outcome: "FAILURE",
            },
        },
        res,
    );

    assert.equal(
        res.statusCode,
        200,
    );

    assert.deepEqual(
        res.body,
        result,
    );

    assert.equal(
        res.headers["Cache-Control"],
        "no-store",
    );
});

test("securityEvent returns one event with details", async () => {
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
    };

    const controller =
        createAdminSecurityReadController({
            adminSecurityReadService: {
                async getEvents() {
                    assert.fail(
                        "list service should not run",
                    );
                },

                async getEventById(id) {
                    assert.equal(
                        id,
                        "21",
                    );

                    return event;
                },
            },
        });

    const res = response();

    await controller.securityEvent(
        {
            params: {
                id: "21",
            },
        },
        res,
    );

    assert.equal(
        res.statusCode,
        200,
    );

    assert.deepEqual(
        res.body,
        event,
    );

    assert.equal(
        res.headers["Cache-Control"],
        "no-store",
    );
});

test("security maps invalid filters to 400", async () => {
    const controller =
        createAdminSecurityReadController({
            adminSecurityReadService: {
                async getEvents() {
                    throw new AdminSecurityReadError(
                        "Invalid status code",
                    );
                },
            },
        });

    const res = response();

    await controller.security(
        {
            query: {},
        },
        res,
    );

    assert.equal(
        res.statusCode,
        400,
    );

    assert.deepEqual(
        res.body,
        {
            message:
                "Invalid status code",
        },
    );
});

test("securityEvent maps missing records to 404", async () => {
    const controller =
        createAdminSecurityReadController({
            adminSecurityReadService: {
                async getEventById() {
                    throw new AdminSecurityReadError(
                        "Security event not found",
                        404,
                    );
                },
            },
        });

    const res = response();

    await controller.securityEvent(
        {
            params: {
                id: "999",
            },
        },
        res,
    );

    assert.equal(
        res.statusCode,
        404,
    );

    assert.deepEqual(
        res.body,
        {
            message:
                "Security event not found",
        },
    );
});

test("security does not expose unexpected database errors", async (t) => {
    const log = t.mock.method(
        console,
        "error",
        () => { },
    );

    const controller =
        createAdminSecurityReadController({
            adminSecurityReadService: {
                async getEvents() {
                    throw new Error(
                        "database password secret-value",
                    );
                },
            },
        });

    const res = response();

    await controller.security(
        {
            query: {},
        },
        res,
    );

    assert.equal(
        res.statusCode,
        500,
    );

    assert.deepEqual(
        res.body,
        {
            message:
                "Internal server error",
        },
    );

    assert.ok(
        !JSON.stringify(
            log.mock.calls,
        ).includes(
            "secret-value",
        ),
    );
});