// Test-only transactional store. Serializes transactions; NOT a PG-lock emulator.
function createSessionDb(initial = {}) {
  let state = structuredClone({ users: [], proofs: [], sessions: [], refreshTokens: [], otps: [], ...initial });
  let queue = Promise.resolve();
  const failures = {};
  const copy = (v) => structuredClone(v);
  const match = (row, where = {}) => Object.entries(where).every(([key, value]) => {
    if (value && typeof value === "object" && "gt" in value) return row[key] > value.gt;
    return row[key] === value;
  });
  const select = (row, fields) => !row ? null : fields
    ? Object.fromEntries(Object.keys(fields).filter((k) => fields[k]).map((k) => [k, copy(row[k])]))
    : copy(row);
  function model(name) {
    return {
      async findFirst({ where }) { return copy(state[name].find((r) => match(r, where)) || null); },
      async findUnique({ where, select: fields }) { return select(state[name].find((r) => match(r, where)), fields); },
      async create({ data, select: fields }) {
        if (failures[`${name}Create`]) throw failures[`${name}Create`];
        if (name === "users" && state.users.some((u) => u.phone === data.phone)) {
          throw Object.assign(new Error("Unique phone"), { code: "P2002" });
        }
        const row = {
          id: state[name].length + 1, createdAt: new Date(), updatedAt: new Date(),
          ...(name === "proofs" || name === "refreshTokens" ? { usedAt: null } : {}),
          ...(name === "sessions" ? { revokedAt: null, version: 0 } : {}),
          ...copy(data),
        };
        state[name].push(row);
        return select(row, fields);
      },
      async updateMany({ where, data }) {
        if (failures[`${name}ClaimMiss`] && (name !== "sessions" || where.version !== undefined)) return { count: 0 };
        const rows = state[name].filter((r) => match(r, where));
        for (const row of rows) {
          for (const [key, value] of Object.entries(data)) {
            row[key] = value && typeof value === "object" && "increment" in value
              ? row[key] + value.increment : copy(value);
          }
        }
        return { count: rows.length };
      },
    };
  }
  const tx = {
    user: model("users"), phoneVerification: model("proofs"),
    authSession: model("sessions"), refreshToken: model("refreshTokens"), oTPCode: model("otps"),
  };
  const prisma = { ...tx, async $transaction(action) {
    const previous = queue;
    let release;
    queue = new Promise((resolve) => { release = resolve; });
    await previous;
    const before = copy(state);
    try { return await action(tx); }
    catch (error) { state = before; throw error; }
    finally { release(); }
  } };
  return { prisma, failures, get state() { return state; } };
}
module.exports = { createSessionDb };
