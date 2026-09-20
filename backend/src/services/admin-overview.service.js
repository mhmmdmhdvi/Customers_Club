const prisma = require("../config/database");

const {
    createAdminOverviewService,
} = require(
    "./admin-overview.service.factory",
);

module.exports =
    createAdminOverviewService(prisma);