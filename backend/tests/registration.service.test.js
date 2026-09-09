const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createRegistrationService } = require("../src/services/registration.service.factory");
const { createRegistrationDb } = require("./helpers/registration-db");

const PHONE = "09121234567";
const CODE = "123456";
const NOW = 1_000_000;
const hash = (token) => crypto.createHash("sha256").update(token).digest("hex");

function fixture(t, options = {}) {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const db = createRegistrationDb({
    otps: [{ id: 1, phone: PHONE, code: CODE, used: false, expiresAt: new Date(NOW + 120_000) }],
    ...options,
  });
  return { db, service: createRegistrationService(db.prisma) };
}
const input = (verificationToken, extra = {}) => ({ verificationToken, firstName: " خسرو ", lastName: " وفایی ", ...extra });

test("verifyPhone issues a hashed five-minute registration proof after OTP success", async (t) => {
  const { db, service } = fixture(t);
  const logs = t.mock.method(console, "log", () => {});
  const result = await service.verifyPhone("+989121234567", CODE);
  assert.equal(result.nextStep, "REGISTER");
  assert.equal(result.authenticated, false);
  assert.match(result.verificationToken, /^[a-f0-9]{64}$/);
  assert.equal(result.verificationExpiresAt, new Date(NOW + 300_000).toISOString());
  assert.equal(db.state.otps[0].used, true);
  assert.equal(db.state.proofs.length, 1);
  assert.equal(db.state.proofs[0].phone, PHONE);
  assert.equal(db.state.proofs[0].purpose, "REGISTER");
  assert.equal(db.state.proofs[0].tokenHash, hash(result.verificationToken));
  assert.ok(!JSON.stringify(db.state).includes(result.verificationToken));
  assert.equal(logs.mock.callCount(), 0);
});

test("verifyPhone issues LOGIN proof for existing members without creating a session", async (t) => {
  const { db, service } = fixture(t, { users: [{ id: 1, phone: PHONE, role: "MEMBER" }] });
  const result = await service.verifyPhone(PHONE, CODE);
  assert.equal(result.nextStep, "LOGIN");
  assert.equal(result.authenticated, false);
  assert.equal(db.state.proofs[0].purpose, "LOGIN");
  assert.equal(db.state.users.length, 1);
  assert.equal(result.user, undefined);
});

for (const [label, phone, code, message] of [
  ["wrong code", PHONE, "654321", "Invalid OTP"],
  ["wrong phone", "09129876543", CODE, "Invalid OTP"],
]) {
  test(`verifyPhone rejects ${label} without creating proof`, async (t) => {
    const { db, service } = fixture(t);
    await assert.rejects(service.verifyPhone(phone, code), { message });
    assert.equal(db.state.proofs.length, 0);
    assert.equal(db.state.otps[0].used, false);
  });
}

test("OTP at exact expiry cannot mint a proof", async (t) => {
  const { db, service } = fixture(t);
  t.mock.timers.setTime(NOW + 120_000);
  await assert.rejects(service.verifyPhone(PHONE, CODE), { message: "OTP expired" });
  assert.equal(db.state.proofs.length, 0);
});

test("OTP reuse cannot mint a second proof", async (t) => {
  const { db, service } = fixture(t);
  await service.verifyPhone(PHONE, CODE);
  await assert.rejects(service.verifyPhone(PHONE, CODE), { message: "Invalid OTP" });
  assert.equal(db.state.proofs.length, 1);
});

test("proof insert failure rolls back OTP consumption in the transaction substitute", async (t) => {
  const { db, service } = fixture(t);
  db.failures.proofCreate = new Error("database unavailable");
  await assert.rejects(service.verifyPhone(PHONE, CODE), { message: "database unavailable" });
  assert.equal(db.state.otps[0].used, false);
  assert.equal(db.state.proofs.length, 0);
});

for (const [label, phone, code] of [
  ["non-string phone", [PHONE], CODE],
  ["invalid phone", "08121234567", CODE],
  ["numeric code", PHONE, 123456],
  ["short code", PHONE, "12345"],
]) {
  test(`verifyPhone rejects ${label} before database access`, async (t) => {
    const { db, service } = fixture(t);
    await assert.rejects(service.verifyPhone(phone, code), (error) => error.statusCode === 400);
    assert.equal(db.transactions, 0);
  });
}

test("register derives phone from proof and creates a trimmed MEMBER", async (t) => {
  const { db, service } = fixture(t);
  const proof = await service.verifyPhone(PHONE, CODE);
  const result = await service.register(input(proof.verificationToken));
  assert.equal(result.phone, PHONE);
  assert.equal(result.role, "MEMBER");
  assert.equal(result.firstName, "خسرو");
  assert.equal(result.lastName, "وفایی");
  assert.equal(db.state.users.length, 1);
  assert.equal(db.state.proofs[0].usedAt.getTime(), NOW);
  assert.equal(result.tokenHash, undefined);
});

test("registration proof cannot be reused", async (t) => {
  const { db, service } = fixture(t);
  const proof = await service.verifyPhone(PHONE, CODE);
  await service.register(input(proof.verificationToken));
  await assert.rejects(service.register(input(proof.verificationToken)), { message: "Invalid or expired verification" });
  assert.equal(db.state.users.length, 1);
});

for (const offset of [300_000, 300_001]) {
  test(`registration rejects expired proof at offset ${offset}`, async (t) => {
    const { db, service } = fixture(t);
    const proof = await service.verifyPhone(PHONE, CODE);
    t.mock.timers.setTime(NOW + offset);
    await assert.rejects(service.register(input(proof.verificationToken)), { message: "Invalid or expired verification" });
    assert.equal(db.state.users.length, 0);
    assert.equal(db.state.proofs[0].usedAt, null);
  });
}

test("registration accepts proof immediately before expiry", async (t) => {
  const { service } = fixture(t);
  const proof = await service.verifyPhone(PHONE, CODE);
  t.mock.timers.setTime(NOW + 299_999);
  assert.equal((await service.register(input(proof.verificationToken))).role, "MEMBER");
});

test("a LOGIN proof cannot authorize registration", async (t) => {
  const { db, service } = fixture(t, { users: [{ id: 1, phone: PHONE, role: "ADMIN" }] });
  const proof = await service.verifyPhone(PHONE, CODE);
  await assert.rejects(service.register(input(proof.verificationToken)), { message: "Invalid or expired verification" });
  assert.equal(db.state.users[0].role, "ADMIN");
  assert.equal(db.state.proofs[0].usedAt, null);
});

test("an unknown correctly formatted proof is rejected", async (t) => {
  const { db, service } = fixture(t);
  await assert.rejects(service.register(input("a".repeat(64))), { message: "Invalid or expired verification" });
  assert.equal(db.state.users.length, 0);
});

for (const [label, extra] of [
  ["role escalation", { role: "ADMIN" }],
  ["phone replacement", { phone: "09129876543" }],
  ["verified flag", { verified: true }],
  ["missing first name", { firstName: undefined }],
  ["empty last name", { lastName: "  " }],
  ["array name", { firstName: ["test"] }],
  ["control characters", { firstName: "A\nB" }],
  ["oversized name", { firstName: "a".repeat(81) }],
  ["invalid token", { verificationToken: "short" }],
]) {
  test(`register rejects ${label} without consuming proof`, async (t) => {
    const { db, service } = fixture(t);
    const proof = await service.verifyPhone(PHONE, CODE);
    const before = db.transactions;
    await assert.rejects(service.register(input(proof.verificationToken, extra)), (error) => error.statusCode === 400);
    assert.equal(db.transactions, before);
    assert.equal(db.state.proofs[0].usedAt, null);
    assert.equal(db.state.users.length, 0);
  });
}

for (const body of [null, [], "body", undefined]) {
  test(`register rejects non-object body ${JSON.stringify(body)}`, async (t) => {
    const { db, service } = fixture(t);
    await assert.rejects(service.register(body), (error) => error.statusCode === 400);
    assert.equal(db.transactions, 0);
  });
}

test("failed conditional proof claim must not create a member", async (t) => {
  const { db, service } = fixture(t);
  const proof = await service.verifyPhone(PHONE, CODE);
  db.failures.claimMiss = true;
  await assert.rejects(service.register(input(proof.verificationToken)), { message: "Invalid or expired verification" });
  assert.equal(db.state.users.length, 0);
});

test("user insert failure rolls back proof consumption in the transaction substitute", async (t) => {
  const { db, service } = fixture(t);
  const proof = await service.verifyPhone(PHONE, CODE);
  db.failures.userCreate = new Error("insert unavailable");
  await assert.rejects(service.register(input(proof.verificationToken)), { message: "insert unavailable" });
  assert.equal(db.state.proofs[0].usedAt, null);
  assert.equal(db.state.users.length, 0);
});

test("a unique phone conflict is mapped without upgrading an existing account", async (t) => {
  const { db, service } = fixture(t);
  const proof = await service.verifyPhone(PHONE, CODE);
  db.failures.userCreate = Object.assign(new Error("duplicate"), { code: "P2002" });
  await assert.rejects(service.register(input(proof.verificationToken)), { message: "Phone already registered", statusCode: 409 });
  assert.equal(db.state.proofs[0].usedAt, null);
});

test("registration notices a member created after proof issuance", async (t) => {
  const { db, service } = fixture(t);
  const proof = await service.verifyPhone(PHONE, CODE);
  db.state.users.push({ id: 2, phone: PHONE, role: "ADMIN" });
  await assert.rejects(service.register(input(proof.verificationToken)), { message: "Phone already registered", statusCode: 409 });
  assert.equal(db.state.users.length, 1);
  assert.equal(db.state.users[0].role, "ADMIN");
});

test("two registration submissions create one member in the serialized transaction substitute", async (t) => {
  const { db, service } = fixture(t);
  const proof = await service.verifyPhone(PHONE, CODE);
  const result = await Promise.allSettled([
    service.register(input(proof.verificationToken)), service.register(input(proof.verificationToken)),
  ]);
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(result.filter((r) => r.status === "rejected").length, 1);
  assert.equal(db.state.users.length, 1);
});
