// Test-only transactional substitute. It does NOT model PostgreSQL locks.
const { createSessionDb } = require("./session-db");
function createRegistrationDb(initial = {}) {
  const db = createSessionDb(initial);
  for (const [oldName, name] of [["userCreate","usersCreate"],["proofCreate","proofsCreate"],["claimMiss","proofsClaimMiss"]]) {
    Object.defineProperty(db.failures, oldName, {
      get() { return db.failures[name]; }, set(value) { db.failures[name] = value; },
    });
  }
  for (const name of ["user", "phoneVerification", "oTPCode", "otpRateBucket"]) {
    Object.defineProperty(db.prisma, name, { get() { throw new Error("DB access must be inside transaction"); } });
  }
  return db;
}
module.exports = { createRegistrationDb };
