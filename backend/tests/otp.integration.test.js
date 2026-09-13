const test=require("node:test");
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const {createRegistrationService}=require("../src/services/registration.service.factory");
const {createAuthController}=require("../src/controllers/auth.controller.factory");
const {OtpError,rateLimited,unavailable}=require("../src/utils/otp-error");
const {createRegistrationDb}=require("./helpers/registration-db");
const PHONE="09121234567",IP="192.0.2.1";
function fixture(t, users=[]) {
  t.mock.timers.enable({apis:["Date"],now:1_000_000});
  const db=createRegistrationDb({users,otps:[{id:1,phone:PHONE,code:"123456",used:false,expiresAt:new Date(1_120_000)}]});
  return {db,service:createRegistrationService(db.prisma,{otpOptions:{getConfig:()=>db.otpConfig}})};
}
for(const [purpose,users] of [["REGISTER",[]],["LOGIN",[{id:1,phone:PHONE,role:"MEMBER"}]]]) {
  test(`secured OTP still issues a hashed ${purpose} proof, not a session`,async(t)=>{
    const {db,service}=fixture(t,users);
    const proof=await service.verifyPhone("+989121234567","123456",IP);
    assert.equal(proof.authenticated,false);assert.equal(proof.nextStep,purpose);
    assert.equal(proof.verificationExpiresAt,new Date(1_300_000).toISOString());
    assert.equal(db.state.proofs[0].tokenHash,crypto.createHash("sha256").update(proof.verificationToken).digest("hex"));
    assert.equal(db.state.otps[0].used,true);assert.equal(db.state.sessions.length,0);
    await assert.rejects(service.verifyPhone(PHONE,"123456",IP),{statusCode:400});
    assert.equal(db.state.proofs.length,1);
  });
}
test("incorrect registration verification retains attempts and does not mint a proof",async(t)=>{
  const {db,service}=fixture(t);
  await assert.rejects(service.verifyPhone(PHONE,"999999",IP),{statusCode:400});
  assert.equal(db.state.otps[0].failedAttempts,1);assert.equal(db.state.proofs.length,0);assert.equal(db.state.otps[0].used,false);
});
test("proof creation error rolls back OTP consumption through the real registration factory",async(t)=>{
  const {db,service}=fixture(t);db.failures.proofCreate=new Error("deliberate proof error");
  await assert.rejects(service.verifyPhone(PHONE,"123456",IP),/deliberate proof error/);
  assert.equal(db.state.otps[0].used,false);assert.equal(db.state.proofs.length,0);
  delete db.failures.proofsCreate;
  assert.equal((await service.verifyPhone(PHONE,"123456",IP)).nextStep,"REGISTER");
});
test("the registration factory propagates the correct 429 and retains the fifth failure",async(t)=>{
  const {db,service}=fixture(t);
  for(let i=0;i<5;i++) await assert.rejects(service.verifyPhone(PHONE,"999999",IP),{statusCode:i===4?429:400});
  assert.equal(db.state.otps[0].failedAttempts,5);assert.equal(db.state.proofs.length,0);
});
test("proof registration still derives MEMBER and phone from the consumed proof",async(t)=>{
  const {db,service}=fixture(t);const proof=await service.verifyPhone(PHONE,"123456",IP);
  const input={verificationToken:proof.verificationToken,firstName:" خسرو ",lastName:" وفایی "};
  await assert.rejects(service.register({...input,role:"ADMIN"}),{statusCode:400});
  const user=await service.register(input);
  assert.equal(user.role,"MEMBER");assert.equal(user.phone,PHONE);assert.equal(user.firstName,"خسرو");
  assert.ok(db.state.proofs[0].usedAt instanceof Date);
  await assert.rejects(service.register(input),{statusCode:400});
});
function response() {return {code:200,headers:{},body:null,
  set(k,v){this.headers[k]=v;return this;},status(v){this.code=v;return this;},json(v){this.body=v;return this;}};}
for(const operation of ["requestCode","verifyCode"]) {
  for(const [name,error,status] of [["rate",rateLimited(35),429],["configuration",unavailable(),503],["invalid",new OtpError(),400],["unexpected",new Error("secret-provider-payload"),500]]) {
    test(`HTTP ${operation} safely maps ${name} failure`,async(t)=>{
      const logs=[];t.mock.method(console,"error",(...v)=>logs.push(v));
      const fail=async()=>{throw error;};
      const api=createAuthController({otpService:{createOtp:fail},registrationService:{verifyPhone:fail}}),res=response();
      await api[operation]({ip:IP,body:{phone:PHONE,code:"123456"}},res);
      assert.equal(res.code,status);assert.equal(res.headers["Cache-Control"],"no-store");
      if(status===429) assert.equal(res.headers["Retry-After"],"35");
      else assert.equal(res.headers["Retry-After"],undefined);
      assert.ok(!JSON.stringify({body:res.body,logs}).includes("secret-provider-payload"));
    });
  }
}
test("HTTP boundary forwards req.ip, not the supplied spoofed headers or body",async()=>{
  const seen=[];const api=createAuthController({otpService:{createOtp:async(...v)=>seen.push(v)},registrationService:{verifyPhone:async(...v)=>{seen.push(v);return {};}}});
  const req={ip:IP,headers:{"x-forwarded-for":"203.0.113.1"},body:{phone:"+989121234567",code:" 123456 ",ip:"203.0.113.2"}};
  const res=response();await api.requestCode(req,res);await api.verifyCode(req,response());
  assert.deepEqual(seen,[[PHONE,IP],[PHONE,"123456",IP]]);assert.equal(res.code,200);assert.equal(res.body.message,"Code sent");
});
