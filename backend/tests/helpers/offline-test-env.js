"use strict";
// Explicit test preload only: node --require ./tests/helpers/offline-test-env.js --test
// This child process never loads the developer's .env and cannot open pg connections.
const dotenv = require("dotenv");
dotenv.config = () => ({ parsed: {} });
dotenv.configDotenv = () => ({ parsed: {} });
for (const key of ["ACCESS_TOKEN_SECRET","OTP_HMAC_SECRET","JWT_ISSUER","JWT_AUDIENCE","AUTH_ALLOWED_ORIGINS","DOTENV_CONFIG_OVERRIDE","DOTENV_KEY"]) delete process.env[key];
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://offline:unused@127.0.0.1:1/offline_no_connection";
process.env.DOTENV_CONFIG_QUIET = "true";
const pg = require("pg");
function forbidden() { throw new Error("Offline test attempted a real PostgreSQL connection"); }
pg.Pool.prototype.connect = forbidden;
pg.Client.prototype.connect = forbidden;
