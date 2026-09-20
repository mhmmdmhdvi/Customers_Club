const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createAdminAuditReadController,
} = require(
    "../src/controllers/admin-audit-read.controller.factory",
);

const {
    AdminAuditReadError,
} = require(
    "../src/services/admin-audit-read.service.factory",
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

test("audit returns the paginated audit event list", async () => {
    const result = {
        items: [
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
        createAdminAuditReadController({
            adminAuditReadService: {
                async getEvents(query) {
                    assert.deepEqual(
                        query,
                        {
                            outcome:
                                "SUCCESS",
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

    await controller.audit(
        {
            query: {
                outcome: "SUCCESS",
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

test("auditEvent returns one audit event with details", async () => {
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
    };

    const controller =
        createAdminAuditReadController({
            adminAuditReadService: {
                async getEvents() {
                    assert.fail(
                        "list service should not run",
                    );
                },

                async getEventById(id) {
                    assert.equal(
                        id,
                        "14",
                    );

                    return event;
                },
            },
        });

    const res = response();

    await controller.auditEvent(
        {
            params: {
                id: "14",
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

test("audit maps invalid filters to 400", async () => {
    const controller =
        createAdminAuditReadController({
            adminAuditReadService: {
                async getEvents() {
                    throw new AdminAuditReadError(
                        "Invalid outcome",
                    );
                },
            },
        });

    const res = response();

    await controller.audit(
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
                "Invalid outcome",
        },
    );
});

test("auditEvent maps missing records to 404", async () => {
    const controller =
        createAdminAuditReadController({
            adminAuditReadService: {
                async getEventById() {
                    throw new AdminAuditReadError(
                        "Audit event not found",
                        404,
                    );
                },
            },
        });

    const res = response();

    await controller.auditEvent(
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
                "Audit event not found",
        },
    );
});

test("audit does not expose unexpected database errors", async (t) => {
    const log = t.mock.method(
        console,
        "error",
        () => { },
    );

    const controller =
        createAdminAuditReadController({
            adminAuditReadService: {
                async getEvents() {
                    throw new Error(
                        "database password secret-value",
                    );
                },
            },
        });

    const res = response();

    await controller.audit(
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