// Fakes replace external business services; Express, routes, controllers,
// parsers, CORS, security headers, and socket HTTP are the production boundary.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const request = require("supertest");
const fixtures = require("../../contracts/http.json");
const { unavailable, rateLimited } = require("../src/utils/otp-error");
let scenario;
let calls;
function outcome() {
  if (scenario === "invalid") throw new Error("Invalid OTP");
  if (scenario === "expired") throw new Error("OTP expired");
  if (scenario === "limited") throw rateLimited(17);
  if (scenario === "unavailable") throw unavailable();
  if (scenario === "unexpected") throw new Error("private dependency detail");
}
function received(operation, phone, code, ip) {
  assert.ok(["127.0.0.1", "::ffff:127.0.0.1", "::1"].includes(ip), "use socket peer, never forwarded client IP");
  calls.push({ operation, phone, ...(code === undefined ? {} : { code }) });
  outcome();
}
function replaceService(path, exports) {
  const filename = require.resolve(path);
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}
replaceService("../src/services/otp.service", { createOtp: async (phone, ip) => received("create", phone, undefined, ip) });
replaceService("../src/services/registration.service", {
  verifyPhone: async (phone, code, ip) => {
    received("verify", phone, code, ip);
    return { nextStep: scenario === "login" ? "LOGIN" : "REGISTER", authenticated: false, verificationToken: "c".repeat(64), verificationExpiresAt: "2030-01-01T00:05:00.000Z" };
  },
});
process.env.ACCESS_TOKEN_SECRET = crypto.randomBytes(32).toString("hex");
process.env.JWT_ISSUER = "contract-test";
process.env.JWT_AUDIENCE = "contract-test";
process.env.AUTH_ALLOWED_ORIGINS = "http://localhost:5173";
delete process.env.ADMIN_MFA_ENCRYPTION_KEY;
const app = require("../src/app");

for (const fixture of fixtures.cases) {
  test(`shared contract: ${fixture.name}`, async () => {
    scenario = fixture.scenario;
    calls = [];
    let req = request(app)[fixture.method.toLowerCase()](fixture.path)
      .set("X-Forwarded-For", "203.0.113.99").set("X-Request-Id", "client-controlled");
    for (const [key, value] of Object.entries(fixture.requestHeaders ?? {})) req = req.set(key, value);
    if (fixture.rawBodyHex !== undefined) req = req.set("Content-Type", fixture.requestContentType ?? "application/json")
      .serialize((bytes) => bytes).send(Buffer.from(fixture.rawBodyHex, "hex"));
    else if (fixture.oversized) req = req.set("Content-Type", "application/json").send(JSON.stringify({ phone: "09121234567", padding: "x".repeat(100 * 1024) }));
    else if (fixture.rawBody !== undefined) req = req.set("Content-Type", fixture.requestContentType ?? "application/json").send(fixture.rawBody);
    else if (fixture.body !== undefined) req = req.send(fixture.body);
    const res = await req;
    assert.equal(res.status, fixture.status);
    const expected = { ...fixture, ...fixture.runtime?.node };
    if (expected.json !== undefined) {
      assert.deepEqual(res.body, expected.json);
      assert.match(res.headers["content-type"], /^application\/json(?:;|$)/);
    }
    if (expected.bodyContains) assert.ok(res.text.includes(expected.bodyContains), res.text);
    if (expected.contentType) assert.ok(res.headers["content-type"].startsWith(expected.contentType));
    if (fixture.empty) assert.equal(res.text, "");
    for (const [key, value] of Object.entries({ ...fixtures.securityHeaders, ...fixture.headers, ...fixture.runtime?.node?.headers })) assert.equal(res.headers[key], value, key);
    for (const key of fixture.absentHeaders ?? []) assert.equal(res.headers[key], undefined, key);
    assert.match(res.headers["x-request-id"], /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    assert.equal(res.headers["x-powered-by"], undefined);
    if (fixture.calls !== undefined) assert.deepEqual(calls, fixture.calls);
  });
}
