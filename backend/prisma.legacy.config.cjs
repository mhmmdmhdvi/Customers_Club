const path = require("node:path");
const { defineConfig } = require("prisma/config");
const { parseLegacyTarget } = require("./scripts/legacy-migration");
const target = parseLegacyTarget(process.env.LEGACY_MIGRATION_DATABASE_URL, process.env.LEGACY_MIGRATION_CONFIRM);
module.exports = defineConfig({
    schema: path.join(__dirname, "prisma/schema.prisma"),
    migrations: { path: path.join(__dirname, "prisma/migrations") },
    datasource: { url: target },
});
