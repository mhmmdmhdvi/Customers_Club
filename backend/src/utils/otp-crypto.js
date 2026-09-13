"use strict";
const crypto = require("node:crypto");
const { unavailable } = require("./otp-error");
function keyedHash(secret, purpose, ...parts) {
  if (!Buffer.isBuffer(secret) || secret.length !== 32) throw unavailable();
  return crypto.createHmac("sha256", secret).update(JSON.stringify([purpose, ...parts])).digest("hex");
}
function hashCode(secret, phone, nonce, code) {
  return keyedHash(secret, "club-otp-v1", phone, nonce, code);
}
function matchesCode(secret, otp, phone, code) {
  // No legacy plaintext fallback. Malformed/partially migrated rows fail closed.
  if (otp.code !== null || typeof otp.nonce !== "string" || !/^[a-f0-9]{64}$/.test(otp.nonce) ||
      typeof otp.codeHash !== "string" || !/^[a-f0-9]{64}$/.test(otp.codeHash)) return false;
  return crypto.timingSafeEqual(Buffer.from(otp.codeHash, "hex"), Buffer.from(hashCode(secret, phone, otp.nonce, code), "hex"));
}
module.exports = { keyedHash, hashCode, matchesCode };
