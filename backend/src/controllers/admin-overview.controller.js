const adminOverviewService = require(
    "../services/admin-overview.service",
);

const {
    createAdminOverviewController,
} = require(
    "./admin-overview.controller.factory",
);

module.exports =
    createAdminOverviewController({
        adminOverviewService,
    });