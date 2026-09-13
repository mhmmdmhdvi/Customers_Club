const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createOtpService } = require("../src/services/otp.service.factory");
const { createOtpDb } = require("./helpers/otp-db");
const PHONE = "09121234567", IP = "192.0.2.1";

function fixture(t, initial = {}) {
  t.mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
  const db = createOtpDb(initial), sent = [];
  const config = { secret: crypto.randomBytes(32) };
  const options = { getConfig: () => config, sendOtp: async (message) => { sent.push(message); } };
  return { db, sent, config, options, service: createOtpService(db.prisma, options) };
}

test("new OTP storage never persists plaintext", async (t) => {
  const {service, db} = fixture(t);
  await service.createOtp(PHONE, IP);
  assert.equal(db.state.otps[0].code, null);
  assert.match(db.state.otps[0].codeHash, /^[a-f0-9]{64}$/);
});

const { hashCode } = require("../src/utils/otp-crypto");
const { activeOtp } = require("./helpers/otp-fixtures");
const { bucketKey, lockKey, QUARTER, DAY } = require("../src/services/otp-db");
const denied = (promise, status = 429) => assert.rejects(promise, (e) => e.statusCode === status && (status !== 429 || e.retryAfter >= 1));
function seed(f, phone = PHONE, code = "123456", extra = {}) {
  const row = activeOtp(f.config, phone, code, { id: f.db.state.otps.length+1, ...extra });
  f.db.state.otps.push(row); return row;
}

for (const [offset, allowed] of [[59_999,false],[60_000,true]]) {
  test(`resend at ${offset}ms: ${allowed}`, async (t) => {
    const f=fixture(t); await f.service.createOtp(PHONE,IP); t.mock.timers.tick(offset);
    if (allowed) { await f.service.createOtp(PHONE,IP); assert.equal(f.sent.length,2); }
    else { await denied(f.service.createOtp(PHONE,IP)); assert.equal(f.sent.length,1); }
  });
}
test("phone request limit is five in a rolling 15-minute window", async (t) => {
  const f=fixture(t);
  for(let i=0;i<5;i++) { await f.service.createOtp(PHONE,IP); t.mock.timers.tick(60_000); }
  await denied(f.service.createOtp(PHONE,IP));
  assert.equal(f.sent.length,5);
  t.mock.timers.setTime(1_000_000+QUARTER);
  await f.service.createOtp(PHONE,IP);
  assert.equal(f.sent.length,6);
});
test("phone request limit is twenty in a rolling 24-hour window", async (t) => {
  const f=fixture(t);
  for(let i=0;i<20;i++) { await f.service.createOtp(PHONE,IP); t.mock.timers.tick(QUARTER); }
  await denied(f.service.createOtp(PHONE,IP));
  t.mock.timers.setTime(1_000_000+DAY);
  await f.service.createOtp(PHONE,IP);
  assert.equal(f.sent.length,21);
});
test("IP request budget is shared across phones and service instances", async (t) => {
  const f=fixture(t), second=createOtpService(f.db.prisma,f.options);
  for(let i=0;i<30;i++) await f.service.createOtp(`0912000${String(i).padStart(4,"0")}`,IP);
  await denied(second.createOtp("09123334444",IP));
  await second.createOtp("09123334444","192.0.2.2");
  assert.equal(f.sent.length,31);
  assert.ok(f.db.state.buckets.every((b)=>b.events.length<=30));
});
test("IP verification budget includes rejected attempts across phones", async (t) => {
  const f=fixture(t);
  for(let i=0;i<100;i++) await denied(f.service.verifyOtp(`0912000${String(i).padStart(4,"0")}`,"123456",IP),400);
  await denied(f.service.verifyOtp("09123334444","123456",IP));
  t.mock.timers.tick(QUARTER);
  await denied(f.service.verifyOtp("09123334444","123456",IP),400);
});
test("all five incorrect guesses commit and the fifth blocks this challenge", async (t) => {
  const f=fixture(t); seed(f);
  for(let i=1;i<=5;i++) {
    await denied(f.service.verifyOtp(PHONE,"999999",IP),i===5?429:400);
    assert.equal(f.db.state.otps[0].failedAttempts,i);
  }
  await denied(f.service.verifyOtp(PHONE,"123456",IP));
  assert.equal(f.db.state.otps[0].used,false);
  assert.equal(f.db.state.otps[0].failedAttempts,5);
});
test("a resend cannot reset the ten-failure phone budget", async (t) => {
  const f=fixture(t); seed(f);
  for(let i=0;i<5;i++) await denied(f.service.verifyOtp(PHONE,"999999",IP),i===4?429:400);
  await f.service.createOtp(PHONE,IP);
  const right=f.sent.at(-1).code, wrong=right==="999999"?"888888":"999999";
  for(let i=0;i<5;i++) await denied(f.service.verifyOtp(PHONE,wrong,IP),i===4?429:400);
  t.mock.timers.tick(60_000);
  await f.service.createOtp(PHONE,IP);
  await denied(f.service.verifyOtp(PHONE,f.sent.at(-1).code,IP));
  assert.equal(f.db.state.buckets.find(b=>b.key===bucketKey(f.config.secret,"phone:failure",PHONE)).events.length,10);
});
test("quota rejection does not extend the rolling lockout", async (t) => {
  const f=fixture(t);
  for(let i=0;i<10;i++) await denied(f.service.verifyOtp(PHONE,"999999",IP),i===9?429:400);
  t.mock.timers.tick(60_000);
  await denied(f.service.verifyOtp(PHONE,"999999",IP));
  t.mock.timers.setTime(1_000_000+QUARTER);
  seed(f);
  assert.equal(await f.service.verifyOtp(PHONE,"123456",IP),true);
});
test("correct code after four mistakes still succeeds exactly once", async (t) => {
  const f=fixture(t); seed(f);
  for(let i=0;i<4;i++) await denied(f.service.verifyOtp(PHONE,"999999",IP),400);
  assert.equal(await f.service.verifyOtp(PHONE,"123456",IP),true);
  await denied(f.service.verifyOtp(PHONE,"123456",IP),400);
});
test("overlapping issuance reserves only one challenge across instances", async (t) => {
  const f=fixture(t), other=createOtpService(f.db.prisma,f.options);
  const results=await Promise.allSettled([f.service.createOtp(PHONE,IP),other.createOtp(PHONE,IP)]);
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
  assert.equal(results.find(r=>r.status==="rejected").reason.statusCode,429);
  assert.equal(f.sent.length,1);
  assert.equal(f.db.state.otps.filter(o=>!o.used&&o.deliveryState==="ACTIVE").length,1);
});
test("overlapping valid verifications invoke the proof callback once", async (t) => {
  const f=fixture(t); seed(f); let calls=0;
  const accept=async(tx)=>{calls++;await tx.phoneVerification.create({data:{phone:PHONE,tokenHash:"synthetic"}});return "proof";};
  const results=await Promise.allSettled([f.service.verifyOtp(PHONE,"123456",IP,accept),f.service.verifyOtp(PHONE,"123456",IP,accept)]);
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
  assert.equal(calls,1); assert.equal(f.db.state.proofs.length,1);
});
test("overlapping wrong guesses cannot exceed the per-challenge cap", async (t) => {
  const f=fixture(t); seed(f);
  const results=await Promise.allSettled(Array.from({length:8},()=>f.service.verifyOtp(PHONE,"999999",IP)));
  assert.equal(results.filter(r=>r.status==="fulfilled").length,0);
  assert.equal(f.db.state.otps[0].failedAttempts,5);
});
test("proof failure rolls back consumption but retains the independently charged IP budget", async (t) => {
  const f=fixture(t); seed(f); const marker=new Error("deliberate insert failure");
  await assert.rejects(f.service.verifyOtp(PHONE,"123456",IP,async(tx)=>{await tx.phoneVerification.create({data:{phone:PHONE}});throw marker;}),e=>e===marker);
  assert.equal(f.db.state.otps[0].used,false); assert.equal(f.db.state.proofs.length,0);
  const budget=f.db.state.buckets.find(b=>b.key===bucketKey(f.config.secret,"ip:verify",IP));
  assert.equal(budget.events.length,1);
  assert.equal(await f.service.verifyOtp(PHONE,"123456",IP),true);
});
test("failed insertion cannot invalidate an existing challenge or consume the phone quota", async (t) => {
  const f=fixture(t); seed(f); const marker=new Error("insert failed"); f.db.failures.otpsCreate=marker;
  await assert.rejects(f.service.createOtp(PHONE,IP),e=>e===marker);
  assert.equal(f.db.state.otps.length,1); assert.equal(f.db.state.otps[0].used,false);
  assert.equal(f.db.state.buckets.some(b=>b.key===bucketKey(f.config.secret,"phone:request",PHONE)),false);
  assert.equal(f.sent.length,0);
});
test("failed delivery preserves the old challenge and counts the reserved send", async (t) => {
  const f=fixture(t); seed(f);
  const service=createOtpService(f.db.prisma,{...f.options,sendOtp:async()=>{throw new Error("provider-secret");}});
  await denied(service.createOtp(PHONE,IP),503);
  assert.equal(f.db.state.otps[0].used,false); assert.equal(f.db.state.otps[1].deliveryState,"FAILED");
  assert.equal(f.db.state.otps[1].used,true);
  assert.equal(f.db.state.buckets.find(b=>b.key===bucketKey(f.config.secret,"phone:request",PHONE)).events.length,1);
  assert.equal(await f.service.verifyOtp(PHONE,"123456",IP),true);
});
test("pending delivery is not verifiable and does not hold the transaction lock", async (t) => {
  const f=fixture(t); let delivered; const gate=new Promise(r=>{delivered=r;});
  const service=createOtpService(f.db.prisma,{...f.options,sendOtp:async(message)=>{f.sent.push(message);await gate;}});
  const creating=service.createOtp(PHONE,IP);
  while(f.sent.length===0) await new Promise(setImmediate);
  await denied(f.service.verifyOtp(PHONE,f.sent[0].code,IP),400);
  delivered(); await creating;
  assert.equal(await f.service.verifyOtp(PHONE,f.sent[0].code,IP),true);
});
test("late delivery cannot activate an expired challenge", async (t) => {
  const f=fixture(t); seed(f);
  const service=createOtpService(f.db.prisma,{...f.options,sendOtp:async()=>t.mock.timers.tick(120_000)});
  await denied(service.createOtp(PHONE,IP),503);
  assert.equal(f.db.state.otps[1].deliveryState,"PENDING");
  assert.equal(f.db.state.otps[0].used,false);
});
test("resend and verify use the same PostgreSQL phone lock key", async (t) => {
  const f=fixture(t); await f.service.createOtp(PHONE,IP); await f.service.verifyOtp(PHONE,f.sent[0].code,IP);
  assert.equal(f.db.statements.filter(s=>s.sql.includes("pg_advisory_xact_lock")&&s.values[0]===lockKey(`phone:${PHONE}`)).length,3);
  assert.ok(f.db.statements.every(s=>!s.sql.includes(PHONE))); // Bound values, not SQL interpolation.
});
test("IP address spelling cannot evade shared budgets", async (t) => {
  const f=fixture(t);
  for(let i=0;i<30;i++) await f.service.createOtp(`0912000${String(i).padStart(4,"0")}`,IP);
  await denied(f.service.createOtp("09123334444","::ffff:192.0.2.1"));
});
test("legacy plaintext rows remain intact and cannot authenticate", async (t) => {
  const f=fixture(t,{otps:[{id:1,phone:PHONE,code:"123456",used:false,expiresAt:new Date(1_120_000)}]});
  await denied(f.service.verifyOtp(PHONE,"123456",IP),400);
  assert.equal(f.db.state.otps[0].code,"123456"); assert.equal(f.db.state.otps[0].used,false);
});
test("corrupted digest or nonce fails closed without a timing comparison exception", async (t) => {
  const f=fixture(t); const row=seed(f); row.codeHash="bad";
  await denied(f.service.verifyOtp(PHONE,"123456",IP),400);
  row.codeHash=hashCode(f.config.secret,PHONE,row.nonce,"123456"); row.nonce="bad";
  await denied(f.service.verifyOtp(PHONE,"123456",IP),400);
});
for(const fail of ["query","bucketsCreate","bucketsUpdate"]) {
  test(`database failure ${fail} never falls back to unmetered authentication`,async(t)=>{
    const f=fixture(t);seed(f);const marker=new Error("database-private");
    if(fail==="bucketsUpdate") await denied(f.service.verifyOtp(PHONE,"999999",IP),400);
    f.db.failures[fail]=marker;
    await assert.rejects(f.service.verifyOtp(PHONE,"123456",IP),e=>e===marker);
    assert.equal(f.db.state.otps[0].used,false);
  });
}

test("activation failure rolls back replacement activation and preserves the old code",async(t)=>{
  const f=fixture(t);seed(f);const marker=new Error("Deliberate activation failure");
  f.db.failures.otpsInvalidate=marker;
  await assert.rejects(f.service.createOtp(PHONE,IP),e=>e===marker);
  assert.equal(f.db.state.otps[0].used,false);
  assert.equal(f.db.state.otps[1].deliveryState,"PENDING");
  assert.equal(f.db.state.buckets.find(b=>b.key===bucketKey(f.config.secret,"phone:request",PHONE)).events.length,1);
});
test("delivery timeout aborts the sender, marks failure, and does not activate",async(t)=>{
  t.mock.timers.enable({apis:["Date","setTimeout"],now:1_000_000});
  const db=createOtpDb(),config={secret:crypto.randomBytes(32)};let signal,release;
  const gate=new Promise(r=>{release=r;});
  const service=createOtpService(db.prisma,{getConfig:()=>config,sendOtp:async(message)=>{signal=message.signal;await gate;}});
  const issuing=service.createOtp(PHONE,IP);
  const rejection=assert.rejects(issuing,{statusCode:503});
  while(!signal)await new Promise(setImmediate);
  t.mock.timers.tick(8000);await rejection;release();
  assert.equal(signal.aborted,true);assert.equal(db.state.otps[0].deliveryState,"FAILED");assert.equal(db.state.otps[0].used,true);
});
test("missing transport IP cannot silently bypass metering",async(t)=>{
  const f=fixture(t);seed(f);
  await denied(f.service.verifyOtp(PHONE,"123456"),503);
  await denied(f.service.createOtp(PHONE),503);
  assert.equal(f.db.transactions,0);
});
