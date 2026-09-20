const adminAuditReadService = require(
    "../services/admin-audit-read.service",
);

const {
    createAdminAuditReadController,
} = require(
    "./admin-audit-read.controller.factory",
);

module.exports =
    createAdminAuditReadController({
        adminAuditReadService,
    });