const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createContactMessageController,
} = require(
    "../src/controllers/contact-message.controller.factory",
);

const {
    ContactMessageError,
} = require(
    "../src/services/contact-message.service.factory",
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

test("create returns 201 without echoing submitted personal data", async () => {
    const input = {
        name: "خسرو وفایی",
        phone: "09121234567",
        email: "test@example.com",
        subject: "SUPPORT",
        message: "لطفاً با من تماس بگیرید.",
    };

    const api = createContactMessageController({
        contactMessageService: {
            async createMessage(data) {
                assert.deepEqual(data, input);

                return {
                    id: 7,
                    ...data,
                    status: "NEW",
                };
            },
        },
    });

    const res = response();

    await api.create(
        {
            body: input,
        },
        res,
    );

    assert.equal(res.statusCode, 201);

    assert.deepEqual(res.body, {
        message: "Contact message received",
    });

    assert.equal(
        res.headers["Cache-Control"],
        "no-store",
    );

    assert.ok(
        !JSON.stringify(res.body).includes(
            "09121234567",
        ),
    );

    assert.ok(
        !JSON.stringify(res.body).includes(
            "test@example.com",
        ),
    );
});

test("create maps expected validation errors to 400", async () => {
    const api = createContactMessageController({
        contactMessageService: {
            async createMessage() {
                throw new ContactMessageError(
                    "Invalid phone number",
                );
            },
        },
    });

    const res = response();

    await api.create(
        {
            body: {},
        },
        res,
    );

    assert.equal(res.statusCode, 400);

    assert.deepEqual(res.body, {
        message: "Invalid phone number",
    });

    assert.equal(
        res.headers["Cache-Control"],
        "no-store",
    );
});

test("create does not expose unexpected backend errors", async (t) => {
    const log = t.mock.method(
        console,
        "error",
        () => {},
    );

    const api = createContactMessageController({
        contactMessageService: {
            async createMessage() {
                throw new Error(
                    "database password secret-value",
                );
            },
        },
    });

    const res = response();

    await api.create(
        {
            body: {},
        },
        res,
    );

    assert.equal(res.statusCode, 500);

    assert.deepEqual(res.body, {
        message: "Internal server error",
    });

    assert.equal(
        res.headers["Cache-Control"],
        "no-store",
    );

    assert.ok(
        !JSON.stringify(log.mock.calls).includes(
            "secret-value",
        ),
    );
});