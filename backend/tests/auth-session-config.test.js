const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { readAuthConfig } = require("../src/config/auth");
const valid = () => ({ NODE_ENV: "test", ACCESS_TOKEN_SECRET: crypto.randomBytes(32).toString("hex"),
  JWT_ISSUER: "test-api", JWT_AUDIENCE: "test-client", AUTH_ALLOWED_ORIGINS: "http://localhost:5173" });

test("explicit local test configuration is accepted", () => {
  const result = readAuthConfig(valid());
  assert.equal(result.secret.length, 32);
  assert.equal(result.accessTtlSeconds, 900);
  assert.deepEqual(result.allowedOrigins, ["http://localhost:5173"]);
  assert.equal(result.cookie.secure, false);
  assert.equal(result.cookie.name, "club_refresh");
});
test("production cookie is Secure and __Host-prefixed", () => {
  const result = readAuthConfig({ ...valid(), NODE_ENV: "production", AUTH_ALLOWED_ORIGINS: "https://club.example.test" });
  assert.equal(result.cookie.secure, true);
  assert.equal(result.cookie.name, "__Host-club_refresh");
});
for (const name of ["NODE_ENV", "ACCESS_TOKEN_SECRET", "JWT_ISSUER", "JWT_AUDIENCE", "AUTH_ALLOWED_ORIGINS"]) {
  test(`missing ${name} fails closed`, () => {
    const input = valid(); delete input[name];
    assert.throws(() => readAuthConfig(input), /configuration/i);
  });
}
for (const secret of ["", "abc", "a".repeat(63), "g".repeat(64), "a".repeat(66)]) {
  test(`invalid key encoding/length (${secret.length}) rejected`, () => {
    assert.throws(() => readAuthConfig({ ...valid(), ACCESS_TOKEN_SECRET: secret }));
  });
}
for (const origin of ["*", "null", "https://good.test/path", "https://a:b@good.test", "https://good.test?x=1", "https://good.test#x", "https://good.test,", "ftp://localhost", "http://example.test"]) {
  test(`unsafe origin setting rejected: ${origin}`, () => {
    assert.throws(() => readAuthConfig({ ...valid(), AUTH_ALLOWED_ORIGINS: origin }));
  });
}
test("production rejects localhost HTTP", () => {
  assert.throws(() => readAuthConfig({ ...valid(), NODE_ENV: "production" }));
});
test("unknown environment is not treated as development", () => {
  assert.throws(() => readAuthConfig({ ...valid(), NODE_ENV: "staging" }));
});
test("configuration errors never disclose a signing key", () => {
  const input = valid(); input.JWT_ISSUER = "";
  assert.throws(() => readAuthConfig(input), (e) => !e.message.includes(input.ACCESS_TOKEN_SECRET));
});

const { createSessionCorsOptions } = require("../src/config/auth");
for(const [origin,allowed] of [["http://localhost:5173",true],["https://attacker.test",false],[undefined,false]]) {
  test(`CORS allows only explicit origin: ${origin}`,()=>{
    const cors=createSessionCorsOptions(()=>readAuthConfig(valid()));
    cors({headers:{origin}},(error,options)=>{assert.equal(error,null);assert.equal(options.origin,allowed?origin:false);assert.equal(options.credentials,true);assert.ok(options.allowedHeaders.includes("X-CSRF-Protection"));});
  });
}
test("missing configuration cannot enable credentialed CORS",()=>{
  createSessionCorsOptions(()=>{throw new Error("missing");})({headers:{origin:"https://attacker.test"}},(error,options)=>assert.equal(options.origin,false));
});
