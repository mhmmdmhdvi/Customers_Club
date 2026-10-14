const test = require("node:test");
const assert = require("node:assert/strict");
const { parseLegacyTarget } = require("../scripts/legacy-migration");

test("dedicated legacy target has no DATABASE_URL fallback or dotenv dependency", () => {
    const raw = "postgresql://migration_user:dedicated-password@127.0.0.1:5544/legacy_rehearsal?sslmode=disable";
    assert.equal(parseLegacyTarget(raw, "migrate:legacy_rehearsal"), raw);
    for (const [url, confirm] of [[undefined, "migrate:legacy_rehearsal"], [raw, undefined], [raw, "migrate:other"], [raw.replace("migration_user", "postgres"), "migrate:legacy_rehearsal"], [raw + "&options=unsafe", "migrate:legacy_rehearsal"]]) assert.throws(() => parseLegacyTarget(url, confirm), /explicit dedicated/);
    const fs = require("node:fs");
    for (const file of ["scripts/legacy-migration.js", "prisma.legacy.config.cjs"]) {
        const source = fs.readFileSync(require("node:path").join(__dirname, "..", file), "utf8");
        assert.doesNotMatch(source, /dotenv|process\.env\.DATABASE_URL/);
    }
});
