"use strict";
// Manual opt-in only. Not discovered by npm test. No migration/reset/.env writes.
const crypto = require("node:crypto");
const path = require("node:path");
const { parseTarget, verifyIdentity } = require("./registration-db-check");
class CheckFailure extends Error { }
const expect = (ok, message) => { if (!ok) throw new CheckFailure(message); };
const hash = (v) => crypto.createHash("sha256").update(v).digest("hex");

async function main() {
  const url = parseTarget(process.env.TEST_DATABASE_URL, process.env.ALLOW_TEST_DATABASE_WRITES);
  process.env.DATABASE_URL = url;
  process.env.NODE_ENV = "test";
  process.env.OTP_HMAC_SECRET = crypto.randomBytes(32).toString("hex");
  delete process.env.DOTENV_CONFIG_OVERRIDE;
  process.env.DOTENV_CONFIG_QUIET = "true";
  process.env.ACCESS_TOKEN_SECRET = crypto.randomBytes(32).toString("hex");
  process.env.JWT_ISSUER = "session-db-check";
  process.env.JWT_AUDIENCE = "session-db-check-client";
  process.env.AUTH_ALLOWED_ORIGINS = "http://localhost:5173";
  process.chdir(path.resolve(__dirname, ".."));
  require("../src/config/env");
  expect(process.env.DATABASE_URL === url && process.env.NODE_ENV === "test", "Test target changed during configuration");
  const prisma = require("../src/config/database");
  let verified = false, passed = 0, complete = false;
  const phones = new Set();
  let otpFixtures;
  const sessionIds = new Set();
  const originalError = console.error;
  try {
    const [identity] = await prisma.$queryRaw`
      SELECT current_database()::text AS database, current_user::text AS db_user,
             session_user::text AS login, current_schema()::text AS schema_name,
             rolsuper AS superuser, rolcreatedb AS creates_database, rolcreaterole AS creates_role
      FROM pg_roles WHERE rolname = current_user`;
    verifyIdentity(identity);
    verified = true;
    expect(Boolean(prisma.authSession && prisma.refreshToken && prisma.otpRateBucket), "Regenerate Prisma Client from the session schema");
    await prisma.authSession.count(); await prisma.refreshToken.count();
    await prisma.otpRateBucket.count();
    otpFixtures = require("./otp-check-fixtures").createCheckFixtures(prisma);
    console.log("Verified test target: customer_club_test_db / customer_club_test_user");
    console.error = () => originalError("Application error details withheld during database checks");
    const app = require("../src/app");
    const request = require("supertest");
    const { createSessionService } = require("../src/services/session.service.factory");
    const { createRegistrationService } = require("../src/services/registration.service.factory");
    const { createAccessTokens } = require("../src/utils/access-token");
    const { readAuthConfig } = require("../src/config/auth");
    const tokens = createAccessTokens(readAuthConfig());
    const service = createSessionService(prisma, { tokens });
    const registration = otpFixtures.registration(prisma);
    const details = (verificationToken) => ({ verificationToken, firstName: "Integration", lastName: "Session" });
    const cookie = (response) => response.headers["set-cookie"][0].split(";")[0];
    const post = (route, body, credential) => {
      let r = request(app).post(route).set("Origin", "http://localhost:5173").set("X-CSRF-Protection", "1").send(body || {});
      if (credential) r = r.set("Cookie", credential);
      return r.timeout({ response: 8000, deadline: 15000 });
    };
    async function check(name, action) {
      try { await action(); passed++; console.log(`PASS ${name}`); }
      catch (error) {
        originalError(`FAIL ${name}: ${error instanceof CheckFailure ? error.message : "operation failed; sensitive details withheld"}`);
        throw new CheckFailure("Database check failed; remaining checks were not run");
      }
    }
    async function proof(existing = false) {
      for (let attempt = 0; attempt < 20; attempt++) {
        const phone = `099${crypto.randomInt(0, 100_000_000).toString().padStart(8, "0")}`;
        if (phones.has(phone)) continue;
        const n = await Promise.all([prisma.user.count({ where: { phone } }), prisma.oTPCode.count({ where: { phone } }), prisma.phoneVerification.count({ where: { phone } })]);
        if (n.some(Boolean)) continue;
        phones.add(phone);
        if (existing) await prisma.user.create({ data: { phone, firstName: "Existing", lastName: "Member", role: "MEMBER" } });
        const fixture = otpFixtures.record(phone);
        await prisma.oTPCode.create({ data: fixture.data });
        const result = await registration.verifyPhone(phone, fixture.code);
        return { phone, verificationToken: result.verificationToken };
      }
      throw new CheckFailure("Could not reserve an unused test phone");
    }
    async function expectDenied(action) {
      let error; try { await action(); } catch (e) { error = e; }
      expect(error && [400, 401].includes(error.statusCode), "Expected a validation/authentication rejection");
    }
    async function synchronized(model, method, work) {
      let reads = 0, release, timer;
      const gate = new Promise((resolve) => { release = resolve; });
      const limit = new Promise((_, reject) => { timer = setTimeout(() => reject(new CheckFailure("Read barrier timed out")), 7000); });
      const wait = Promise.race([gate, limit]); wait.catch(() => { });
      const db = {
        $transaction: (callback) => prisma.$transaction(async (tx) => {
          const scoped = { user: tx.user, phoneVerification: tx.phoneVerification, authSession: tx.authSession, refreshToken: tx.refreshToken };
          scoped[model] = {};
          for (const op of ["create", "findUnique", "updateMany"]) scoped[model][op] = (args) => tx[model][op](args);
          scoped[model][method] = async (args) => { const row = await tx[model][method](args); if (++reads === 2) release(); await wait; return row; };
          return callback(scoped);
        }, { maxWait: 10000, timeout: 15000 })
      };
      try { const s = createSessionService(db, { tokens }); const results = await Promise.allSettled([work(s), work(s)]); expect(reads === 2, "Both transactions must reach the barrier"); return results; }
      finally { clearTimeout(timer); }
    }

    await check("HTTP registration immediately authenticates via me", async () => {
      const p = await proof(); const res = await post("/auth/register", details(p.verificationToken));
      expect(res.status === 201 && res.body.authenticated === true && res.body.user?.role === "MEMBER", "Registration did not create session");
      expect(res.body.refreshToken === undefined && res.headers["set-cookie"]?.[0].includes("HttpOnly"), "Refresh credential escaped cookie boundary");
      const me = await request(app).get("/auth/me").set("Authorization", `Bearer ${res.body.accessToken}`);
      expect(me.status === 200 && me.body.user.phone === p.phone, "Authenticated user lookup failed");
    });
    await check("LOGIN proof is one-use and refresh is stored hashed", async () => {
      const p = await proof(true); const result = await service.login({ verificationToken: p.verificationToken });
      const saved = await prisma.refreshToken.findUnique({ where: { tokenHash: hash(result.refreshToken) } });
      expect(saved && saved.tokenHash !== result.refreshToken, "Refresh token hash missing");
      await expectDenied(() => service.login({ verificationToken: p.verificationToken }));
    });
    await check("Refresh rotates and keeps the absolute deadline", async () => {
      const p = await proof(true); const first = await service.login({ verificationToken: p.verificationToken }); const next = await service.refresh(first.refreshToken);
      expect(first.refreshToken !== next.refreshToken && first.refreshExpiresAt === next.refreshExpiresAt, "Rotation or absolute expiry failed");
      expect((await service.authenticate(next.accessToken)).user.phone === p.phone, "Rotated access failed");
    });
    await check("Refresh replay commits revocation, including replacement access", async () => {
      const p = await proof(true); const first = await service.login({ verificationToken: p.verificationToken }); const next = await service.refresh(first.refreshToken);
      await expectDenied(() => service.refresh(first.refreshToken)); await expectDenied(() => service.authenticate(next.accessToken)); await expectDenied(() => service.refresh(next.refreshToken));
    });
    await check("HTTP logout clears cookie and invalidates access", async () => {
      const p = await proof(true); const logged = await post("/auth/login", { verificationToken: p.verificationToken }); expect(logged.status === 200, "Login failed");
      const out = await post("/auth/logout", {}, cookie(logged)); expect(out.status === 204, "Logout failed");
      const me = await request(app).get("/auth/me").set("Authorization", `Bearer ${logged.body.accessToken}`); expect(me.status === 401, "Logged-out access was accepted");
    });
    await check("REGISTER proof cannot authenticate through the LOGIN endpoint", async () => {
      const p = await proof(); await expectDenied(() => service.login({ verificationToken: p.verificationToken }));
      expect(await prisma.authSession.count({ where: { user: { phone: p.phone } } }) === 0, "Wrong-purpose proof issued session");
    });
    await check("Client cannot inject role or phone while registering", async () => {
      const p = await proof(); await expectDenied(() => service.register({ ...details(p.verificationToken), role: "ADMIN" }));
      expect(await prisma.user.count({ where: { phone: p.phone } }) === 0, "Role injection created member");
    });
    await check("Expired server-side session rejects signed access and refresh", async () => {
      const p = await proof(true); const result = await service.login({ verificationToken: p.verificationToken });
      await prisma.authSession.updateMany({ where: { userId: result.user.id }, data: { expiresAt: new Date(0) } });
      await expectDenied(() => service.authenticate(result.accessToken)); await expectDenied(() => service.refresh(result.refreshToken));
    });
    await check("Two overlapping LOGIN-proof claims create one session", async () => {
      const p = await proof(true); const results = await synchronized("phoneVerification", "findUnique", (s) => s.login({ verificationToken: p.verificationToken }));
      expect(results.filter((r) => r.status === "fulfilled").length === 1, "More than one LOGIN proof succeeded");
      expect(results.filter((r) => r.status === "rejected")[0]?.reason.statusCode === 401, "Unexpected losing error");
      expect(await prisma.authSession.count({ where: { user: { phone: p.phone } } }) === 1, "Session count is not one");
    });
    await check("Overlapping refresh admits one winner then revokes on replay", async () => {
      const p = await proof(true); const first = await service.login({ verificationToken: p.verificationToken });
      const results = await synchronized("authSession", "findUnique", (s) => s.refresh(first.refreshToken));
      expect(results.filter((r) => r.status === "fulfilled").length === 1, "Refresh did not have one winner");
      expect(results.filter((r) => r.status === "rejected")[0]?.reason.statusCode === 401, "Unexpected refresh loser");
      const winner = results.find((r) => r.status === "fulfilled").value; await expectDenied(() => service.authenticate(winner.accessToken));
    });
    for (const op of ["register", "login"]) {
      await check(`Failed signing rolls back ${op}, proof and session records`, async () => {
        const p = await proof(op === "login"); const marker = new Error("test-only signing failure");
        const failing = createSessionService(prisma, { tokens: { issue() { throw marker; } } }); let caught;
        try { await failing[op](op === "register" ? details(p.verificationToken) : { verificationToken: p.verificationToken }); } catch (e) { caught = e; }
        expect(caught === marker, "Failure did not reach session signing");
        expect((await prisma.phoneVerification.findUnique({ where: { tokenHash: hash(p.verificationToken) } })).usedAt === null, "Proof consumption was not rolled back");
        expect(await prisma.authSession.count({ where: { user: { phone: p.phone } } }) === 0, "Aborted session was persisted");
        if (op === "register") expect(await prisma.user.count({ where: { phone: p.phone } }) === 0, "Aborted registration left member");
      });
    }
    complete = true;
  } finally {
    otpFixtures?.restoreSender();
    console.error = originalError;
    try {
      if (verified && phones.size) {
        const where = { phone: { in: [...phones] } };
        const otpKeys = otpFixtures?.keysFor(phones) || [];
        const sessions = await prisma.authSession.findMany({ where: { user: { phone: { in: [...phones] } } }, select: { id: true } });
        sessions.forEach((s) => sessionIds.add(s.id));
        await prisma.$transaction([
          prisma.otpRateBucket.deleteMany({ where: { key: { in: otpKeys } } }),
          prisma.phoneVerification.deleteMany({ where }), prisma.oTPCode.deleteMany({ where }), prisma.user.deleteMany({ where }),
        ]); // Foreign-key cascades remove ONLY those users' session/refresh rows.
        const remaining = await Promise.all([prisma.user.count({ where }), prisma.phoneVerification.count({ where }), prisma.oTPCode.count({ where }),
        prisma.authSession.count({ where: { id: { in: [...sessionIds] } } }), prisma.refreshToken.count({ where: { sessionId: { in: [...sessionIds] } } }),
        prisma.otpRateBucket.count({ where: { key: { in: otpKeys } } })]);
        expect(remaining.every((n) => n === 0), "Temporary records remain after cleanup");
        console.log("Cleanup verified: this run's temporary records were removed.");
      }
    } finally { await prisma.$disconnect(); }
    if (complete) console.log(`Session DB checks: ${passed} passed, 0 failed.`);
  }
}
if (require.main === module) main().catch((error) => {
  console.error(`STOP: ${error instanceof CheckFailure ? error.message : "Session database check failed; credentials and error details withheld"}`);
  process.exitCode = 1;
});
module.exports = { main };
