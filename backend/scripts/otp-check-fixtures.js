"use strict";
// Manual test-checker support, never imported by application code or normal tests.
const crypto = require("node:crypto");
const { readOtpConfig } = require("../src/config/otp");
const { hashCode } = require("../src/utils/otp-crypto");
const { normalizeIp } = require("../src/utils/otp-ip");
const { bucketKey, lockKey } = require("../src/services/otp-db");
const { createRegistrationService } = require("../src/services/registration.service.factory");
function createCheckFixtures(prisma) {
  const config = readOtpConfig(), ip = "127.0.0.1", sent = new Map();
  const delivery = require("../src/services/otp-delivery");
  const original = delivery.getSender;
  // Explicit fake delivery, scoped to this checker process. Never a public SMS mode.
  delivery.getSender = () => async ({ phone, code }) => { sent.set(phone,code); };
  function record(phone) {
    const code = crypto.randomInt(100_000,1_000_000).toString();
    const nonce = crypto.randomBytes(32).toString("hex");
    return { code, data: { phone, code: null, codeHash: hashCode(config.secret,phone,nonce,code), nonce,
      expiresAt: new Date(Date.now()+120_000), deliveryState: "ACTIVE", failedAttempts: 0 } };
  }
  function registration(client = prisma) {
    const service = createRegistrationService(client);
    return { ...service, verifyPhone: (phone, code) => service.verifyPhone(phone,code,ip) };
  }
  function keysFor(phones) {
    return [...[ip,"::1"].flatMap(peer => [bucketKey(config.secret,"ip:request",normalizeIp(peer)),bucketKey(config.secret,"ip:verify",normalizeIp(peer))]),
      ...[...phones].flatMap(phone=>[bucketKey(config.secret,"phone:request",phone),bucketKey(config.secret,"phone:failure",phone)])];
  }
  async function overlapVerify(phone, action) {
    let readers=0,release,timer;
    const gate=new Promise(r=>{release=r;});
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error("OTP lock barrier timed out")),5000);});
    const rendezvous=Promise.race([gate,timeout]);rendezvous.catch(()=>{});
    const expected=lockKey(`phone:${phone}`);
    const synchronized={ $transaction: (work,options) => prisma.$transaction(async(tx)=>{
      const proxy=new Proxy(tx,{get(target,key){
        if(key==="$queryRaw") return async(strings,...values)=>{
          if(strings.join("").includes("pg_advisory_xact_lock") && values[0]===expected) {
            if(++readers===2) release();
            await rendezvous; // Rendezvous BEFORE lock acquisition, never behind a held phone lock.
          }
          return target.$queryRaw(strings,...values);
        };
        const value=target[key];return typeof value==="function"?value.bind(target):value;
      }});
      return work(proxy);
    },options) };
    try {
      const s=registration(synchronized), outcomes=await Promise.allSettled([action(s,0),action(s,1)]);
      const winners=outcomes.filter(r=>r.status==="fulfilled"),losers=outcomes.filter(r=>r.status==="rejected");
      if(readers!==2 || winners.length!==1 || losers.length!==1) throw new Error("Expected two competing locks and exactly one verification winner");
      return {winner:winners[0].value,error:losers[0].reason};
    } finally {clearTimeout(timer);}
  }
  return { config, ip, record, registration, keysFor, overlapVerify,
    codeFor:(phone)=>sent.get(phone), restoreSender:()=>{delivery.getSender=original;} };
}
module.exports={createCheckFixtures};
