"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const backend = path.resolve(__dirname, "..");
const permission = "customer_club_test_db";
const targetError = /test-database write permission|TEST_DATABASE_URL is missing or invalid|Refusing any target/;

// Synthetic URLs only. Never read process.env, .env, or a real connection string.
function testUrl(changes = {}) {
  const url = new URL("postgresql://127.0.0.1:5432/customer_club_test_db");
  url.username = "customer_club_test_user";
  url.password = crypto.randomBytes(16).toString("hex");
  Object.assign(url, changes);
  return url.toString();
}

function testEnv() {
  return {
    TEST_DATABASE_URL: testUrl(),
    ALLOW_TEST_DATABASE_WRITES: permission,
    DATABASE_URL: testUrl({ pathname: "/customer_club_db", username: "customer_club_user" }),
    NODE_ENV: "development",
  };
}

// Evaluate the actual reviewed CommonJS sources with a private process/env object.
// Only path/crypto and the real guard module are allowed by default. Unexpected
// imports (including dotenv, Prisma, pg, the app and network modules) fail closed.
// VM is test isolation, NOT a security sandbox for hostile/untrusted JavaScript.
function loadSource(relativePath, env = {}, dependencies = {}) {
  const filename = path.join(backend, relativePath);
  const module = { exports: {} };
  const imports = [];
  const directories = [];
  const context = {
    module, exports: module.exports, __filename: filename, __dirname: path.dirname(filename),
    URL, Buffer,
    process: { env, chdir: (directory) => directories.push(directory) },
    require(name) {
      imports.push(name);
      if (Object.hasOwn(dependencies, name)) return dependencies[name]();
      if (name === "node:path") return path;
      if (name === "node:crypto") return crypto;
      if (name === "./registration-db-check" || name === "./scripts/registration-db-check") {
        return loadSource("scripts/registration-db-check.js", env).exports;
      }
      throw new Error(`Offline test blocked unexpected dependency: ${name}`);
    },
  };
  // require.main is intentionally unset: importing a checker must not start it.
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), context, { filename, timeout: 1000 });
  // Function declarations are visible on this isolated context. Accessing main
  // here does not change the production registration checker's public exports.
  return { exports: module.exports, main: context.main, imports, directories };
}

const guards = loadSource("scripts/registration-db-check.js").exports;

for (const protocol of ["postgresql:", "postgres:"]) {
  for (const search of ["", "?schema=public"]) {
    test(`target accepts exact test identity (${protocol}, ${search || "default schema"})`, () => {
      const raw = testUrl({ protocol, search });
      assert.equal(guards.parseTarget(raw, permission), raw);
    });
  }
}

for (const [label, value] of [
  ["missing", undefined], ["empty", ""], ["false string", "false"],
  ["normal database", "customer_club_db"], ["wrong case", "CUSTOMER_CLUB_TEST_DB"],
]) {
  test(`target rejects ${label} write permission`, () => {
    assert.throws(() => guards.parseTarget(testUrl(), value), targetError);
  });
}

for (const [label, value] of [["missing", undefined], ["empty", ""], ["malformed", "not-a-url"]]) {
  test(`target rejects ${label} TEST_DATABASE_URL`, () => {
    assert.throws(() => guards.parseTarget(value, permission), targetError);
  });
}

for (const [label, changes] of [
  ["non-PostgreSQL scheme", { protocol: "mysql:" }],
  ["normal database", { pathname: "/customer_club_db" }],
  ["another database", { pathname: "/another_test_db" }],
  ["normal login", { username: "customer_club_user" }],
  ["admin login", { username: "postgres" }],
  ["missing password", { password: "" }],
  ["localhost alias", { hostname: "localhost" }],
  ["non-loopback host", { hostname: "db.example.invalid" }],
  ["wrong port", { port: "5433" }],
  ["missing port", { port: "" }],
  ["wrong schema", { search: "?schema=private" }],
  ["connection options", { search: "?options=unsafe" }],
  ["extra query option", { search: "?schema=public&sslmode=disable" }],
  ["fragment", { hash: "#unexpected" }],
]) {
  test(`target rejects ${label} without disclosing its URL`, () => {
    const raw = testUrl(changes);
    assert.throws(() => guards.parseTarget(raw, permission), (error) => {
      assert.match(error.message, targetError);
      assert.equal(error.message.includes(raw), false);
      const password = new URL(raw).password;
      if (password) assert.equal(error.message.includes(password), false);
      return true;
    });
  });
}

function identity() {
  return {
    database: "customer_club_test_db", db_user: "customer_club_test_user",
    login: "customer_club_test_user", schema_name: "public",
    superuser: false, creates_database: false, creates_role: false,
  };
}

test("identity guard accepts the exact non-admin test identity", () => {
  assert.doesNotThrow(() => guards.verifyIdentity(identity()));
});
for (const [label, changes] of [
  ["normal database", { database: "customer_club_db" }],
  ["different current user", { db_user: "postgres" }],
  ["different session login", { login: "postgres" }],
  ["different schema", { schema_name: "private" }],
  ["superuser", { superuser: true }],
  ["CREATEDB", { creates_database: true }],
  ["CREATEROLE", { creates_role: true }],
  ["string privilege flag", { superuser: "false" }],
  ["missing privilege flag", { creates_role: undefined }],
]) {
  test(`identity guard rejects ${label}`, () => {
    assert.throws(() => guards.verifyIdentity({ ...identity(), ...changes }), /do not match the test target/);
  });
}
for (const value of [undefined, null]) {
  test(`identity guard rejects ${String(value)} identity`, () => {
    assert.throws(() => guards.verifyIdentity(value), /do not match the test target/);
  });
}

function loadConfig(env) {
  // Capture the real config's input to defineConfig. This is NOT a Prisma CLI test.
  return loadSource("prisma.test.config.cjs", env, {
    "prisma/config": () => ({ defineConfig: (config) => config }),
  });
}

test("explicit Prisma config selects only the guarded test URL and backend-relative paths", () => {
  const env = testEnv();
  const loaded = loadConfig(env);
  assert.equal(loaded.exports.datasource.url, env.TEST_DATABASE_URL);
  assert.notEqual(loaded.exports.datasource.url, env.DATABASE_URL);
  assert.equal(loaded.exports.schema, path.join(backend, "prisma", "schema.prisma"));
  assert.equal(loaded.exports.migrations.path, path.join(backend, "prisma", "migrations"));
  assert.deepEqual(loaded.directories, []);
  assert.deepEqual(loaded.imports.slice().sort(), ["./scripts/registration-db-check", "node:path", "prisma/config"]);
});

test("explicit Prisma config never reads ordinary DATABASE_URL", () => {
  const env = testEnv();
  Object.defineProperty(env, "DATABASE_URL", {
    get() { throw new Error("Ordinary DATABASE_URL must not be read"); },
  });
  assert.equal(loadConfig(env).exports.datasource.url, env.TEST_DATABASE_URL);
});

test("explicit Prisma config cannot fall back even to a valid ordinary DATABASE_URL", () => {
  const env = testEnv();
  env.DATABASE_URL = env.TEST_DATABASE_URL;
  delete env.TEST_DATABASE_URL;
  assert.throws(() => loadConfig(env), targetError);
});

test("explicit Prisma config validates write permission before exporting a datasource", () => {
  const env = testEnv();
  delete env.ALLOW_TEST_DATABASE_WRITES;
  assert.throws(() => loadConfig(env), targetError);
});

test("explicit Prisma config refuses a normal-database test target", () => {
  const env = testEnv();
  env.TEST_DATABASE_URL = env.DATABASE_URL;
  assert.throws(() => loadConfig(env), targetError);
});

for (const checker of ["registration-db-check.js", "session-db-check.js"]) {
  for (const override of [undefined, "false", "true"]) {
    test(`${checker} removes override=${String(override)} before environment loading`, async () => {
      const env = testEnv();
      if (override !== undefined) env.DOTENV_CONFIG_OVERRIDE = override;
      let atEnv;
      const stop = new Error("Intentional stop before loading any database module");
      const loaded = loadSource(`scripts/${checker}`, env, {
        "../src/config/env": () => { atEnv = { ...env }; return {}; },
        "../src/config/database": () => { throw stop; },
      });
      assert.equal(typeof loaded.main, "function");
      await assert.rejects(loaded.main(), (error) => error === stop);
      assert.ok(atEnv, "The environment-loading boundary must have been reached");
      assert.equal(Object.hasOwn(atEnv, "DOTENV_CONFIG_OVERRIDE"), false);
      assert.equal(atEnv.DATABASE_URL, env.TEST_DATABASE_URL);
      assert.equal(atEnv.NODE_ENV, "test");
      assert.deepEqual(loaded.directories, [backend]);
    });
  }

  for (const [label, change] of [
    ["missing permission", (env) => { delete env.ALLOW_TEST_DATABASE_WRITES; }],
    ["missing test URL", (env) => { delete env.TEST_DATABASE_URL; }],
    ["normal database", (env) => { env.TEST_DATABASE_URL = env.DATABASE_URL; }],
  ]) {
    test(`${checker} rejects ${label} before application imports or environment mutation`, async () => {
      const env = testEnv();
      env.DOTENV_CONFIG_OVERRIDE = "false";
      change(env);
      const before = { ...env };
      const loaded = loadSource(`scripts/${checker}`, env);
      await assert.rejects(loaded.main(), targetError);
      assert.deepEqual(env, before);
      assert.deepEqual(loaded.directories, []);
      assert.equal(loaded.imports.some((name) => name.startsWith("../src/")), false);
    });
  }

  for (const key of ["DATABASE_URL", "NODE_ENV"]) {
    test(`${checker} rejects ${key} changed during environment loading before database import`, async () => {
      const env = testEnv();
      let reached = false;
      const loaded = loadSource(`scripts/${checker}`, env, {
        "../src/config/env": () => { reached = true; env[key] = "changed-by-test"; return {}; },
      });
      await assert.rejects(loaded.main(), /configuration changed the guarded connection settings|Test target changed during configuration/);
      assert.equal(reached, true);
      assert.equal(loaded.imports.includes("../src/config/database"), false);
    });
  }
}
