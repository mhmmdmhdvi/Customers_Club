// Invoked by the guarded Go OpenEmpty harness; ordinary Node tests remain offline.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { Client } = require("pg");
const { runMigration } = require("../../scripts/legacy-migration");
const backend = path.resolve(__dirname, "../..");
const birthday = "20260927125149_add_member_birthday";
const root = path.join(backend, "prisma/migrations");

function cli(args, config) {
    const result = spawnSync(process.execPath, [path.join(backend, "node_modules/prisma/build/index.js"), ...args, "--config", config], { cwd: backend, env: process.env, encoding: "utf8", timeout: 45000 });
    return result.status === 0;
}

async function main(scenario) {
    const raw = process.env.LEGACY_MIGRATION_DATABASE_URL;
    const url = new URL(raw);
    const owned = /^\/mig_test_([a-f0-9]{16})_([a-f0-9]{32})$/.exec(url.pathname);
    assert.ok(owned, "Rehearsal requires an allocated child database");
    assert.equal(url.hostname, "127.0.0.1");
    assert.notEqual(url.port, "5432");
    const db = new Client({ connectionString: raw });
    await db.connect();
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "club-prisma-rehearsal-"));
    try {
        const identity = (await db.query("SELECT current_database() database,current_user username,shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()" )).rows[0];
        assert.equal(identity.database, url.pathname.slice(1));
        assert.equal(identity.username, `mig_owner_${owned[1]}`);
        assert.equal(identity.marker, `customers-club-migration:${owned[1]}:${owned[2]}`);
        const copied = path.join(temp, "migrations");
        fs.mkdirSync(copied);
        for (const name of fs.readdirSync(root)) if (name < birthday && fs.statSync(path.join(root, name)).isDirectory()) fs.cpSync(path.join(root, name), path.join(copied, name), { recursive: true });
        fs.copyFileSync(path.join(root, "migration_lock.toml"), path.join(copied, "migration_lock.toml"));
        const config = path.join(temp, "prisma.config.cjs");
        fs.writeFileSync(config, `const {defineConfig}=require(${JSON.stringify(require.resolve("prisma/config"))}); module.exports=defineConfig({schema:${JSON.stringify(path.join(backend,"prisma/schema.prisma"))},migrations:{path:${JSON.stringify(copied)}},datasource:{url:process.env.LEGACY_MIGRATION_DATABASE_URL}});`);
        if (scenario !== "fresh") {
            if (scenario === "already-applied") fs.cpSync(path.join(root, birthday), path.join(copied, birthday), { recursive: true });
            assert.equal(cli(["migrate", "deploy"], config), true, "Actual Prisma pre-birthday deploy must succeed");
            if (scenario !== "already-applied") await db.query(`INSERT INTO "User" (phone,"firstName","lastName","updatedAt") VALUES ('09123456789',NULL,NULL,'2020-01-01T00:00:00Z')`);
            else await db.query(`INSERT INTO "User" (phone,"firstName","lastName","birthYear","birthMonth","birthDay","updatedAt") VALUES ('09123456789','Existing','Member',1375,7,12,'2020-01-01T00:00:00Z')`);
        }
        if (scenario === "failed") {
            fs.cpSync(path.join(root, birthday), path.join(copied, birthday), { recursive: true });
            assert.equal(cli(["migrate", "deploy"], config), false, "Historical NOT NULL must fail for populated users");
            assert.equal((await db.query(`SELECT count(*)::int n FROM "_prisma_migrations" WHERE migration_name=$1 AND finished_at IS NULL AND rolled_back_at IS NULL`, [birthday])).rows[0].n, 1);
        }
        if (scenario === "interrupted-resolved") {
            // Construct the exact committed DDL + successful Prisma resolve
            // boundary, before the additive migration could deploy.
            await db.query(`BEGIN; ALTER TABLE "User" ADD COLUMN "birthYear" integer, ADD COLUMN "birthMonth" integer, ADD COLUMN "birthDay" integer; COMMENT ON COLUMN "User"."birthYear" IS 'customers-club:nullable-legacy-birthday:v1'; COMMENT ON COLUMN "User"."birthMonth" IS 'customers-club:nullable-legacy-birthday:v1'; COMMENT ON COLUMN "User"."birthDay" IS 'customers-club:nullable-legacy-birthday:v1'; COMMIT`);
            fs.cpSync(path.join(root, birthday), path.join(copied, birthday), { recursive: true });
            assert.equal(cli(["migrate", "resolve", "--applied", birthday], config), true);
        }
        if (scenario === "partial-drift") await db.query(`ALTER TABLE "User" ADD COLUMN "birthYear" integer`);
        if (scenario === "history-drift") await db.query(`UPDATE "_prisma_migrations" SET checksum='unknown' WHERE migration_name=(SELECT min(migration_name) FROM "_prisma_migrations")`);
        if (scenario.endsWith("drift")) {
            await assert.rejects(runMigration(), /drift|history/);
            assert.equal((await db.query(`SELECT count(*)::int n FROM "User"`)).rows[0].n, 1);
            return;
        }
        await runMigration();
        const countBefore = (await db.query(`SELECT count(*)::int n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`)).rows[0].n;
        await runMigration();
        assert.equal((await db.query(`SELECT count(*)::int n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`)).rows[0].n, countBefore, "Rerun must not add applied history");
        const columns = (await db.query(`SELECT column_name,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='User' AND column_name IN ('birthYear','birthMonth','birthDay')`)).rows;
        assert.equal(columns.length, 3);
        assert.ok(columns.every(column => column.is_nullable === "YES"));
        assert.equal(countBefore, fs.readdirSync(root).filter(name => fs.statSync(path.join(root,name)).isDirectory()).length);
        if (scenario === "already-applied") {
            const user = (await db.query(`SELECT "birthYear","birthMonth","birthDay","firstName","lastName" FROM "User" WHERE phone='09123456789'`)).rows[0];
            assert.deepEqual(user, { birthYear: 1375, birthMonth: 7, birthDay: 12, firstName: "Existing", lastName: "Member" });
        }
        if (["populated", "failed", "interrupted-resolved"].includes(scenario)) {
            const { PrismaClient } = require("../../src/generated/prisma");
            const { PrismaPg } = require("@prisma/adapter-pg");
            const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: raw }) });
            try {
                const user = await prisma.user.findUnique({ where: { phone: "09123456789" } });
                assert.equal(user.firstName, null); assert.equal(user.lastName, null);
                assert.equal(user.birthYear, null); assert.equal(user.birthMonth, null); assert.equal(user.birthDay, null);
                assert.equal(user.updatedAt.toISOString(), "2020-01-01T00:00:00.000Z");
            } finally { await prisma.$disconnect(); }
            await assert.rejects(db.query(`UPDATE "User" SET "birthYear"=1400 WHERE phone='09123456789'`), /check constraint/);
            await db.query(`UPDATE "User" SET "birthYear"=1400,"birthMonth"=1,"birthDay"=2 WHERE phone='09123456789'`);
        }
    } finally {
        await db.end();
        // Only remove the unique temporary directory created above.
        fs.rmSync(temp, { recursive: true, force: true });
    }
}
if (require.main === module && process.argv[2]) main(process.argv[2]).catch(error => { console.error("Legacy Prisma rehearsal failed:", error.message); process.exitCode = 1; });
