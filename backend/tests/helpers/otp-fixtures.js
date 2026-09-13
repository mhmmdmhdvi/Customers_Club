const crypto = require("node:crypto");
const { hashCode } = require("../../src/utils/otp-crypto");
function testConfig() { return { secret: crypto.randomBytes(32) }; }
function activeOtp(config, phone, code, extra = {}) {
  const nonce = crypto.randomBytes(32).toString("hex");
  return { id: 1, phone, used: false, expiresAt: new Date(Date.now()+120_000),
    failedAttempts: 0, deliveryState: "ACTIVE", ...extra,
    code: null, nonce, codeHash: hashCode(config.secret,phone,nonce,code) };
}
module.exports = { testConfig, activeOtp };
