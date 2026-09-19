const prisma = require("../config/database");

const {
    createContactMessageService,
} = require(
    "./contact-message.service.factory",
);

module.exports =
    createContactMessageService(prisma);