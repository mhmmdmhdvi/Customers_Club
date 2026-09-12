const path = require("node:path");
const { defineConfig } = require("prisma/config");
const { parseTarget } = require("./scripts/registration-db-check");

const testUrl = parseTarget(
    process.env.TEST_DATABASE_URL,
    process.env.ALLOW_TEST_DATABASE_WRITES
);

module.exports = defineConfig({
    schema: path.join(__dirname, "prisma", "schema.prisma"),
    migrations: {
        path: path.join(__dirname, "prisma", "migrations"),
    },
    datasource: {
        url: testUrl,
    },
});