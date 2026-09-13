"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { now } = require("../src/services/otp-db");

const EPOCH = Date.parse("2026-09-12T12:00:00.123Z");
const UTC_QUERY = "SELECT clock_timestamp() AT TIME ZONE 'UTC' AS now";
const LEGACY_QUERY = "SELECT clock_timestamp() AS now";

// Controlled model of the reviewed Prisma 7.10 adapter conversion boundary.
// It is NOT a PostgreSQL/installed-adapter integration test. Returning UTC wall
// fields as TIMESTAMP avoids the faulty TIMESTAMPTZ offset replacement. The live
// resume checkpoint separately exercises the actual helper through Prisma/PG.
function connection(offsetMinutes, epoch = () => EPOCH) {
  return {
    async $queryRaw(parts, ...parameters) {
      assert.equal(parameters.length, 0, "Clock SQL must not interpolate session settings");
      const sql = parts.join("").replace(/\s+/g, " ").trim();
      if (sql === UTC_QUERY) return [{ now: new Date(epoch()) }];
      if (sql === LEGACY_QUERY) return [{ now: new Date(epoch() + offsetMinutes * 60_000) }];
      assert.fail("Unexpected clock SQL; review the model when changing the clock strategy");
    },
  };
}

for (const [zone, minutes] of [
  ["UTC", 0], ["UTC+03:30", 210], ["UTC-05:00", -300],
  ["UTC+05:45", 345], ["UTC+14:00", 840], ["UTC-12:00", -720],
]) {
  test(`OTP clock returns the database instant for ${zone}`, async () => {
    const result = await now(connection(minutes));
    assert.ok(result instanceof Date);
    assert.equal(result.getTime(), EPOCH);
  });
}

test("OTP clock explicitly selects UTC without changing database/session timezone", async () => {
  let reads = 0;
  const expected = new Date(EPOCH);
  const result = await now({
    async $queryRaw(parts, ...parameters) {
      reads++;
      assert.equal(parts.join("").replace(/\s+/g, " ").trim(), UTC_QUERY);
      assert.deepEqual(parameters, []);
      return [{ now: expected }];
    },
    async $executeRaw() { assert.fail("Clock reads must not change session settings"); },
  });
  assert.equal(reads, 1);
  assert.equal(result, expected);
});

test("OTP clock obtains fresh wall time for every read, not a cached transaction time", async () => {
  let instant = EPOCH;
  const tx = connection(210, () => instant);
  assert.equal((await now(tx)).getTime(), EPOCH);
  instant += 60_001;
  assert.equal((await now(tx)).getTime(), instant);
});

test("OTP clock does not cache a pool connection's timezone correction", async () => {
  for (const offset of [210, -300, 0, 345]) {
    assert.equal((await now(connection(offset))).getTime(), EPOCH);
  }
});

test("A fresh application-clock OTP remains live under a non-UTC DB timezone", async () => {
  const expiresAt = new Date(EPOCH + 120_000);
  const time = await now(connection(210));
  assert.ok(expiresAt > time);
  assert.equal(expiresAt - time, 120_000);
});

test("OTP clock propagates a database failure instead of falling back to application time", async () => {
  const failure = new Error("Synthetic clock-read failure");
  await assert.rejects(now({ async $queryRaw() { throw failure; } }), error => error === failure);
});
