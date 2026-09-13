"use strict";
const { unavailable } = require("../utils/otp-error");
function readOtpConfig(env = process.env) {
  const raw = env.OTP_HMAC_SECRET;
  if (!["development", "test", "production"].includes(env.NODE_ENV) ||
      typeof raw !== "string" || !/^[a-f0-9]{64}$/i.test(raw) ||
      (typeof env.ACCESS_TOKEN_SECRET === "string" && raw.toLowerCase() === env.ACCESS_TOKEN_SECRET.toLowerCase())) {
    throw unavailable();
  }
  return { secret: Buffer.from(raw, "hex") };
}
module.exports = { readOtpConfig };
