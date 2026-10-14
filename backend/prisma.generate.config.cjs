// Generation needs a datasource shape, never a database connection or .env.
const path = require("node:path");
const { defineConfig } = require("prisma/config");
module.exports = defineConfig({
 schema: path.join(__dirname,"prisma/schema.prisma"),
 datasource: { url: "postgresql://offline:unused@127.0.0.1:1/offline_no_connection" },
});
