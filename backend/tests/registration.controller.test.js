const test = require("node:test");
const assert = require("node:assert/strict");
const { createAuthController } = require("../src/controllers/auth.controller.factory");
const { RegistrationError } = require("../src/utils/registration-error");
const { createRegistrationService } = require("../src/services/registration.service.factory");
const { createSessionDb } = require("./helpers/session-db");
const { createSessionService } = require("../src/services/session.service.factory");
const { createSessionController } = require("../src/controllers/session.controller.factory");
const config = { cookie: { name: "club_refresh", secure: false } };
function access() { return { accessToken: "test-access", expiresIn: 900,
  accessExpiresAt: new Date(Date.now() + 900_000).toISOString() }; }
function grant(user) { return { user, ...access(), refreshToken: "b".repeat(64),
  refreshExpiresAt: new Date(Date.now() + 7 * 86400_000).toISOString() }; }

function response() {
  return {
    statusCode: 200, headers: {}, body: null, cookies: [],
    cookie(...args) { this.cookies.push(args); return this; },
    clearCookie() { return this; },
    set(name, value) { this.headers[name] = value; return this; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
}
function controller(registrationService, sessionService = registrationService) {
  return {
    ...createAuthController({ otpService: { createOtp: async () => {} }, registrationService }),
    ...createSessionController({ sessionService, getConfig: () => config }),
  };
}

test("verify-code returns proof, normalizes phone, and disables caching", async () => {
  const proof = { nextStep: "REGISTER", authenticated: false, verificationToken: "a".repeat(64), verificationExpiresAt: "2030-01-01T00:00:00.000Z" };
  const api = controller({ verifyPhone: async (phone, code) => {
    assert.equal(phone, "09121234567"); assert.equal(code, "123456"); return proof;
  } });
  const res = response();
  await api.verifyCode({ body: { phone: "+989121234567", code: " 123456 " } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { message: "OTP verified", ...proof });
  assert.equal(res.headers["Cache-Control"], "no-store");
});

test("verify-code keeps the invalid OTP error contract", async () => {
  const api = controller({ verifyPhone: async () => { throw new Error("Invalid OTP"); } });
  const res = response();
  await api.verifyCode({ body: { phone: "09121234567", code: "123456" } }, res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { message: "Invalid OTP" });
});

test("register returns created member and authenticated access without exposing refresh token", async () => {
  const user = { id: 1, phone: "09121234567", firstName: "A", lastName: "B", role: "MEMBER" };
  const payload = { verificationToken: "a".repeat(64), firstName: "A", lastName: "B" };
  const api = controller({ register: async (data) => { assert.deepEqual(data, payload); return grant(user); } });
  const res = response();
  await api.register({ body: payload }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.message, "Registration completed");
  assert.deepEqual(res.body.user, user);
  assert.equal(res.body.authenticated, true);
  assert.equal(res.body.tokenType, "Bearer");
  assert.equal(res.body.refreshToken, undefined);
  assert.equal(res.cookies[0][1], "b".repeat(64));
  assert.equal(res.headers["Cache-Control"], "no-store");
  assert.equal(res.body.accessToken, "test-access");
});

for (const [status, message] of [[400, "Invalid or expired verification"], [409, "Phone already registered"]]) {
  test(`register maps expected error to ${status}`, async () => {
    const api = controller({ register: async () => { throw new RegistrationError(message, status); } });
    const res = response();
    await api.register({ body: {} }, res);
    assert.equal(res.statusCode, status);
    assert.deepEqual(res.body, { message });
    assert.equal(res.headers["Cache-Control"], "no-store");
  });
}

test("register does not leak unexpected database errors or tokens", async (t) => {
  const log = t.mock.method(console, "error", () => {});
  const api = controller({ register: async () => { throw new Error("database password and private token"); } });
  const res = response();
  await api.register({ body: {} }, res);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { message: "Internal server error" });
  assert.ok(!JSON.stringify(log.mock.calls).includes("database password"));
});

test("verified-phone controller-to-service flow creates one member with a fake transaction store", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
  const db = createSessionDb({ otps: [{ id: 1, phone: "09121234567", code: "123456", used: false, expiresAt: new Date(1_120_000) }] });
  const api = controller(createRegistrationService(db.prisma),
    createSessionService(db.prisma, { tokens: { issue: () => access() } }));
  const verified = response();
  await api.verifyCode({ body: { phone: "+989121234567", code: "123456" } }, verified);
  assert.equal(verified.statusCode, 200);
  assert.equal(verified.body.nextStep, "REGISTER");
  const payload = { verificationToken: verified.body.verificationToken, firstName: "خسرو", lastName: "وفایی" };
  const registered = response();
  await api.register({ body: payload }, registered);
  assert.equal(registered.statusCode, 201);
  assert.equal(registered.body.user.phone, "09121234567");
  assert.equal(registered.body.user.role, "MEMBER");
  assert.equal(registered.body.authenticated, true);
  assert.equal(db.state.sessions.length, 1);
  const replay = response();
  await api.register({ body: payload }, replay);
  assert.equal(replay.statusCode, 400);
  assert.equal(db.state.users.length, 1);
});
