const otpService = require("../services/otp.service");
const {
  isValidIranianPhone,
  normalizePhone,
} = require("../utils/phone");

async function requestCode(req, res) {
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
    await otpService.createOtp(phone);

    return res.status(200).json({
      message: "Code sent",
    });
  } catch (error) {
    console.error("Failed to create OTP:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

async function verifyCode(req, res) {
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
    await otpService.verifyOtp(phone, code);

    return res.status(200).json({
      message: "OTP verified",
    });
  } catch (error) {
    if (
      error.message === "Invalid OTP" ||
      error.message === "OTP expired"
    ) {
      return res.status(400).json({
        message: error.message,
      });
    }

    console.error("Failed to verify OTP:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

module.exports = {
  requestCode,
  verifyCode,
};