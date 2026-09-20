const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const app = require("../src/app");

test("the application assigns a request id to every response", async () => {
    const response = await request(app)
        .get("/health")
        .set(
            "X-Request-Id",
            "client-controlled-id",
        )
        .expect(200);

    const requestId =
        response.headers["x-request-id"];

    assert.equal(
        typeof requestId,
        "string",
    );

    assert.match(
        requestId,
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    assert.notEqual(
        requestId,
        "client-controlled-id",
    );
});