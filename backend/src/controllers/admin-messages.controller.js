const adminMessagesService = require(
    "../services/admin-messages.service",
);

const {
    createAdminMessagesController,
} = require(
    "./admin-messages.controller.factory",
);

module.exports =
    createAdminMessagesController({
        adminMessagesService,
    });