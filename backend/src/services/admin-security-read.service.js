const prisma = require("../config/database");

const {
    createAdminSecurityReadService,
} = require(
    "./admin-security-read.service.factory",
);

module.exports =
    createAdminSecurityReadService(prisma);