const otpService = require("../services/otp.service");

async function requestCode(req, res) {
  const { isValidIranianPhone } = require("../utils/phone");

  const { phone } = req.body;

  if (!phone) {
    return res.status(400).json({
      message: "Phone is required",
    });
  }

  if (!isValidIranianPhone(phone)) {
    return res.status(400).json({
      message:"Invalid phone number",
    });
  }

  await otpService.createOtp(phone);

  return res.json({
    message: "Code sent",
  });
}

async function verifyCode(req, res) {
  try {
    const { phone, code } = req.body;
    await otpService.verifyOtp(phone, code);
    return res.json({
      message: "OTP verified",
    });
  } catch (error) {
    console.error(error);

    return res.status(400).json({
      message: error.message,
    });
  }
}

module.exports = {
  requestCode,
  verifyCode,
};
