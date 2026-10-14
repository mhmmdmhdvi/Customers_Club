const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { Client } = require("pg");
const BIRTHDAY = "20260927125149_add_member_birthday";
const NULLABLE = "20261014120000_allow_legacy_birthday";
const MARKER = "customers-club:nullable-legacy-birthday:v1";
const backend = path.resolve(__dirname, "..");
const migrations = path.join(backend, "prisma/migrations");
const refusal = () => new Error("Refusing migration: explicit dedicated target URL and matching migrate:database confirmation required");

function parseLegacyTarget(raw, confirmation) {
    let url;
    try { url = new URL(raw); } catch { throw refusal(); }
    const database = url.pathname.slice(1);
    if (url.protocol !== "postgresql:" || !url.hostname || !url.port || !url.username || !url.password || url.username === "postgres" || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(database) || confirmation !== `migrate:${database}` || url.hash) throw refusal();
    const entries = [...url.searchParams];
    if (entries.some(([key, value]) => !(key === "schema" && value === "public") && !(key === "sslmode" && ["disable", "require", "verify-full"].includes(value))) || new Set(entries.map(([key]) => key)).size !== entries.length) throw refusal();
    return raw;
}

function runPrisma(args, raw, confirmation) {
    const result = spawnSync(process.execPath, [path.join(backend, "node_modules/prisma/build/index.js"), ...args, "--config", path.join(backend, "prisma.legacy.config.cjs")], {
        cwd: backend, env: { ...process.env, LEGACY_MIGRATION_DATABASE_URL: raw, LEGACY_MIGRATION_CONFIRM: confirmation }, encoding: "utf8", timeout: 60000,
    });
    if (result.status !== 0) {
        const details = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.replaceAll(raw, "[target]").replaceAll(new URL(raw).password, "[redacted]").replace(/postgres(?:ql)?:\/\/\S+/g, "[target]");
        throw new Error(`Prisma ${args.slice(0, 2).join(" ")} failed: ${details}`);
    }
}

async function birthdayState(db) {
    return (await db.query(`SELECT a.attname name,a.atttypid::regtype::text type,a.attnotnull required,col_description(a.attrelid,a.attnum) marker,pg_get_expr(d.adbin,d.adrelid) default_value FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public."User"'::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attname`)).rows;
}

async function runMigration() {
    const raw = parseLegacyTarget(process.env.LEGACY_MIGRATION_DATABASE_URL, process.env.LEGACY_MIGRATION_CONFIRM);
    const confirmation = process.env.LEGACY_MIGRATION_CONFIRM;
    const url = new URL(raw);
    const db = new Client({ connectionString: raw, connectionTimeoutMillis: 5000, query_timeout: 15000 });
    try {
        await db.connect();
        await db.query("SET lock_timeout='10s'; SET statement_timeout='15s'");
        const identity = (await db.query(`SELECT current_database() database,current_user username,session_user login,current_schema() schema,pg_get_userbyid(d.datdba) owner,r.rolsuper superuser,r.rolcreaterole create_role FROM pg_database d JOIN pg_roles r ON r.rolname=current_user WHERE d.datname=current_database()`)).rows[0];
        if (identity.database !== url.pathname.slice(1) || identity.username !== decodeURIComponent(url.username) || identity.login !== identity.username || identity.owner !== identity.username || identity.schema !== "public" || identity.superuser || identity.create_role) throw refusal();
        // Serializes this runner through reconciliation and Prisma deployment.
        await db.query("SELECT pg_advisory_lock(824709114)");
        const files = fs.readdirSync(migrations).filter(name => fs.existsSync(path.join(migrations, name, "migration.sql"))).sort();
        const checksums = new Map(files.map(name => [name, crypto.createHash("sha256").update(fs.readFileSync(path.join(migrations, name, "migration.sql"))).digest("hex")]));
        const tables = (await db.query(`SELECT tablename FROM pg_tables WHERE schemaname='public'`)).rows.map(row => row.tablename);
        const history = tables.includes("_prisma_migrations") ? (await db.query(`SELECT migration_name,checksum,finished_at,rolled_back_at FROM "_prisma_migrations" ORDER BY started_at,id`)).rows : [];
        for (const row of history) if (!checksums.has(row.migration_name) || row.checksum !== checksums.get(row.migration_name) || (!row.finished_at && !row.rolled_back_at && row.migration_name !== BIRTHDAY)) throw new Error("Migration history drift: unknown, modified or failed prior migration");
        const applied = history.filter(row => row.finished_at && !row.rolled_back_at).map(row => row.migration_name).sort();
        if (new Set(applied).size !== applied.length || applied.some((name, index) => files[index] !== name)) throw new Error("Migration history drift: applied history is not the expected prefix");
        const activeFailed = history.filter(row => !row.finished_at && !row.rolled_back_at);
        if (activeFailed.length > 1) throw new Error("Migration history drift: multiple failed pending entries");
        if (!tables.includes("User")) {
            if (applied.length || activeFailed.length || tables.some(name => name !== "_prisma_migrations")) throw new Error("Schema drift: expected empty fresh database");
        } else {
            const before = files.filter(name => name < BIRTHDAY);
            if (before.some(name => !applied.includes(name))) throw new Error("Migration history drift: pre-birthday history incomplete");
            const columns = await birthdayState(db);
            const base = columns.filter(column => !["birthYear", "birthMonth", "birthDay"].includes(column.name));
            const expected = { id: ["integer", true], phone: ["text", true], firstName: ["text", false], lastName: ["text", false], role: ['"Role"', true], createdAt: ["timestamp without time zone", true], updatedAt: ["timestamp without time zone", true] };
            if (base.length !== 7 || base.some(column => !expected[column.name] || column.type !== expected[column.name][0] || column.required !== expected[column.name][1])) throw new Error("Schema drift: unexpected pre-birthday User columns");
            const birthdays = columns.filter(column => ["birthYear", "birthMonth", "birthDay"].includes(column.name));
            const birthdayApplied = applied.includes(BIRTHDAY);
            const recovered = birthdays.length === 3 && birthdays.every(column => column.type === "integer" && !column.required && column.default_value === null && column.marker === MARKER);
            const expectedApplied = birthdays.length === 3 && birthdays.every(column => column.type === "integer" && column.default_value === null && column.required === !applied.includes(NULLABLE));
            // Resolve can finish before deploy. Only our exact marked,
            // default-free nullable DDL may resume that intermediate history.
            const pendingOwnedRecovery = recovered && !applied.includes(NULLABLE);
            if (birthdayApplied ? !expectedApplied && !pendingOwnedRecovery : birthdays.length !== 0 && !recovered) throw new Error("Schema drift: unexpected or partially added birthday columns");
            if (birthdayApplied && activeFailed.length) throw new Error("Migration history drift: birthday both failed and applied");
            if (applied.includes(NULLABLE)) {
                const constraint = (await db.query(`SELECT convalidated,pg_get_expr(conbin,conrelid) expression FROM pg_constraint WHERE conrelid='public."User"'::regclass AND conname='User_birthday_all_or_none' AND contype='c'`)).rows;
                const expected = '"birthYear"ISNULLAND"birthMonth"ISNULLAND"birthDay"ISNULLOR"birthYear"ISNOTNULLAND"birthMonth"ISNOTNULLAND"birthDay"ISNOTNULL';
                if (constraint.length !== 1 || !constraint[0].convalidated || constraint[0].expression.replace(/[\s()]/g, "") !== expected) throw new Error("Schema drift: missing or changed validated birthday constraint");
            }
            const populated = (await db.query(`SELECT EXISTS(SELECT 1 FROM "User") populated`)).rows[0].populated;
            if (!birthdayApplied && (populated || activeFailed.length || recovered)) {
                if (!recovered) {
                    await db.query("BEGIN");
                    try {
                        await db.query(`LOCK TABLE "User" IN ACCESS EXCLUSIVE MODE`);
                        const locked = await birthdayState(db);
                        if (locked.some(column => ["birthYear", "birthMonth", "birthDay"].includes(column.name))) throw new Error("Schema drift during birthday reconciliation");
                        await db.query(`ALTER TABLE "User" ADD COLUMN "birthYear" integer,ADD COLUMN "birthMonth" integer,ADD COLUMN "birthDay" integer`);
                        for (const name of ["birthYear", "birthMonth", "birthDay"]) await db.query(`COMMENT ON COLUMN "User"."${name}" IS '${MARKER}'`);
                        await db.query("COMMIT");
                    } catch (error) { await db.query("ROLLBACK"); throw error; }
                }
                if (activeFailed.length) runPrisma(["migrate", "resolve", "--rolled-back", BIRTHDAY], raw, confirmation);
                runPrisma(["migrate", "resolve", "--applied", BIRTHDAY], raw, confirmation);
            }
        }
        runPrisma(["migrate", "deploy"], raw, confirmation);
    } finally { await db.end(); }
}
module.exports = { parseLegacyTarget, runMigration };
if (require.main === module) runMigration().then(() => console.log("Dedicated legacy migration completed."), () => { console.error("Dedicated legacy migration refused or failed. Verify the explicit target, schema and migration history before retrying."); process.exitCode = 1; });
