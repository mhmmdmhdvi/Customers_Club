const otpService = require("../services/otp.service");
const registrationService = require("../services/registration.service");
const { createAuthController } = require("./auth.controller.factory");

module.exports = createAuthController({ otpService, registrationService });
