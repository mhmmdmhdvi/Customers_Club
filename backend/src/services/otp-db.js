"use strict";
const crypto = require("node:crypto");
const { keyedHash } = require("../utils/otp-crypto");
const { rateLimited } = require("../utils/otp-error");
const QUARTER = 15 * 60_000, DAY = 24 * 60 * 60_000;
const transaction = (prisma, work) => prisma.$transaction(work, {
  isolationLevel: "ReadCommitted", maxWait: 5000, timeout: 10000,
});
function lockKey(scope) {
  return crypto.createHash("sha256").update(`club-otp-lock-v1:${scope}`).digest().readBigInt64BE(0);
}
async function lock(tx, scope) {
  await tx.$executeRaw`SET LOCAL lock_timeout = '3s'`;
  // Cast void to text: Prisma raw-query decoders cannot deserialize PostgreSQL void.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(${lockKey(scope)}::bigint)::text AS lock`;
}
async function now(tx) {
  // Return UTC wall fields as timestamp without time zone. Prisma 7.10
  // replaces timestamptz offsets without converting the local clock fields.
  const [row] = await tx.$queryRaw`SELECT clock_timestamp() AT TIME ZONE 'UTC' AS now`;
  return row.now;
}
function bucketKey(secret, scope, subject) {
  return keyedHash(secret, "club-otp-budget-v1", scope, subject);
}
async function events(tx, key, time, window) {
  const row = await tx.otpRateBucket.findUnique({ where: { key } });
  return (row?.events || []).filter((d) => d.getTime() > time.getTime()-window).sort((a,b) => a-b);
}
function waitFor(list, limit, window, time) {
  // Rejections do not append an event or extend the rolling window.
  return list.length >= limit ? Math.max(1, Math.ceil((list[list.length-limit].getTime()+window-time.getTime())/1000)) : 0;
}
async function append(tx, key, list, time, window) {
  const data = { events: [...list, time], expiresAt: new Date(time.getTime()+window) };
  await tx.otpRateBucket.upsert({ where: { key }, create: { key, ...data }, update: data });
}
async function chargeIp(prisma, secret, ip, operation) {
  const key = bucketKey(secret, `ip:${operation}`, ip);
  const rejected = await transaction(prisma, async (tx) => {
    await lock(tx, `ip:${key}`);
    const time = await now(tx);
    const list = await events(tx, key, time, QUARTER);
    const wait = waitFor(list, operation === "request" ? 30 : 100, QUARTER, time);
    if (wait) return rateLimited(wait);
    await append(tx, key, list, time, QUARTER);
    return null;
  });
  if (rejected) throw rejected;
}
module.exports = { QUARTER, DAY, transaction, lockKey, lock, now, bucketKey, events, waitFor, append, chargeIp };
