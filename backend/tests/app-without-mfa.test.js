const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const request = require("supertest");
const { createSessionDb } = require("./helpers/session-db");

test("app imports, serves health, and logs in a MEMBER without an MFA key", async () => {
  delete process.env.ADMIN_MFA_ENCRYPTION_KEY;
  process.env.ACCESS_TOKEN_SECRET = crypto.randomBytes(32).toString("hex");
  process.env.JWT_ISSUER = "offline-import-test";
  process.env.JWT_AUDIENCE = "offline-import-test";
  process.env.AUTH_ALLOWED_ORIGINS = "http://localhost:5173";
  const proof = "d".repeat(64);
  const db = createSessionDb({
    users: [{ id: 1, phone: "09121234567", role: "MEMBER", firstName: "A", lastName: "B" }],
    proofs: [{ id: 1, phone: "09121234567", tokenHash: crypto.createHash("sha256").update(proof).digest("hex"), purpose: "LOGIN", usedAt: null, expiresAt: new Date(Date.now() + 300000) }],
  });
  const databasePath = require.resolve("../src/config/database");
  require.cache[databasePath] = { id: databasePath, filename: databasePath, loaded: true, exports: db.prisma };
  let app;
  assert.doesNotThrow(() => { app = require("../src/app"); }, "MFA config must be lazy for public and member requests");
  await request(app).get("/health").expect(200, { status: "ok", service: "customer-club-api" });
  const login = await request(app).post("/auth/login").set("X-CSRF-Protection", "1").send({ verificationToken: proof }).expect(200);
  assert.equal(login.body.authenticated, true);
  assert.equal(login.body.user.role, "MEMBER");
  assert.equal(db.state.sessions.length, 1);
  await request(app).get("/auth/me").set("Authorization", `Bearer ${login.body.accessToken}`).expect(200);
  const mfa = require("../src/services/admin-mfa.service");
  await assert.rejects(async () => mfa.begin(1), /Invalid ADMIN MFA configuration/);
});
