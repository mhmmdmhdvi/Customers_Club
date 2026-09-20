const prisma = require("../config/database");

const {
    createAdminUsersService,
} = require(
    "./admin-users.service.factory",
);

module.exports =
    createAdminUsersService(prisma);