require("../config/env");
const prisma = require("../config/database");
const { createRegistrationService } = require("./registration.service.factory");

module.exports = createRegistrationService(prisma);
