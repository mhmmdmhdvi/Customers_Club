const adminSecurityReadService = require(
    "../services/admin-security-read.service",
);

const {
    createAdminSecurityReadController,
} = require(
    "./admin-security-read.controller.factory",
);

module.exports =
    createAdminSecurityReadController({
        adminSecurityReadService,
    });