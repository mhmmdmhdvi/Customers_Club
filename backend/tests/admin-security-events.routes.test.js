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
    const events = [];

    const securityEventService = {
        async record(event) {
            events.push(event);

            return {
                id: events.length,
                ...event,
            };
        },
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

    const ok = (_req, res) =>
        res.status(200).json({
            ok: true,
        });

    const controller = {
        overview: ok,
        users: ok,
        messages: ok,
        message: ok,
        audit: ok,
        auditEvent: ok,
        security: ok,
        securityEvent: ok,
        updateMessageStatus: ok,
    };

    const config = {
        allowedOrigins: [
            "http://localhost:5173",
        ],
    };

    const app = express();

    app.use(express.json());

    app.use((req, _res, next) => {
        req.requestId =
            "request-123";

        next();
    });

    app.use(
        "/admin",
        createAdminRoutes({
            controller,
            sessionService,
            getConfig: () => config,
            securityEventService,
        }),
    );

    return {
        app,
        events,
    };
}

test("records rejected unauthenticated admin access", async () => {
    const {
        app,
        events,
    } = fixture();

    await request(app)
        .get("/admin/overview")
        .expect(401);

    assert.deepEqual(events, [
        {
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
        },
    ]);
});

test("records MEMBER attempts to access ADMIN routes", async () => {
    const {
        app,
        events,
    } = fixture();

    await request(app)
        .get("/admin/users")
        .set(
            "Authorization",
            "Bearer member.token.here",
        )
        .expect(403);

    assert.deepEqual(events, [
        {
            eventType:
                "AUTHORIZATION_REJECTED",

            outcome: "FAILURE",

            actorUserId: 2,

            requestId:
                "request-123",

            route:
                "/admin/users",

            statusCode: 403,

            details: {
                requiredRoles: [
                    "ADMIN",
                ],
            },
        },
    ]);
});

test("records rejected CSRF attempts on admin mutations", async () => {
    const {
        app,
        events,
    } = fixture();

    await request(app)
        .patch(
            "/admin/messages/9/status",
        )
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
        .expect(403);

    assert.deepEqual(events, [
        {
            eventType:
                "CSRF_REJECTED",

            outcome: "FAILURE",

            actorUserId: 1,

            requestId:
                "request-123",

            route:
                "/admin/messages/9/status",

            statusCode: 403,

            details: {
                reason:
                    "MISSING_OR_INVALID_CSRF_HEADER",
            },
        },
    ]);
});

test("does not create a security event for allowed admin access", async () => {
    const {
        app,
        events,
    } = fixture();

    await request(app)
        .get("/admin/overview")
        .set(
            "Authorization",
            "Bearer admin.token.here",
        )
        .expect(200);

    assert.deepEqual(
        events,
        [],
    );
});