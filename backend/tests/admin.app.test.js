const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const app = require("../src/app");

test("GET /admin/overview is mounted and rejects unauthenticated requests", async () => {
    const response = await request(app)
        .get("/admin/overview")
        .expect("Content-Type", /json/)
        .expect(401);

    assert.deepEqual(response.body, {
        message:
            "Invalid or expired session",
    });

    assert.equal(
        response.headers["cache-control"],
        "no-store",
    );
});