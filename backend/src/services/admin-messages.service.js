const prisma = require("../config/database");

const adminAuditService = require(
    "./admin-audit.service",
);

const {
    createAdminMessagesService,
} = require(
    "./admin-messages.service.factory",
);

module.exports =
    createAdminMessagesService(
        prisma,
        {
            adminAuditService,
        },
    );