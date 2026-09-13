"use strict";
class OtpError extends Error {
  constructor(message = "Invalid OTP", statusCode = 400, retryAfter) {
    super(message);
    this.name = "OtpError";
    this.statusCode = statusCode;
    if (retryAfter !== undefined) this.retryAfter = Math.max(1, Math.ceil(retryAfter));
  }
}
const unavailable = () => new OtpError("OTP service unavailable", 503);
const rateLimited = (seconds) => new OtpError("Too many attempts. Try again later", 429, seconds);
module.exports = { OtpError, unavailable, rateLimited };
