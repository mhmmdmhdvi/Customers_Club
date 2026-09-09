const test = require("node:test");
const request = require("supertest");
const app = require("../src/app");

test("GET /health returns the API health response", async () => {
    await request(app)
        .get("/health")
        .expect("Content-Type", /json/)
        .expect(200, {
            status: "ok",
            service: "customer-club-api",
        });
});