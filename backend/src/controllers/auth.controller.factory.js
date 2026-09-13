const { isValidIranianPhone, normalizePhone } = require("../utils/phone");

const { OtpError } = require("../utils/otp-error");

function otpFailure(res, error) {
  if (!(error instanceof OtpError)) return false;
  if (error.statusCode === 429) res.set("Retry-After", String(error.retryAfter));
  res.status(error.statusCode).json({ message: error.message });
  return true;
}

function createAuthController({ otpService, registrationService }) {
  async function requestCode(req, res) {
    res.set("Cache-Control", "no-store");
    const rawPhone = req.body?.phone;

    if (!rawPhone) {
      return res.status(400).json({
        message: "Phone is required",
      });
    }

    const phone =
      typeof rawPhone === "string"
        ? normalizePhone(rawPhone)
        : null;

    if (!phone || !isValidIranianPhone(phone)) {
      return res.status(400).json({
        message: "Invalid phone number",
      });
    }

    try {
      await otpService.createOtp(phone, req.ip);

      return res.status(200).json({
        message: "Code sent",
      });
    } catch (error) {
      if (otpFailure(res, error)) return;
      if (otpFailure(res, error)) return;
      console.error("Failed to create OTP");

      return res.status(500).json({
        message: "Internal server error",
      });
    }
  }

  async function verifyCode(req, res) {
    res.set("Cache-Control", "no-store");
    const rawPhone = req.body?.phone;
    const rawCode = req.body?.code;

    if (!rawPhone) {
      return res.status(400).json({
        message: "Phone is required",
      });
    }

    const phone =
      typeof rawPhone === "string"
        ? normalizePhone(rawPhone)
        : null;

    if (!phone || !isValidIranianPhone(phone)) {
      return res.status(400).json({
        message: "Invalid phone number",
      });
    }

    if (!rawCode) {
      return res.status(400).json({
        message: "Code is required",
      });
    }

    const code =
      typeof rawCode === "string"
        ? rawCode.trim()
        : "";

    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({
        message: "Code must contain exactly 6 digits",
      });
    }

    try {
      const verification = await registrationService.verifyPhone(phone, code, req.ip);

      return res.status(200).json({
        message: "OTP verified",
        ...verification,
      });
    } catch (error) {
      if (otpFailure(res, error)) return;
      if (
        error.message === "Invalid OTP" ||
        error.message === "OTP expired"
      ) {
        return res.status(400).json({
          message: error.message,
        });
      }

      console.error("Failed to verify OTP");

      return res.status(500).json({
        message: "Internal server error",
      });
    }
  }

  return { requestCode, verifyCode };
}

module.exports = { createAuthController };
