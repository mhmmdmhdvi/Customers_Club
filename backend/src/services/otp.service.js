const prisma = require("../config/database");
const { createOtpService } = require("./otp.service.factory");

module.exports = createOtpService(prisma);