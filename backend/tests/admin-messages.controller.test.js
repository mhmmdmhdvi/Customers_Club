const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createAdminMessagesController,
} = require(
    "../src/controllers/admin-messages.controller.factory",
);

const {
    AdminMessagesError,
} = require(
    "../src/services/admin-messages.service.factory",
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

test("messages returns the paginated message list", async () => {
    const result = {
        items: [
            {
                id: 9,
                name: "خسرو وفایی",
                phone: "09121234567",
                email: "test@example.com",
                subject: "SUPPORT",
                status: "NEW",
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
        createAdminMessagesController({
            adminMessagesService: {
                async getMessages(query) {
                    assert.deepEqual(
                        query,
                        {
                            status: "NEW",
                        },
                    );

                    return result;
                },

                async getMessageById() {
                    assert.fail(
                        "detail service should not run",
                    );
                },
            },
        });

    const res = response();

    await controller.messages(
        {
            query: {
                status: "NEW",
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

test("message returns one full contact message", async () => {
    const message = {
        id: 9,
        name: "خسرو وفایی",
        phone: "09121234567",
        email: "test@example.com",
        subject: "SUPPORT",
        message: "متن کامل پیام مشتری",
        status: "NEW",
    };

    const controller =
        createAdminMessagesController({
            adminMessagesService: {
                async getMessages() {
                    assert.fail(
                        "list service should not run",
                    );
                },

                async getMessageById(id) {
                    assert.equal(id, "9");

                    return message;
                },
            },
        });

    const res = response();

    await controller.message(
        {
            params: {
                id: "9",
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
        message,
    );

    assert.equal(
        res.headers["Cache-Control"],
        "no-store",
    );
});

test("messages maps expected validation errors", async () => {
    const controller =
        createAdminMessagesController({
            adminMessagesService: {
                async getMessages() {
                    throw new AdminMessagesError(
                        "Invalid status",
                    );
                },
            },
        });

    const res = response();

    await controller.messages(
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
            message: "Invalid status",
        },
    );
});

test("message maps missing records to 404", async () => {
    const controller =
        createAdminMessagesController({
            adminMessagesService: {
                async getMessageById() {
                    throw new AdminMessagesError(
                        "Contact message not found",
                        404,
                    );
                },
            },
        });

    const res = response();

    await controller.message(
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
                "Contact message not found",
        },
    );
});

test("messages does not expose unexpected database errors", async (t) => {
    const log = t.mock.method(
        console,
        "error",
        () => { },
    );

    const controller =
        createAdminMessagesController({
            adminMessagesService: {
                async getMessages() {
                    throw new Error(
                        "database password secret-value",
                    );
                },
            },
        });

    const res = response();

    await controller.messages(
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

test("updates a contact message status using the authenticated admin identity", async () => {
    const updated = {
        id: 9,
        status: "READ",
        updatedAt:
            "2026-09-20T06:00:00.000Z",
    };

    const controller =
        createAdminMessagesController({
            adminMessagesService: {
                async updateMessageStatus(input) {
                    assert.deepEqual(input, {
                        id: "9",
                        status: "READ",
                        actorUserId: 7,
                        requestId:
                            "request-123",
                    });

                    return updated;
                },
            },
        });

    const res = response();

    await controller.updateMessageStatus(
        {
            params: {
                id: "9",
            },

            body: {
                status: "READ",
            },

            auth: {
                user: {
                    id: 7,
                    role: "ADMIN",
                },
            },

            requestId:
                "request-123",
        },
        res,
    );

    assert.equal(
        res.statusCode,
        200,
    );

    assert.deepEqual(
        res.body,
        updated,
    );

    assert.equal(
        res.headers["Cache-Control"],
        "no-store",
    );
});

test("status update maps invalid transitions to 409", async () => {
    const controller =
        createAdminMessagesController({
            adminMessagesService: {
                async updateMessageStatus() {
                    throw new AdminMessagesError(
                        "Invalid contact message status transition",
                        409,
                    );
                },
            },
        });

    const res = response();

    await controller.updateMessageStatus(
        {
            params: {
                id: "9",
            },

            body: {
                status: "RESOLVED",
            },

            auth: {
                user: {
                    id: 7,
                    role: "ADMIN",
                },
            },
        },
        res,
    );

    assert.equal(
        res.statusCode,
        409,
    );

    assert.deepEqual(res.body, {
        message:
            "Invalid contact message status transition",
    });
});

test("status update does not expose unexpected internal errors", async (t) => {
    const log = t.mock.method(
        console,
        "error",
        () => { },
    );

    const controller =
        createAdminMessagesController({
            adminMessagesService: {
                async updateMessageStatus() {
                    throw new Error(
                        "database password secret-value",
                    );
                },
            },
        });

    const res = response();

    await controller.updateMessageStatus(
        {
            params: {
                id: "9",
            },

            body: {
                status: "READ",
            },

            auth: {
                user: {
                    id: 7,
                    role: "ADMIN",
                },
            },
        },
        res,
    );

    assert.equal(
        res.statusCode,
        500,
    );

    assert.deepEqual(res.body, {
        message:
            "Internal server error",
    });

    assert.ok(
        !JSON.stringify(
            log.mock.calls,
        ).includes(
            "secret-value",
        ),
    );
});