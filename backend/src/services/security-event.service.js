const prisma = require("../config/database");

const {
    createSecurityEventService,
} = require(
    "./security-event.service.factory",
);

module.exports =
    createSecurityEventService(prisma);