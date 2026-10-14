// Real Node HTTP routes + Prisma services, synthetic keys, owned child only.
// Never imports dotenv or the production database module.
const assert = require('node:assert/strict');
async function main() {
  assert.equal(process.env.ALLOW_MIGRATION_PERFORMANCE, '1');
  const raw = process.env.PERFORMANCE_DATABASE_URL;
  const url = new URL(raw);
  const owned = /^\/mig_test_([a-f0-9]{16})_([a-f0-9]{32})$/.exec(url.pathname);
  assert.ok(owned);
  assert.equal(url.hostname, '127.0.0.1');
  assert.ok(url.port && url.port !== '5432');
  assert.equal(process.env.PERFORMANCE_CONFIRM, 'read:' + url.pathname.slice(1));
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: raw, max: 6, idleTimeoutMillis: 0 });
  const { rows: [identity] } = await pool.query("SELECT current_database() database,current_user username,shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()");
  assert.equal(identity.database, url.pathname.slice(1));
  assert.equal(identity.username, `mig_owner_${owned[1]}`);
  assert.equal(identity.marker, `customers-club-migration:${owned[1]}:${owned[2]}`);
  const { PrismaClient } = require('../src/generated/prisma');
  const { PrismaPg } = require('@prisma/adapter-pg');
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  function replace(path, exports) { const id = require.resolve(path); require.cache[id] = { id, filename: id, loaded: true, exports }; }
  replace('../src/config/env', { port: 0, nodeEnv: 'test' });
  replace('../src/config/database', prisma);
  process.env.NODE_ENV = 'test';
  process.env.ACCESS_TOKEN_SECRET = Buffer.from('a'.repeat(32)).toString('hex');
  process.env.JWT_ISSUER = 'performance';
  process.env.JWT_AUDIENCE = 'performance';
  process.env.AUTH_ALLOWED_ORIGINS = 'http://localhost:5173';
  const { createAccessTokens } = require('../src/utils/access-token');
  const tokens = createAccessTokens({ secret: Buffer.from('a'.repeat(32)), issuer: 'performance', audience: 'performance', accessTtlSeconds: 900 });
  replace('../src/services/session.service', require('../src/services/session.service.factory').createSessionService(prisma, { tokens }));
  const app = require('../src/app');
  const server = app.listen(0, '127.0.0.1', () => process.stdout.write(`http://127.0.0.1:${server.address().port}\n`));
}
main().catch(() => { process.stderr.write('Owned performance reference failed\n'); process.exitCode = 1; });
