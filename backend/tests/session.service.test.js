const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createSessionService } = require("../src/services/session.service.factory");
const { createSessionDb } = require("./helpers/session-db");

const PHONE = "09121234567";
const PROOF = "a".repeat(64);
const hash = (v) => crypto.createHash("sha256").update(v).digest("hex");
const user = { id: 1, phone: PHONE, firstName: "A", lastName: "B", role: "MEMBER" };
const details = { verificationToken: PROOF, firstName: "خسرو", lastName: "وفایی" };

function fixture(t, purpose = "LOGIN") {
  t.mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
  const db = createSessionDb({
    users: purpose === "REGISTER" ? [] : [user],
    proofs: [{ id: 1, phone: PHONE, tokenHash: hash(PROOF), purpose, usedAt: null, expiresAt: new Date(1_300_000) }],
  });
  const issued = new Map();
  const tokens = {
    issue(userId, sessionId, sessionExpiresAt) {
      const token = `access-${crypto.randomUUID()}`;
      issued.set(token, { userId, sessionId });
      return { accessToken: token, expiresIn: 900, accessExpiresAt: new Date(Date.now() + 900_000).toISOString() };
    },
    verify(token) {
      if (!issued.has(token)) throw new Error("Invalid JWT from test adapter");
      return issued.get(token);
    },
  };
  return { db, tokens, service: createSessionService(db.prisma, { tokens }) };
}
const login = (service) => service.login({ verificationToken: PROOF });

test("login consumes proof, issues session, and stores refresh hash only", async (t) => {
  const { db, service } = fixture(t);
  const result = await login(service);
  assert.equal(result.user.id, user.id);
  assert.match(result.refreshToken, /^[a-f0-9]{64}$/);
  assert.equal(db.state.sessions.length, 1);
  assert.equal(db.state.sessions[0].userId, user.id);
  assert.equal(db.state.sessions[0].expiresAt.getTime(), Date.now() + 7 * 86400_000);
  assert.equal(db.state.refreshTokens[0].tokenHash, hash(result.refreshToken));
  assert.ok(!JSON.stringify(db.state).includes(result.refreshToken));
  assert.ok(db.state.proofs[0].usedAt instanceof Date);
  assert.equal((await service.authenticate(result.accessToken)).user.id, user.id);
});

for (const [label, change] of [
  ["missing proof", (db) => { db.state.proofs.length = 0; }],
  ["REGISTER proof", (db) => { db.state.proofs[0].purpose = "REGISTER"; }],
  ["used proof", (db) => { db.state.proofs[0].usedAt = new Date(); }],
  ["exactly expired proof", (db) => { db.state.proofs[0].expiresAt = new Date(); }],
  ["missing user", (db) => { db.state.users.length = 0; }],
  ["lost proof claim", (db) => { db.failures.proofsClaimMiss = true; }],
]) {
  test(`login rejects ${label} without issuing session`, async (t) => {
    const { db, service } = fixture(t); change(db);
    await assert.rejects(login(service), { statusCode: 401 });
    assert.equal(db.state.sessions.length, 0);
    assert.equal(db.state.refreshTokens.length, 0);
  });
}
for (const input of [null, [], {}, { verificationToken: 123 }, { verificationToken: PROOF, role: "ADMIN" }, { verificationToken: PROOF, phone: PHONE }]) {
  test(`login rejects malformed or extra fields: ${JSON.stringify(input)}`, async (t) => {
    const { service, db } = fixture(t);
    await assert.rejects(service.login(input), { statusCode: 401 });
    assert.equal(db.state.proofs[0].usedAt, null);
  });
}

test("LOGIN proof cannot create two sessions", async (t) => {
  const { service, db } = fixture(t);
  const results = await Promise.allSettled([login(service), login(service)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(db.state.sessions.length, 1);
});

for (const method of ["login", "register"]) {
  for (const failure of ["sessionsCreate", "refreshTokensCreate", "sign"]) {
    test(`${method} rolls back all writes when ${failure} fails`, async (t) => {
      const { service, db, tokens } = fixture(t, method === "register" ? "REGISTER" : "LOGIN");
      const marker = new Error("deliberate test failure");
      if (failure === "sign") tokens.issue = () => { throw marker; };
      else db.failures[failure] = marker;
      await assert.rejects(method === "login" ? login(service) : service.register(details), (e) => e === marker);
      assert.equal(db.state.proofs[0].usedAt, null);
      assert.equal(db.state.sessions.length, 0);
      assert.equal(db.state.refreshTokens.length, 0);
      assert.equal(db.state.users.length, method === "register" ? 0 : 1);
    });
  }
}

test("registration creates MEMBER and session atomically with no second OTP", async (t) => {
  const { service, db } = fixture(t, "REGISTER");
  const result = await service.register(details);
  assert.equal(result.user.role, "MEMBER");
  assert.equal(result.user.phone, PHONE);
  assert.equal(db.state.users.length, 1);
  assert.equal(db.state.sessions.length, 1);
  assert.equal((await service.authenticate(result.accessToken)).user.id, result.user.id);
  await assert.rejects(service.register(details), { statusCode: 400 });
});

test("registration cannot select ADMIN or an unverified phone", async (t) => {
  const { service, db } = fixture(t, "REGISTER");
  for (const extra of [{ role: "ADMIN" }, { phone: "09129876543" }]) {
    await assert.rejects(service.register({ ...details, ...extra }), { statusCode: 400 });
  }
  assert.equal(db.state.users.length, 0);
  assert.equal(db.state.proofs[0].usedAt, null);
});

test("refresh rotates credentials without extending absolute expiry", async (t) => {
  const { service, db } = fixture(t);
  const first = await login(service);
  t.mock.timers.setTime(Date.now() + 60_000);
  const next = await service.refresh(first.refreshToken);
  assert.notEqual(next.refreshToken, first.refreshToken);
  assert.equal(next.refreshExpiresAt, first.refreshExpiresAt);
  assert.equal(db.state.sessions[0].version, 1);
  assert.equal(db.state.refreshTokens.length, 2);
  assert.ok(db.state.refreshTokens[0].usedAt instanceof Date);
  assert.equal(db.state.refreshTokens[1].tokenHash, hash(next.refreshToken));
  assert.equal((await service.authenticate(next.accessToken)).user.id, user.id);
});

test("reusing a rotated refresh token commits revocation of the whole session", async (t) => {
  const { service, db } = fixture(t);
  const first = await login(service);
  const next = await service.refresh(first.refreshToken);
  await assert.rejects(service.refresh(first.refreshToken), { statusCode: 401 });
  assert.ok(db.state.sessions[0].revokedAt instanceof Date);
  await assert.rejects(service.authenticate(first.accessToken), { statusCode: 401 });
  await assert.rejects(service.authenticate(next.accessToken), { statusCode: 401 });
  await assert.rejects(service.refresh(next.refreshToken), { statusCode: 401 });
});

test("overlapping refresh of one token has at most one winner and revokes on reuse", async (t) => {
  const { service, db } = fixture(t);
  const first = await login(service);
  const results = await Promise.allSettled([service.refresh(first.refreshToken), service.refresh(first.refreshToken)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.ok(db.state.sessions[0].revokedAt instanceof Date);
});

for (const failure of ["sessionsClaimMiss", "refreshTokensClaimMiss"]) {
  test(`failed ${failure} denies refresh and revokes session`, async (t) => {
    const { service, db } = fixture(t);
    const first = await login(service); db.failures[failure] = true;
    // A conditional claim miss must not turn into success, even with valid lookup.
    await assert.rejects(service.refresh(first.refreshToken), { statusCode: 401 });
    assert.equal(db.state.refreshTokens.length, 1);
    assert.ok(db.state.sessions[0].revokedAt instanceof Date);
  });
}

test("failed refresh insertion rolls back claim, allowing a safe retry", async (t) => {
  const { service, db } = fixture(t);
  const first = await login(service);
  const marker = new Error("insert failed"); db.failures.refreshTokensCreate = marker;
  await assert.rejects(service.refresh(first.refreshToken), (e) => e === marker);
  assert.equal(db.state.refreshTokens[0].usedAt, null);
  assert.equal(db.state.sessions[0].version, 0);
  delete db.failures.refreshTokensCreate;
  assert.ok((await service.refresh(first.refreshToken)).accessToken);
});

for (const token of [undefined, "", "x", "b".repeat(64)]) {
  test(`invalid refresh is rejected (${String(token).slice(0, 10)})`, async (t) => {
    const { service, db } = fixture(t);
    await assert.rejects(service.refresh(token), { statusCode: 401 });
    assert.equal(db.state.sessions.length, 0);
  });
}

test("logout revokes access and refresh; repeat logout is harmless", async (t) => {
  const { service, db } = fixture(t); const first = await login(service);
  await service.logout(first.refreshToken);
  assert.ok(db.state.sessions[0].revokedAt instanceof Date);
  await assert.rejects(service.authenticate(first.accessToken), { statusCode: 401 });
  await assert.rejects(service.refresh(first.refreshToken), { statusCode: 401 });
  await service.logout(first.refreshToken); await service.logout(undefined);
});

test("logout with a previously rotated token still revokes that session", async (t) => {
  const { service } = fixture(t); const first = await login(service);
  const next = await service.refresh(first.refreshToken);
  await service.logout(first.refreshToken);
  await assert.rejects(service.authenticate(next.accessToken), { statusCode: 401 });
});

test("absolute expiry denies both access and refresh at the exact boundary", async (t) => {
  const { service, db } = fixture(t); const first = await login(service);
  t.mock.timers.setTime(db.state.sessions[0].expiresAt.getTime());
  await assert.rejects(service.authenticate(first.accessToken), { statusCode: 401 });
  await assert.rejects(service.refresh(first.refreshToken), { statusCode: 401 });
});

test("authenticate uses the current database role, not stale client claims", async (t) => {
  const { service, db } = fixture(t); const first = await login(service);
  db.state.users[0].role = "ADMIN";
  assert.equal((await service.authenticate(first.accessToken)).user.role, "ADMIN");
});

test("invalid access or mismatched session user is rejected", async (t) => {
  const { service, db } = fixture(t); const first = await login(service);
  await assert.rejects(service.authenticate("invalid"), { statusCode: 401 });
  db.state.sessions[0].userId = 100;
  await assert.rejects(service.authenticate(first.accessToken), { statusCode: 401 });
});

test("deleted user and missing session cannot authenticate", async (t) => {
  const { service, db } = fixture(t); const first = await login(service);
  db.state.users.length = 0;
  await assert.rejects(service.authenticate(first.accessToken), { statusCode: 401 });
  db.state.sessions.length = 0;
  await assert.rejects(service.authenticate(first.accessToken), { statusCode: 401 });
});
