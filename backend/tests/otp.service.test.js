const test = require("node:test");
const assert = require("node:assert/strict");
const { createOtpService } = require("../src/services/otp.service.factory");
const { createOtpDb } = require("./helpers/otp-db");
const { activeOtp, testConfig } = require("./helpers/otp-fixtures");
const PHONE="09121234567", CODE="123456", IP="192.0.2.1";
function fixture(t, rows) {
  t.mock.timers.enable({apis:["Date"],now:1_000});
  const config=testConfig(), sent=[];
  const otps=rows === undefined ? [activeOtp(config,PHONE,CODE,{expiresAt:new Date(2_000)})] : rows;
  const db=createOtpDb({otps});
  const service=createOtpService(db.prisma,{getConfig:()=>config,sendOtp:async(data)=>sent.push(data)});
  return {db,sent,config,service};
}
test("verifyOtp rejects a missing OTP",async(t)=>{
  const f=fixture(t,[]);await assert.rejects(f.service.verifyOtp(PHONE,CODE,IP),{message:"Invalid OTP"});
  assert.equal(f.db.state.otps.length,0);
});
test("verifyOtp rejects an expired OTP",async(t)=>{
  const f=fixture(t);t.mock.timers.setTime(2_001);
  await assert.rejects(f.service.verifyOtp(PHONE,CODE,IP),{message:"OTP expired"});assert.equal(f.db.state.otps[0].used,false);
});
test("verifyOtp marks a valid OTP as used",async(t)=>{
  const f=fixture(t);assert.equal(await f.service.verifyOtp(PHONE,CODE,IP),true);assert.equal(f.db.state.otps[0].used,true);
});
for (const [label,phone,code,used] of [["another phone","09129876543",CODE,false],["incorrect code",PHONE,"654321",false],["used OTP",PHONE,CODE,true]]) {
  test(`verifyOtp rejects ${label}`,async(t)=>{
    const f=fixture(t);f.db.state.otps[0].used=used;
    await assert.rejects(f.service.verifyOtp(phone,code,IP),{message:"Invalid OTP"});assert.equal(f.db.state.otps[0].used,used);
  });
}
test("verifyOtp rejects reuse after successful consumption",async(t)=>{
  const f=fixture(t);await f.service.verifyOtp(PHONE,CODE,IP);
  await assert.rejects(f.service.verifyOtp(PHONE,CODE,IP),{message:"Invalid OTP"});
});
test("createOtp delivers a six-digit code and stores only its digest",async(t)=>{
  const f=fixture(t,[]);await f.service.createOtp(PHONE,IP);
  assert.equal(f.sent.length,1);assert.match(f.sent[0].code,/^\d{6}$/);
  assert.equal(f.db.state.otps[0].phone,PHONE);assert.equal(f.db.state.otps[0].code,null);
  assert.match(f.db.state.otps[0].codeHash,/^[a-f0-9]{64}$/);
});
test("createOtp lifetime is two minutes from the reservation time",async(t)=>{
  const f=fixture(t,[]);await f.service.createOtp(PHONE,IP);assert.equal(f.db.state.otps[0].expiresAt.getTime(),121_000);
});
test("successful creation invalidates previous OTPs only for the same phone",async(t)=>{
  const f=fixture(t);
  f.db.state.otps.push(activeOtp(f.config,PHONE,CODE,{id:2}),activeOtp(f.config,"09129876543",CODE,{id:3}));
  await f.service.createOtp(PHONE,IP);
  assert.deepEqual(f.db.state.otps.map(r=>r.used),[true,true,false,false]);
});
for(const [time,allowed] of [[1_999,true],[2_000,false]]) {
  test(`expiry boundary ${time}: ${allowed}`,async(t)=>{
    const f=fixture(t);t.mock.timers.setTime(time);
    if(allowed) assert.equal(await f.service.verifyOtp(PHONE,CODE,IP),true);
    else {await assert.rejects(f.service.verifyOtp(PHONE,CODE,IP),{message:"OTP expired"});assert.equal(f.db.state.otps[0].used,false);}
  });
}
test("at most one overlapping verification succeeds",async(t)=>{
  const f=fixture(t);const results=await Promise.allSettled([f.service.verifyOtp(PHONE,CODE,IP),f.service.verifyOtp(PHONE,CODE,IP)]);
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
  assert.equal(results.find(r=>r.status==="rejected").reason.message,"Invalid OTP");
});
test("conditional consumption miss cannot call the proof callback",async(t)=>{
  const f=fixture(t);f.db.failures.otpsClaimMiss=true;
  await assert.rejects(f.service.verifyOtp(PHONE,CODE,IP,()=>assert.fail("must not mint proof")),{message:"Invalid OTP"});
});
for(const [phone,code] of [[null,CODE],["08121234567",CODE],[PHONE,123456],[PHONE,"short"]]) {
  test(`invalid OTP input ${JSON.stringify([phone,code])} avoids DB access`,async(t)=>{
    const f=fixture(t);await assert.rejects(f.service.verifyOtp(phone,code,IP),{statusCode:400});assert.equal(f.db.transactions,0);
  });
}
