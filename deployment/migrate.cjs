"use strict";
const fs = require("node:fs");
const password = fs.readFileSync("/run/secrets/app_db_password","utf8").trim();
if (!/^[a-f0-9]{64}$/.test(password)) throw new Error("Invalid application database secret");
process.env.LEGACY_MIGRATION_DATABASE_URL = `postgresql://customer_club_user:${password}@db:5432/customer_club_db?sslmode=disable`;
process.env.LEGACY_MIGRATION_CONFIRM = "migrate:customer_club_db";
// This config never loads .env. The runner checks the actual non-superuser owner
// and history, including safe reconciliation for populated legacy birthdays.
require("./scripts/legacy-migration").runMigration().then(
 () => console.log("Dedicated migration completed."),
 () => {console.error("Dedicated migration refused or failed.");process.exitCode=1;},
);
