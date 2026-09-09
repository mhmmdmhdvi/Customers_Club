// Test-only transactional substitute. Serialized callbacks do not model PG locks.
function createRegistrationDb({ otps = [], users = [], proofs = [] } = {}) {
  let state = structuredClone({ otps, users, proofs });
  let queue = Promise.resolve();
  let transactions = 0;
  const failures = {};
  const copy = (value) => structuredClone(value);
  const matches = (row, where) => Object.entries(where).every(([key, value]) => {
    if (value && typeof value === "object" && "gt" in value) {
      return row[key] > value.gt;
    }
    return row[key] === value;
  });
  const pick = (row, select) => {
    if (!row) return null;
    return select ? Object.fromEntries(Object.keys(select).map((k) => [k, copy(row[k])])) : copy(row);
  };
  const update = (rows, { where, data }) => {
    const found = rows.filter((row) => matches(row, where));
    found.forEach((row) => Object.assign(row, copy(data)));
    return { count: found.length };
  };
  const tx = {
    oTPCode: {
      findFirst: async ({ where }) => copy(state.otps.find((row) => matches(row, where)) || null),
      updateMany: async (query) => update(state.otps, query),
    },
    user: {
      findUnique: async ({ where, select }) => pick(state.users.find((row) => matches(row, where)), select),
      create: async ({ data, select }) => {
        if (failures.userCreate) throw failures.userCreate;
        if (state.users.some((row) => row.phone === data.phone)) {
          throw Object.assign(new Error("Unique phone"), { code: "P2002" });
        }
        const row = { id: state.users.length + 1, createdAt: new Date(), updatedAt: new Date(), ...copy(data) };
        state.users.push(row);
        return pick(row, select);
      },
    },
    phoneVerification: {
      findUnique: async ({ where }) => copy(state.proofs.find((row) => matches(row, where)) || null),
      create: async ({ data }) => {
        if (failures.proofCreate) throw failures.proofCreate;
        const row = { id: state.proofs.length + 1, usedAt: null, createdAt: new Date(), ...copy(data) };
        state.proofs.push(row);
        return copy(row);
      },
      updateMany: async (query) => failures.claimMiss ? { count: 0 } : update(state.proofs, query),
    },
  };
  const prisma = {
    async $transaction(work) {
      transactions += 1;
      const previous = queue;
      let release;
      queue = new Promise((resolve) => { release = resolve; });
      await previous;
      const saved = copy(state);
      try { return await work(tx); }
      catch (error) { state = saved; throw error; }
      finally { release(); }
    },
  };
  for (const name of ["user", "phoneVerification", "oTPCode"]) {
    Object.defineProperty(prisma, name, { get() { throw new Error("DB access must be inside transaction"); } });
  }
  return { prisma, failures, get state() { return state; }, get transactions() { return transactions; } };
}
module.exports = { createRegistrationDb };
