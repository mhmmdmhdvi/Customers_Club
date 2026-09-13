const test=require("node:test");
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const {createOtpService}=require("../src/services/otp.service.factory");
const {readOtpConfig}=require("../src/config/otp");
const {normalizeIp}=require("../src/utils/otp-ip");
const {hashCode,matchesCode}=require("../src/utils/otp-crypto");
const {createOtpDb}=require("./helpers/otp-db");
const {testConfig,activeOtp}=require("./helpers/otp-fixtures");
const PHONE="09121234567",IP="192.0.2.1";
for(const value of [100_000,999_999]) {
  test(`OTP generation uses crypto.randomInt for ${value}, never Math.random`,async(t)=>{
    const config=testConfig(),db=createOtpDb(),sent=[];
    t.mock.method(crypto,"randomInt",(min,max)=>{assert.equal(min,100_000);assert.equal(max,1_000_000);return value;});
    t.mock.method(Math,"random",()=>{throw new Error("Insecure randomness");});
    await createOtpService(db.prisma,{getConfig:()=>config,sendOtp:async(v)=>sent.push(v)}).createOtp(PHONE,IP);
    assert.equal(sent[0].code,String(value));assert.equal(db.state.otps[0].code,null);
    assert.equal(db.state.otps[0].codeHash,hashCode(config.secret,PHONE,db.state.otps[0].nonce,String(value)));
  });
}
for(const nodeEnv of ["development","test","production"]) {
  test(`no code or phone logs in ${nodeEnv}`,async(t)=>{
    const logs=[];t.mock.method(console,"log",(...args)=>logs.push(args));t.mock.method(console,"error",(...args)=>logs.push(args));
    const env={NODE_ENV:nodeEnv,OTP_HMAC_SECRET:crypto.randomBytes(32).toString("hex")};
    await createOtpService(createOtpDb().prisma,{getConfig:()=>readOtpConfig(env),sendOtp:async()=>{}}).createOtp(PHONE,IP);
    assert.deepEqual(logs,[]);
  });
}
for(const [label,raw] of [["missing",undefined],["empty",""],["short","a".repeat(63)],["non-hex","z".repeat(64)]]) {
  test(`mandatory HMAC secret: rejects ${label}`,()=>{
    assert.throws(()=>readOtpConfig({NODE_ENV:"test",OTP_HMAC_SECRET:raw}),{statusCode:503});
  });
}
for(const nodeEnv of [undefined,"staging",""]) {
  test(`unknown environment ${nodeEnv} fails closed`,()=>{
    assert.throws(()=>readOtpConfig({NODE_ENV:nodeEnv,OTP_HMAC_SECRET:crypto.randomBytes(32).toString("hex")}),{statusCode:503});
  });
}
test("OTP signing cannot reuse the JWT secret",()=>{
  const key=crypto.randomBytes(32).toString("hex");
  assert.throws(()=>readOtpConfig({NODE_ENV:"test",OTP_HMAC_SECRET:key,ACCESS_TOKEN_SECRET:key.toUpperCase()}),{statusCode:503});
});
test("no sender means no fake success and no database writes",async()=>{
  const db=createOtpDb();await assert.rejects(createOtpService(db.prisma,{getConfig:testConfig}).createOtp(PHONE,IP),{statusCode:503});assert.equal(db.transactions,0);
});
test("default runtime sender fails closed",()=>{
  assert.throws(()=>require("../src/services/otp-delivery").getSender(),{statusCode:503});
});
test("missing runtime configuration fails before DB access",async()=>{
  const db=createOtpDb();await assert.rejects(createOtpService(db.prisma,{getConfig:()=>readOtpConfig({})}).verifyOtp(PHONE,"123456",IP),{statusCode:503});assert.equal(db.transactions,0);
});
test("HMAC binds phone, nonce, and code",()=>{
  const config=testConfig(),row=activeOtp(config,PHONE,"123456");
  assert.equal(matchesCode(config.secret,row,PHONE,"123456"),true);
  assert.equal(matchesCode(config.secret,row,"09129876543","123456"),false);
  assert.equal(matchesCode(config.secret,{...row,nonce:crypto.randomBytes(32).toString("hex")},PHONE,"123456"),false);
  assert.equal(matchesCode(config.secret,row,PHONE,"654321"),false);
  assert.equal(matchesCode(crypto.randomBytes(32),row,PHONE,"123456"),false);
});
for(const [value,expected] of [["192.0.2.1","192.0.2.1"],["::ffff:192.0.2.1","192.0.2.1"],["::ffff:c000:201","192.0.2.1"],["2001:0DB8:0:0::1","2001:db8:0:0:0:0:0:1"],["::1","0:0:0:0:0:0:0:1"]]) {
  test(`canonical IP ${value}`,()=>assert.equal(normalizeIp(value),expected));
}
for(const value of [undefined,null,"", "192.0.2.1, 192.0.2.2", "192.0.2.1:80","for=192.0.2.1","fe80::1%eth0"]) {
  test(`invalid IP ${value} fails closed`,()=>assert.throws(()=>normalizeIp(value),{statusCode:503}));
}
