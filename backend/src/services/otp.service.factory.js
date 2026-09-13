"use strict";
const crypto = require("node:crypto");
const { readOtpConfig } = require("../config/otp");
const { normalizePhone, isValidIranianPhone } = require("../utils/phone");
const { normalizeIp } = require("../utils/otp-ip");
const { hashCode, matchesCode } = require("../utils/otp-crypto");
const { OtpError, unavailable, rateLimited } = require("../utils/otp-error");
const db = require("./otp-db");
const TTL = 120_000, COOLDOWN = 60_000;

function phoneInput(raw) {
  const phone = normalizePhone(raw);
  if (!isValidIranianPhone(phone)) throw new OtpError("Invalid phone number");
  return phone;
}
async function deliver(sender, message) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(unavailable()); }, 8000);
  });
  try { await Promise.race([Promise.resolve().then(() => sender({ ...message, signal: controller.signal })), deadline]); }
  finally { clearTimeout(timer); }
}
function createOtpService(prisma, { getConfig = readOtpConfig, sendOtp, getSender } = {}) {
  function config() {
    const c = getConfig();
    if (!c || !Buffer.isBuffer(c.secret) || c.secret.length !== 32) throw unavailable();
    return c;
  }
  async function createOtp(rawPhone, rawIp) {
    const phone = phoneInput(rawPhone), ip = normalizeIp(rawIp), { secret } = config();
    const sender = sendOtp || getSender?.();
    if (typeof sender !== "function") throw unavailable();
    // IP attempts commit independently, including phone quota/delivery failures.
    await db.chargeIp(prisma, secret, ip, "request");
    const code = crypto.randomInt(100_000, 1_000_000).toString();
    const nonce = crypto.randomBytes(32).toString("hex");
    const key = db.bucketKey(secret, "phone:request", phone);
    const reserved = await db.transaction(prisma, async (tx) => {
      await db.lock(tx, `phone:${phone}`);
      const time = await db.now(tx);
      const list = await db.events(tx, key, time, db.DAY);
      const recent = list.filter((d) => d.getTime() > time.getTime()-db.QUARTER);
      const pending = await tx.oTPCode.findFirst({
        where: { phone, used: false, deliveryState: "PENDING", expiresAt: { gt: time } }, orderBy: { id: "desc" },
      });
      const wait = Math.max(db.waitFor(list,20,db.DAY,time), db.waitFor(recent,5,db.QUARTER,time),
        list.length ? Math.ceil((list.at(-1).getTime()+COOLDOWN-time.getTime())/1000) : 0,
        pending ? Math.ceil((pending.expiresAt.getTime()-time.getTime())/1000) : 0);
      if (wait > 0) return { error: rateLimited(wait) };
      await db.append(tx, key, list, time, db.DAY);
      const otp = await tx.oTPCode.create({ data: {
        phone, code: null, codeHash: hashCode(secret,phone,nonce,code), nonce,
        failedAttempts: 0, deliveryState: "PENDING", expiresAt: new Date(time.getTime()+TTL),
      }});
      return { otp };
    });
    if (reserved.error) throw reserved.error;
    const otp = reserved.otp;
    try { await deliver(sender, { phone, code, expiresAt: otp.expiresAt }); }
    catch {
      await db.transaction(prisma, async (tx) => {
        await db.lock(tx, `phone:${phone}`);
        await tx.oTPCode.updateMany({ where: { id: otp.id, deliveryState: "PENDING" }, data: { deliveryState: "FAILED", used: true } });
      });
      throw unavailable();
    }
    // Do not hold database locks during external delivery. Previous active codes
    // remain usable until a non-expired replacement is successfully activated.
    const rejected = await db.transaction(prisma, async (tx) => {
      await db.lock(tx, `phone:${phone}`);
      const time = await db.now(tx);
      const claimed = await tx.oTPCode.updateMany({
        where: { id: otp.id, used: false, deliveryState: "PENDING", expiresAt: { gt: time } },
        data: { deliveryState: "ACTIVE" },
      });
      if (claimed.count !== 1) return unavailable();
      await tx.oTPCode.updateMany({ where: { phone, used: false, id: { not: otp.id } }, data: { used: true } });
      return null;
    });
    if (rejected) throw rejected;
    // Neither code nor digest is returned to HTTP callers or logs.
  }

  async function verifyOtp(rawPhone, rawCode, rawIp, onVerified = async () => true) {
    const phone = phoneInput(rawPhone);
    if (typeof rawCode !== "string" || !/^\d{6}$/.test(rawCode.trim())) throw new OtpError("Code must contain exactly 6 digits");
    const code = rawCode.trim(), ip = normalizeIp(rawIp), { secret } = config();
    await db.chargeIp(prisma, secret, ip, "verify");
    const key = db.bucketKey(secret, "phone:failure", phone);
    const result = await db.transaction(prisma, async (tx) => {
      await db.lock(tx, `phone:${phone}`);
      const time = await db.now(tx);
      const failures = await db.events(tx, key, time, db.QUARTER);
      const blocked = db.waitFor(failures,10,db.QUARTER,time);
      if (blocked) return { error: rateLimited(blocked) };
      const otp = await tx.oTPCode.findFirst({ where: { phone, used: false, deliveryState: "ACTIVE" }, orderBy: { id: "desc" } });
      const expired = otp && otp.expiresAt <= time;
      if (otp && !expired && otp.failedAttempts >= 5) {
        return { error: rateLimited((otp.expiresAt-time)/1000) };
      }
      if (!otp || expired || !matchesCode(secret, otp, phone, code)) {
        await db.append(tx,key,failures,time,db.QUARTER);
        if (otp && !expired) await tx.oTPCode.updateMany({ where: { id: otp.id, used: false }, data: { failedAttempts: { increment: 1 } } });
        const phoneWait = db.waitFor([...failures,time],10,db.QUARTER,time);
        const otpWait = otp && !expired && otp.failedAttempts+1 >= 5 ? (otp.expiresAt-time)/1000 : 0;
        return { error: Math.max(phoneWait,otpWait) > 0 ? rateLimited(Math.max(phoneWait,otpWait)) : new OtpError(expired ? "OTP expired" : "Invalid OTP") };
      }
      const consumed = await tx.oTPCode.updateMany({
        where: { id: otp.id, used: false, deliveryState: "ACTIVE", failedAttempts: { lt: 5 }, expiresAt: { gt: time } },
        data: { used: true },
      });
      if (consumed.count !== 1) return { error: new OtpError() };
      // A thrown proof/database error rolls back consumption. Invalid-code errors
      // above are returned, then thrown OUTSIDE the transaction to retain counts.
      return { value: await onVerified(tx, time) };
    });
    if (result.error) throw result.error;
    return result.value;
  }
  return { createOtp, verifyOtp };
}
module.exports = { createOtpService };
