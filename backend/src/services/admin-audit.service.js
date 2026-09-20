const prisma = require("../config/database");

const {
    createAdminAuditService,
} = require(
    "./admin-audit.service.factory",
);

module.exports =
    createAdminAuditService(prisma);