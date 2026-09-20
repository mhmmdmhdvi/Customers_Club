const prisma = require("../config/database");

const {
    createAdminAuditReadService,
} = require(
    "./admin-audit-read.service.factory",
);

module.exports =
    createAdminAuditReadService(prisma);