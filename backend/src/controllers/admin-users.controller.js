const adminUsersService = require(
    "../services/admin-users.service",
);

const {
    createAdminUsersController,
} = require(
    "./admin-users.controller.factory",
);

module.exports =
    createAdminUsersController({
        adminUsersService,
    });