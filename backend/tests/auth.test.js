const test = require("node:test");
const request = require("supertest");
const app = require("../src/app");

test("POST /auth/request-code rejects a missing phone number", async () => {
    await request(app)
        .post("/auth/request-code")
        .send({})
        .expect("Content-Type", /json/)
        .expect(400, {
            message: "Phone is required",
        });
});

test("POST /auth/request-code rejects an invalid phone prefix", async () => {
    await request(app)
        .post("/auth/request-code")
        .send({ phone: "08121234567" })
        .expect("Content-Type", /json/)
        .expect(400, {
            message: "Invalid phone number",
        });
});

test("POST /auth/request-code rejects a phone number sent as an array", async () => {
    await request(app)
        .post("/auth/request-code")
        .send({ phone: ["09121234567"] })
        .expect("Content-Type", /json/)
        .expect(400, {
            message: "Invalid phone number",
        });
});

test("POST /auth/verify-code rejects a missing code", async () => {
    await request(app)
        .post("/auth/verify-code")
        .send({ phone: "09121234567" })
        .expect("Content-Type", /json/)
        .expect(400, {
            message: "Code is required",
        });
});

test("POST /auth/verify-code rejects a code shorter than six digits", async () => {
    await request(app)
        .post("/auth/verify-code")
        .send({
            phone: "09121234567",
            code: "12345",
        })
        .expect("Content-Type", /json/)
        .expect(400, {
            message: "Code must contain exactly 6 digits",
        });
});

test("POST /auth/verify-code rejects a code longer than six digits", async () => {
    await request(app)
        .post("/auth/verify-code")
        .send({
            phone: "09121234567",
            code: "1234567",
        })
        .expect("Content-Type", /json/)
        .expect(400, {
            message: "Code must contain exactly 6 digits",
        });
});

test("POST /auth/verify-code rejects a code containing a letter", async () => {
    await request(app)
        .post("/auth/verify-code")
        .send({
            phone: "09121234567",
            code: "12345a",
        })
        .expect("Content-Type", /json/)
        .expect(400, {
            message: "Code must contain exactly 6 digits",
        });
});

test("POST /auth/verify-code rejects a code sent as a number", async () => {
    await request(app)
        .post("/auth/verify-code")
        .send({
            phone: "09121234567",
            code: 123456,
        })
        .expect("Content-Type", /json/)
        .expect(400, {
            message: "Code must contain exactly 6 digits",
        });
});

test("POST /auth/verify-code rejects a missing phone number", async () => {
    await request(app)
        .post("/auth/verify-code")
        .send({ code: "123456" })
        .expect("Content-Type", /json/)
        .expect(400, {
            message: "Phone is required",
        });
});

test("POST /auth/verify-code rejects an invalid phone prefix", async () => {
    await request(app)
        .post("/auth/verify-code")
        .send({
            phone: "08121234567",
            code: "123456",
        })
        .expect("Content-Type", /json/)
        .expect(400, {
            message: "Invalid phone number",
        });
});

test("POST /auth/verify-code rejects a phone number sent as an array", async () => {
    await request(app)
        .post("/auth/verify-code")
        .send({
            phone: ["09121234567"],
            code: "123456",
        })
        .expect("Content-Type", /json/)
        .expect(400, {
            message: "Invalid phone number",
        });
});