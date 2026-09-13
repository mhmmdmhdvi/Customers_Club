// Test-only transactional store. Serializes callbacks, not real PostgreSQL locks.
const { createOtpDb } = require("./otp-db");
const { testConfig, activeOtp } = require("./otp-fixtures");
function createSessionDb(initial = {}) {
  const otpConfig = testConfig();
  // Existing test inputs keep their synthetic raw code at the fixture boundary;
  // the store is seeded with the NEW digest format, never a runtime fallback.
  const otps = (initial.otps || []).map((row) => row.codeHash !== undefined ? row
    : activeOtp(otpConfig, row.phone, row.code, row));
  const db = createOtpDb({ ...initial, otps });
  db.otpConfig = otpConfig;
  return db;
}
module.exports = { createSessionDb };
