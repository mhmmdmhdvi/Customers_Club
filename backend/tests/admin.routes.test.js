const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");

const {
    createAdminRoutes,
} = require(
    "../src/routes/admin.routes.factory",
);

function fixture() {
    let overviewCalls = 0;

    const config = {
        allowedOrigins: [
            "http://localhost:5173",
        ],
    };

    const sessionService = {
        async authenticate(token) {
            if (token === "admin.token.here") {
                return {
                    user: {
                        id: 1,
                        role: "ADMIN",
                    },
                    sessionId: "admin-session",
                };
            }

            if (token === "member.token.here") {
                return {
                    user: {
                        id: 2,
                        role: "MEMBER",
                    },
                    sessionId: "member-session",
                };
            }

            throw new Error(
                "Unexpected test token",
            );
        },
    };

    const controller = {
        security(req, res) {
            return res.status(200).json({
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
            });
        },

        securityEvent(req, res) {
            return res.status(200).json({
                id: Number(req.params.id),
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
            });
        },
        audit(req, res) {
            return res.status(200).json({
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
            });
        },

        auditEvent(req, res) {
            return res.status(200).json({
                id: Number(req.params.id),
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
            });
        },
        updateMessageStatus(req, res) {
            return res.status(200).json({
                id: Number(req.params.id),
                status: req.body.status,
            });
        },
        messages(req, res) {
            return res.status(200).json({
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
            });
        },

        message(req, res) {
            return res.status(200).json({
                id: Number(req.params.id),
                name: "خسرو وفایی",
                phone: "09121234567",
                email: "test@example.com",
                subject: "SUPPORT",
                message: "متن کامل پیام مشتری",
                status: "NEW",
            });
        },

        users(req, res) {
            return res.status(200).json({
                items: [
                    {
                        id: 12,
                        phone: "09121234567",
                        firstName: "خسرو",
                        lastName: "وفایی",
                        role: "MEMBER",
                    },
                ],
                pagination: {
                    page: 1,
                    pageSize: 20,
                    total: 1,
                    totalPages: 1,
                },
            });
        },
        overview(req, res) {
            overviewCalls += 1;

            return res.status(200).json({
                members: {
                    total: 120,
                    newLast7Days: 4,
                },
                messages: {
                    total: 42,
                    new: 7,
                },
                sessions: {
                    active: 18,
                },
            });
        },
    };

    const app = express();

    app.use(express.json());

    app.use(
        "/admin",
        createAdminRoutes({
            controller,
            sessionService,
            getConfig: () => config,
        }),
    );

    return {
        app,
        getOverviewCalls() {
            return overviewCalls;
        },
    };
}

test("GET /admin/overview rejects unauthenticated requests", async () => {
    const {
        app,
        getOverviewCalls,
    } = fixture();

    const response = await request(app)
        .get("/admin/overview")
        .expect("Content-Type", /json/)
        .expect(401);

    assert.deepEqual(response.body, {
        message:
            "Invalid or expired session",
    });

    assert.equal(
        getOverviewCalls(),
        0,
    );
});

test("GET /admin/overview rejects MEMBER sessions", async () => {
    const {
        app,
        getOverviewCalls,
    } = fixture();

    const response = await request(app)
        .get("/admin/overview")
        .set(
            "Authorization",
            "Bearer member.token.here",
        )
        .expect("Content-Type", /json/)
        .expect(403);

    assert.deepEqual(response.body, {
        message: "Forbidden",
    });

    assert.equal(
        getOverviewCalls(),
        0,
    );
});

test("GET /admin/overview allows ADMIN sessions", async () => {
    const {
        app,
        getOverviewCalls,
    } = fixture();

    const response = await request(app)
        .get("/admin/overview")
        .set(
            "Authorization",
            "Bearer admin.token.here",
        )
        .expect("Content-Type", /json/)
        .expect(200);

    assert.deepEqual(response.body, {
        members: {
            total: 120,
            newLast7Days: 4,
        },
        messages: {
            total: 42,
            new: 7,
        },
        sessions: {
            active: 18,
        },
    });

    assert.equal(
        getOverviewCalls(),
        1,
    );

    assert.equal(
        response.headers["cache-control"],
        "no-store",
    );
});

test("GET /admin/users rejects unauthenticated requests", async () => {
    const { app } = fixture();

    const response = await request(app)
        .get("/admin/users")
        .expect("Content-Type", /json/)
        .expect(401);

    assert.deepEqual(response.body, {
        message:
            "Invalid or expired session",
    });
});

test("GET /admin/users rejects MEMBER sessions", async () => {
    const { app } = fixture();

    const response = await request(app)
        .get("/admin/users")
        .set(
            "Authorization",
            "Bearer member.token.here",
        )
        .expect("Content-Type", /json/)
        .expect(403);

    assert.deepEqual(response.body, {
        message: "Forbidden",
    });
});

test("GET /admin/users allows ADMIN sessions", async () => {
    const { app } = fixture();

    const response = await request(app)
        .get("/admin/users")
        .set(
            "Authorization",
            "Bearer admin.token.here",
        )
        .expect("Content-Type", /json/)
        .expect(200);

    assert.deepEqual(response.body, {
        items: [
            {
                id: 12,
                phone: "09121234567",
                firstName: "خسرو",
                lastName: "وفایی",
                role: "MEMBER",
            },
        ],
        pagination: {
            page: 1,
            pageSize: 20,
            total: 1,
            totalPages: 1,
        },
    });
});

test("GET /admin/messages allows ADMIN sessions", async () => {
    const { app } = fixture();

    const response = await request(app)
        .get("/admin/messages")
        .set(
            "Authorization",
            "Bearer admin.token.here",
        )
        .expect("Content-Type", /json/)
        .expect(200);

    assert.deepEqual(
        response.body.pagination,
        {
            page: 1,
            pageSize: 20,
            total: 1,
            totalPages: 1,
        },
    );

    assert.equal(
        response.body.items[0].status,
        "NEW",
    );
});

test("GET /admin/messages/:id allows ADMIN sessions", async () => {
    const { app } = fixture();

    const response = await request(app)
        .get("/admin/messages/9")
        .set(
            "Authorization",
            "Bearer admin.token.here",
        )
        .expect("Content-Type", /json/)
        .expect(200);

    assert.deepEqual(response.body, {
        id: 9,
        name: "خسرو وفایی",
        phone: "09121234567",
        email: "test@example.com",
        subject: "SUPPORT",
        message: "متن کامل پیام مشتری",
        status: "NEW",
    });
});

test("GET /admin/messages remains protected for MEMBER sessions", async () => {
    const { app } = fixture();

    const response = await request(app)
        .get("/admin/messages")
        .set(
            "Authorization",
            "Bearer member.token.here",
        )
        .expect("Content-Type", /json/)
        .expect(403);

    assert.deepEqual(response.body, {
        message: "Forbidden",
    });
});

test("GET /admin/messages/:id remains protected without authentication", async () => {
    const { app } = fixture();

    const response = await request(app)
        .get("/admin/messages/9")
        .expect("Content-Type", /json/)
        .expect(401);

    assert.deepEqual(response.body, {
        message:
            "Invalid or expired session",
    });
});

test("PATCH /admin/messages/:id/status allows a protected ADMIN JSON request", async () => {
    const { app } = fixture();

    const response = await request(app)
        .patch("/admin/messages/9/status")
        .set(
            "Authorization",
            "Bearer admin.token.here",
        )
        .set(
            "Origin",
            "http://localhost:5173",
        )
        .set(
            "X-CSRF-Protection",
            "1",
        )
        .send({
            status: "READ",
        })
        .expect("Content-Type", /json/)
        .expect(200);

    assert.deepEqual(response.body, {
        id: 9,
        status: "READ",
    });
});

test("PATCH /admin/messages/:id/status rejects a missing CSRF header", async () => {
    const { app } = fixture();

    const response = await request(app)
        .patch("/admin/messages/9/status")
        .set(
            "Authorization",
            "Bearer admin.token.here",
        )
        .set(
            "Origin",
            "http://localhost:5173",
        )
        .send({
            status: "READ",
        })
        .expect("Content-Type", /json/)
        .expect(403);

    assert.deepEqual(response.body, {
        message:
            "CSRF protection header required",
    });
});

test("PATCH /admin/messages/:id/status rejects an untrusted origin", async () => {
    const { app } = fixture();

    const response = await request(app)
        .patch("/admin/messages/9/status")
        .set(
            "Authorization",
            "Bearer admin.token.here",
        )
        .set(
            "Origin",
            "https://attacker.test",
        )
        .set(
            "X-CSRF-Protection",
            "1",
        )
        .send({
            status: "READ",
        })
        .expect("Content-Type", /json/)
        .expect(403);

    assert.deepEqual(response.body, {
        message:
            "Request origin is not allowed",
    });
});

test("PATCH /admin/messages/:id/status rejects non-JSON bodies", async () => {
    const { app } = fixture();

    const response = await request(app)
        .patch("/admin/messages/9/status")
        .set(
            "Authorization",
            "Bearer admin.token.here",
        )
        .set(
            "Origin",
            "http://localhost:5173",
        )
        .set(
            "X-CSRF-Protection",
            "1",
        )
        .type("form")
        .send({
            status: "READ",
        })
        .expect("Content-Type", /json/)
        .expect(415);

    assert.deepEqual(response.body, {
        message: "JSON request required",
    });
});

test("GET /admin/audit allows ADMIN sessions", async () => {
    const { app } = fixture();

    const response = await request(app)
        .get("/admin/audit")
        .set(
            "Authorization",
            "Bearer admin.token.here",
        )
        .expect("Content-Type", /json/)
        .expect(200);

    assert.deepEqual(
        response.body.pagination,
        {
            page: 1,
            pageSize: 20,
            total: 1,
            totalPages: 1,
        },
    );

    assert.equal(
        response.body.items[0].outcome,
        "SUCCESS",
    );
});

test("GET /admin/audit/:id allows ADMIN sessions", async () => {
    const { app } = fixture();

    const response = await request(app)
        .get("/admin/audit/14")
        .set(
            "Authorization",
            "Bearer admin.token.here",
        )
        .expect("Content-Type", /json/)
        .expect(200);

    assert.deepEqual(response.body, {
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
    });
});

test("GET /admin/audit remains protected for MEMBER sessions", async () => {
    const { app } = fixture();

    const response = await request(app)
        .get("/admin/audit")
        .set(
            "Authorization",
            "Bearer member.token.here",
        )
        .expect("Content-Type", /json/)
        .expect(403);

    assert.deepEqual(response.body, {
        message: "Forbidden",
    });
});

test("GET /admin/audit/:id remains protected without authentication", async () => {
    const { app } = fixture();

    const response = await request(app)
        .get("/admin/audit/14")
        .expect("Content-Type", /json/)
        .expect(401);

    assert.deepEqual(response.body, {
        message:
            "Invalid or expired session",
    });
});

test("GET /admin/security allows ADMIN sessions", async () => {
    const { app } = fixture();

    const response = await request(app)
        .get("/admin/security")
        .set(
            "Authorization",
            "Bearer admin.token.here",
        )
        .expect("Content-Type", /json/)
        .expect(200);

    assert.equal(
        response.body.items[0].statusCode,
        401,
    );

    assert.deepEqual(
        response.body.pagination,
        {
            page: 1,
            pageSize: 20,
            total: 1,
            totalPages: 1,
        },
    );
});

test("GET /admin/security/:id allows ADMIN sessions", async () => {
    const { app } = fixture();

    const response = await request(app)
        .get("/admin/security/21")
        .set(
            "Authorization",
            "Bearer admin.token.here",
        )
        .expect("Content-Type", /json/)
        .expect(200);

    assert.deepEqual(response.body, {
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
    });
});