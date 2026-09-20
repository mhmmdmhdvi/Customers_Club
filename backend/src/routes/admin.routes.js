const sessionService = require(
    "../services/session.service",
);

const adminOverviewController = require(
    "../controllers/admin-overview.controller",
);

const adminUsersController = require(
    "../controllers/admin-users.controller",
);

const adminMessagesController = require(
    "../controllers/admin-messages.controller",
);

const {
    createAdminRoutes,
} = require(
    "./admin.routes.factory",
);

const {
    readAuthConfig,
} = require("../config/auth");

const adminAuditReadController = require(
    "../controllers/admin-audit-read.controller",
);

const securityEventService = require(
    "../services/security-event.service",
);

const adminSecurityReadController = require(
    "../controllers/admin-security-read.controller",
);

module.exports = createAdminRoutes({
    controller: {
        overview:
            adminOverviewController.overview,

        users:
            adminUsersController.users,

        messages:
            adminMessagesController.messages,

        message:
            adminMessagesController.message,

        updateMessageStatus:
            adminMessagesController
                .updateMessageStatus,
        audit:
            adminAuditReadController.audit,

        auditEvent:
            adminAuditReadController.auditEvent,

        security:
            adminSecurityReadController.security,

        securityEvent:
            adminSecurityReadController.securityEvent,
    },

    securityEventService,
    sessionService,
    getConfig: readAuthConfig,
});