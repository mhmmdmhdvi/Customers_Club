"use strict";
// Manual opt-in. Never a migration, seed command, normal test, or production check.
const crypto=require("node:crypto");
const path=require("node:path");
const {parseTarget,verifyIdentity}=require("./registration-db-check");
async function main() {
  const url=parseTarget(process.env.TEST_DATABASE_URL,process.env.ALLOW_TEST_DATABASE_WRITES);
  process.env.DATABASE_URL=url;process.env.NODE_ENV="test";
  delete process.env.DOTENV_CONFIG_OVERRIDE;
  process.env.DOTENV_CONFIG_QUIET="true";
  process.env.OTP_HMAC_SECRET=crypto.randomBytes(32).toString("hex");
  process.chdir(path.resolve(__dirname,".."));
  require("../src/config/env");
  if(process.env.DATABASE_URL!==url || process.env.NODE_ENV!=="test") throw new Error("Target changed");
  const prisma=require("../src/config/database");
  let verified=false,tools,passed=0;
  const phones=new Set();
  const expect=(value)=>{if(!value)throw new Error("Check assertion failed");};
  const reject=async(action,status)=>{let error;try{await action();}catch(e){error=e;}expect(error?.statusCode===status);};
  async function phone() {
    for(let i=0;i<30;i++) {
      const value=`099${crypto.randomInt(0,100_000_000).toString().padStart(8,"0")}`;
      if(phones.has(value))continue;
      const counts=await Promise.all([prisma.user.count({where:{phone:value}}),prisma.oTPCode.count({where:{phone:value}}),prisma.phoneVerification.count({where:{phone:value}})]);
      if(counts.every(n=>n===0)){phones.add(value);return value;}
    }
    throw new Error("No unused fixture phone available");
  }
  async function check(name,work) {
    try{await work();passed++;console.log(`PASS ${name}`);}
    catch{console.error(`FAIL ${name}: sensitive details withheld`);throw new Error("Stopped at failing check");}
  }
  try {
    const [identity]=await prisma.$queryRaw`
      SELECT current_database()::text AS database,current_user::text AS db_user,
             session_user::text AS login,current_schema()::text AS schema_name,
             rolsuper AS superuser,rolcreatedb AS creates_database,rolcreaterole AS creates_role
      FROM pg_roles WHERE rolname=current_user`;
    verifyIdentity(identity);verified=true;
    if(!prisma.otpRateBucket)throw new Error("Matching generated client required");
    await prisma.otpRateBucket.count();
    await prisma.oTPCode.findFirst({select:{codeHash:true,nonce:true,failedAttempts:true,deliveryState:true}});
    tools=require("./otp-check-fixtures").createCheckFixtures(prisma);
    const {createOtpService}=require("../src/services/otp.service.factory");
    const {bucketKey}=require("../src/services/otp-db");
    const sent=new Map();
    const options={getConfig:()=>tools.config,sendOtp:async({phone,code})=>{sent.set(phone,code);}};
    const service=createOtpService(prisma,options);
    console.log("Verified test target: customer_club_test_db / customer_club_test_user; delivery is FAKE");
    await check("Digest-only storage, proof issuance and single-use consumption",async()=>{
      const p=await phone();await service.createOtp(p,tools.ip);
      const row=await prisma.oTPCode.findFirst({where:{phone:p}});
      expect(row.code===null && /^[a-f0-9]{64}$/.test(row.codeHash));
      const proof=await tools.registration().verifyPhone(p,sent.get(p));
      expect(proof.nextStep==="REGISTER" && proof.authenticated===false);
      await reject(()=>service.verifyOtp(p,sent.get(p),tools.ip),400);
    });
    await check("Five wrong attempts commit despite rejection",async()=>{
      const p=await phone();await service.createOtp(p,tools.ip);
      const wrong=sent.get(p)==="999999"?"888888":"999999";
      for(let i=0;i<5;i++)await reject(()=>tools.registration().verifyPhone(p,wrong),i===4?429:400);
      const row=await prisma.oTPCode.findFirst({where:{phone:p}});expect(row.failedAttempts===5&&!row.used);
      await reject(()=>service.verifyOtp(p,sent.get(p),tools.ip),429);
    });
    await check("Concurrent resends create one active challenge",async()=>{
      const p=await phone();const results=await Promise.allSettled([service.createOtp(p,tools.ip),service.createOtp(p,tools.ip)]);
      expect(results.filter(r=>r.status==="fulfilled").length===1);
      expect(results.find(r=>r.status==="rejected")?.reason.statusCode===429);
      expect(await prisma.oTPCode.count({where:{phone:p,used:false,deliveryState:"ACTIVE"}})===1);
    });
    await check("Competing PostgreSQL phone locks mint one proof",async()=>{
      const p=await phone();await service.createOtp(p,tools.ip);
      const result=await tools.overlapVerify(p,s=>s.verifyPhone(p,sent.get(p)));
      expect(result.error.statusCode===400);
      expect(await prisma.phoneVerification.count({where:{phone:p}})===1);
    });
    await check("Proof failure rolls back real OTP consumption",async()=>{
      const p=await phone();await service.createOtp(p,tools.ip);const marker=new Error("Deliberate rollback");let caught;
      try{await service.verifyOtp(p,sent.get(p),tools.ip,async(tx)=>{
        await tx.phoneVerification.create({data:{phone:p,tokenHash:crypto.randomBytes(32).toString("hex"),purpose:"REGISTER",expiresAt:new Date(Date.now()+300_000)}});
        throw marker;
      });}catch(e){caught=e;}
      expect(caught===marker);expect(await prisma.phoneVerification.count({where:{phone:p}})===0);
      expect((await prisma.oTPCode.findFirst({where:{phone:p}})).used===false);
      expect(await service.verifyOtp(p,sent.get(p),tools.ip)===true);
    });
    await check("Failed delivery preserves the prior active challenge",async()=>{
      const p=await phone();const initial=tools.record(p);await prisma.oTPCode.create({data:initial.data});
      const failing=createOtpService(prisma,{...options,sendOtp:async()=>{throw new Error("Fake provider failure");}});
      await reject(()=>failing.createOtp(p,tools.ip),503);
      expect(await service.verifyOtp(p,initial.code,tools.ip)===true);
    });
    await check("Rolling phone failure budget is persisted",async()=>{
      const p=await phone();await service.createOtp(p,tools.ip);
      // Fixture-only setup models nine earlier failures inside the current rolling window.
      const key=bucketKey(tools.config.secret,"phone:failure",p),now=new Date();
      await prisma.otpRateBucket.upsert({where:{key},create:{key,events:Array(9).fill(now),expiresAt:new Date(now.getTime()+900_000)},update:{events:Array(9).fill(now),expiresAt:new Date(now.getTime()+900_000)}});
      const wrong=sent.get(p)==="999999"?"888888":"999999";
      await reject(()=>service.verifyOtp(p,wrong,tools.ip),429);
      expect((await prisma.otpRateBucket.findUnique({where:{key}})).events.length===10);
      await reject(()=>service.verifyOtp(p,sent.get(p),tools.ip),429);
    });
    await check("Legacy plaintext rows are rejected without rewriting them",async()=>{
      const p=await phone();const row=await prisma.oTPCode.create({data:{phone:p,code:"123456",expiresAt:new Date(Date.now()+120_000)}});
      await reject(()=>service.verifyOtp(p,"123456",tools.ip),400);
      const after=await prisma.oTPCode.findUnique({where:{id:row.id}});expect(after.code==="123456"&&!after.used);
    });
  } finally {
    tools?.restoreSender();
    try {
      if(verified&&phones.size) {
        const where={phone:{in:[...phones]}},keys=tools?.keysFor(phones)||[];
        await prisma.$transaction([
          prisma.phoneVerification.deleteMany({where}),prisma.oTPCode.deleteMany({where}),
          prisma.otpRateBucket.deleteMany({where:{key:{in:keys}}}),
        ]);
        const counts=await Promise.all([prisma.phoneVerification.count({where}),prisma.oTPCode.count({where}),prisma.otpRateBucket.count({where:{key:{in:keys}}})]);
        expect(counts.every(n=>n===0));
        console.log("Cleanup verified: this run's temporary records were removed.");
      }
    } finally {await prisma.$disconnect();}
  }
  console.log(`OTP DB checks: ${passed} passed, 0 failed.`);
}
if(require.main===module)main().catch(()=>{console.error("STOP: OTP DB check failed; credentials and error details withheld");process.exitCode=1;});
module.exports={main};
