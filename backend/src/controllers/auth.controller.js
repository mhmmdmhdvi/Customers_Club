const otpService = require("../services/otp.service");

async function requestCode(req, res) {
  const { phone } = req.body;
  if (!phone) {
    return res.status(400).json({
      message: "Phone is required",
    });
  }
  await otpService.createOtp(phone);
  return res.json({
    message: "Code sent",
  });
}

module.exports = {
  requestCode,
};
