"use strict";
// Test-only serialized transaction store. It is NOT a PostgreSQL lock/isolation emulator.
function createOtpDb(initial = {}) {
  let state = structuredClone({ users: [], proofs: [], sessions: [], refreshTokens: [], otps: [], buckets: [], ...initial });
  let queue = Promise.resolve();
  let transactions = 0;
  const failures = {}, statements = [];
  const copy = (v) => structuredClone(v);
  const match = (row, where = {}) => Object.entries(where).every(([key, value]) => {
    if (value && typeof value === "object" && !(value instanceof Date)) {
      if ("gt" in value) return row[key] > value.gt;
      if ("gte" in value) return row[key] >= value.gte;
      if ("lt" in value) return row[key] < value.lt;
      if ("lte" in value) return row[key] <= value.lte;
      if ("not" in value) return row[key] !== value.not;
      if ("in" in value) return value.in.includes(row[key]);
      throw new Error(`Unsupported test predicate: ${key}`);
    }
    return row[key] === value;
  });
  const select = (row, fields) => !row ? null : fields
    ? Object.fromEntries(Object.keys(fields).filter((k) => fields[k]).map((k) => [k, copy(row[k])])) : copy(row);
  function model(name) {
    return {
      async findFirst({ where, orderBy } = {}) {
        const rows = state[name].filter((r) => match(r, where));
        if (orderBy) {
          const [key, direction] = Object.entries(orderBy)[0];
          rows.sort((a,b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * (direction === "desc" ? -1 : 1));
        }
        return copy(rows[0] || null);
      },
      async findUnique({ where, select: fields }) { return select(state[name].find((r) => match(r, where)), fields); },
      async create({ data, select: fields }) {
        if (failures[`${name}Create`]) throw failures[`${name}Create`];
        if (name === "users" && state.users.some((u) => u.phone === data.phone)) {
          throw Object.assign(new Error("Unique phone"), { code: "P2002" });
        }
        const row = {
          id: state[name].reduce((n,r) => Math.max(n, typeof r.id === "number" ? r.id : 0),0) + 1,
          createdAt: new Date(), updatedAt: new Date(),
          ...(name === "proofs" || name === "refreshTokens" ? { usedAt: null } : {}),
          ...(name === "sessions" ? { revokedAt: null, version: 0 } : {}),
          ...(name === "otps" ? { used: false, code: null, failedAttempts: 0 } : {}),
          ...copy(data),
        };
        state[name].push(row); return select(row, fields);
      },
      async updateMany({ where, data }) {
        if (failures[`${name}Update`]) throw failures[`${name}Update`];
        if (name === "otps" && where.id?.not !== undefined && failures.otpsInvalidate) throw failures.otpsInvalidate;
        if (failures[`${name}ClaimMiss`] && (name !== "sessions" || where.version !== undefined)) return { count: 0 };
        const rows = state[name].filter((r) => match(r, where));
        for (const row of rows) for (const [key, value] of Object.entries(data)) {
          row[key] = value && typeof value === "object" && "increment" in value
            ? row[key] + value.increment : copy(value);
        }
        return { count: rows.length };
      },
      async upsert({ where, create, update }) {
        const found = state[name].find((r) => match(r, where));
        if (!found) return this.create({ data: create });
        await this.updateMany({ where, data: update });
        return copy(found);
      },
      async count({where} = {}) { return state[name].filter((r) => match(r,where)).length; },
    };
  }
  const tx = {
    user: model("users"), phoneVerification: model("proofs"), authSession: model("sessions"),
    refreshToken: model("refreshTokens"), oTPCode: model("otps"), otpRateBucket: model("buckets"),
    async $queryRaw(strings, ...values) {
      const sql = strings.join("?"); statements.push({sql, values});
      if (failures.query) throw failures.query;
      if (sql.includes("pg_advisory_xact_lock")) return [{ lock: "" }];
      if (sql.includes("clock_timestamp")) return [{ now: new Date() }];
      throw new Error("Unexpected SQL in test store");
    },
    async $executeRaw(strings) {
      if (strings.join("") !== "SET LOCAL lock_timeout = '3s'") throw new Error("Unexpected SQL execution");
      return 0;
    },
  };
  const prisma = { ...tx, async $transaction(action) {
    transactions++;
    const previous = queue; let release;
    queue = new Promise((resolve) => { release = resolve; });
    await previous;
    const before = copy(state);
    try { return await action(tx); }
    catch (error) { state = before; throw error; }
    finally { release(); }
  }};
  return { prisma, failures, statements, get state() { return state; }, get transactions() { return transactions; } };
}
module.exports = { createOtpDb };
