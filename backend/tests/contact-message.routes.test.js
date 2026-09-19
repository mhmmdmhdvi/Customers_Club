const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");

const {
    createContactMessageRoutes,
} = require(
    "../src/routes/contact-message.routes.factory",
);

const {
    ContactMessageError,
} = require(
    "../src/services/contact-message.service.factory",
);

function createApp(service) {
    const app = express();

    app.use(express.json());

    app.use(
        "/contact",
        createContactMessageRoutes({
            contactMessageService: service,
        }),
    );

    return app;
}

test("POST /contact/messages creates a public contact message", async () => {
    const input = {
        name: "خسرو وفایی",
        phone: "09121234567",
        email: null,
        subject: "SUPPORT",
        message: "لطفاً با من تماس بگیرید.",
    };

    let received;

    const app = createApp({
        async createMessage(data) {
            received = data;

            return {
                id: 1,
                ...data,
                status: "NEW",
            };
        },
    });

    const response = await request(app)
        .post("/contact/messages")
        .send(input)
        .expect("Content-Type", /json/)
        .expect(201);

    assert.deepEqual(received, input);

    assert.deepEqual(response.body, {
        message: "Contact message received",
    });

    assert.equal(
        response.headers["cache-control"],
        "no-store",
    );
});

test("POST /contact/messages maps validation errors to 400", async () => {
    const app = createApp({
        async createMessage() {
            throw new ContactMessageError(
                "Invalid phone number",
            );
        },
    });

    const response = await request(app)
        .post("/contact/messages")
        .send({})
        .expect("Content-Type", /json/)
        .expect(400);

    assert.deepEqual(response.body, {
        message: "Invalid phone number",
    });
});