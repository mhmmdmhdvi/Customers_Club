const express = require("express");

const {
    createAuthentication,
    createSessionGuard,
    requireRole,
} = require(
    "../middleware/session-auth",
);

function createAdminRoutes({
    controller,
    sessionService,
    getConfig,
    securityEventService,
}) {
    const router = express.Router();

    const sessionRequest =
        createSessionGuard(
            getConfig,
            {
                securityEventService,
            },
        );

    router.use(
        createAuthentication(
            sessionService,
            {
                securityEventService,
            },
        ),
    );

    router.use(
        requireRole(
            "ADMIN",
            {
                securityEventService,
            },
        ),
    );

    router.get(
        "/overview",
        controller.overview,
    );

    router.get(
        "/users",
        controller.users,
    );

    router.get(
        "/messages",
        controller.messages,
    );

    router.get(
        "/messages/:id",
        controller.message,
    );

    router.patch(
        "/messages/:id/status",
        sessionRequest,
        controller.updateMessageStatus,
    );

    router.get(
        "/audit",
        controller.audit,
    );

    router.get(
        "/audit/:id",
        controller.auditEvent,
    );

    router.get(
        "/security",
        controller.security,
    );

    router.get(
        "/security/:id",
        controller.securityEvent,
    );

    return router;
}

module.exports = {
    createAdminRoutes,
};