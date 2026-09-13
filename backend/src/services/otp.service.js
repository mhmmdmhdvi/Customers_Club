require("../config/env");
const prisma = require("../config/database");
const { createOtpService } = require("./otp.service.factory");
const delivery = require("./otp-delivery");
module.exports = createOtpService(prisma, { getSender: () => delivery.getSender() });
