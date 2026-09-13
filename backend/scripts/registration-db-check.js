"use strict";

// Explicit opt-in only. This filename is not discovered by `node --test`.
// No migrations, .env writes, table truncation, or database resets.
const crypto = require("node:crypto");
const path = require("node:path");

class CheckFailure extends Error { }

function expect(condition, message) {
    if (!condition) throw new CheckFailure(message);
}

function parseTarget(raw, permission) {
    expect(permission === "customer_club_test_db", "Explicit test-database write permission is missing");
    let url;
    try { url = new URL(raw); }
    catch { throw new CheckFailure("TEST_DATABASE_URL is missing or invalid"); }
    expect(
        ["postgresql:", "postgres:"].includes(url.protocol) &&
        url.hostname === "127.0.0.1" && url.port === "5432" &&
        url.pathname === "/customer_club_test_db" &&
        url.username === "customer_club_test_user" && Boolean(url.password) &&
        !url.hash &&
        [...url.searchParams].every(([key, value]) => key === "schema" && value === "public"),
        "Refusing any target except the dedicated local test database and test login"
    );
    return url.toString();
}

function verifyIdentity(row) {
    expect(row && row.database === "customer_club_test_db" &&
        row.db_user === "customer_club_test_user" && row.login === "customer_club_test_user" &&
        row.schema_name === "public" && row.superuser === false &&
        row.creates_database === false && row.creates_role === false,
        "Connected database, schema, or role privileges do not match the test target");
}

function safeError(error) {
    if (error instanceof CheckFailure) return error.message;
    // Never print a connection URL, password, proof token, or raw Prisma exception.
    const code = typeof error?.code === "string" && /^[A-Z0-9_]{2,40}$/.test(error.code)
        ? error.code : "CHECK_ERROR";
    return `${code}; sensitive error details withheld`;
}

async function main() {
    const connectionString = parseTarget(
        process.env.TEST_DATABASE_URL, process.env.ALLOW_TEST_DATABASE_WRITES
    );

    // Set these only in this child process, before any application imports.
    process.env.DATABASE_URL = connectionString;
    process.env.NODE_ENV = "test";
    process.env.OTP_HMAC_SECRET = crypto.randomBytes(32).toString("hex");
    // Ephemeral credentials for this check process only, never written to .env.
    process.env.ACCESS_TOKEN_SECRET = crypto.randomBytes(32).toString("hex");
    process.env.JWT_ISSUER = "registration-db-check";
    process.env.JWT_AUDIENCE = "registration-db-check-client";
    process.env.AUTH_ALLOWED_ORIGINS = "http://localhost:5173";
    delete process.env.DOTENV_CONFIG_OVERRIDE;
    process.env.DOTENV_CONFIG_QUIET = "true";
    process.chdir(path.resolve(__dirname, ".."));
    require("../src/config/env");
    expect(process.env.DATABASE_URL === connectionString && process.env.NODE_ENV === "test",
        "Application configuration changed the guarded connection settings");

    const prisma = require("../src/config/database");
    const phones = new Set();
    let otpFixtures;
    let identityVerified = false;
    let passed = 0;
    let failed = 0;
    let completed = false;
    const originalConsoleError = console.error;
    const originalConsoleLog = console.log;

    try {
        const [identity] = await prisma.$queryRaw`
            SELECT current_database()::text AS database, current_user::text AS db_user,
                   session_user::text AS login, current_schema()::text AS schema_name,
                   rolsuper AS superuser, rolcreatedb AS creates_database,
                   rolcreaterole AS creates_role
            FROM pg_roles WHERE rolname = current_user`;
        verifyIdentity(identity);
        identityVerified = true;
        console.log("Verified test target: customer_club_test_db / customer_club_test_user");
        expect(Boolean(prisma.phoneVerification && prisma.otpRateBucket), "Regenerate Prisma Client before running this check");
        await prisma.phoneVerification.count(); // Fail before seeding if the table is absent.
        await prisma.otpRateBucket.count();
        otpFixtures = require("./otp-check-fixtures").createCheckFixtures(prisma);

        const request = require("supertest");
        const app = require("../src/app");
        const { createRegistrationService } = require("../src/services/registration.service.factory");
        const service = otpFixtures.registration(prisma);
        const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
        const details = (verificationToken) => ({
            verificationToken, firstName: "Integration", lastName: "Member",
        });
        // Suppress raw application errors and OTP logs in this isolated check process.
        console.error = () => originalConsoleError("Application error logged (details withheld)");
        console.log = () => { };
        const info = (message) => originalConsoleLog(message);

        async function check(name, action) {
            try {
                await action();
                passed += 1;
                info(`PASS ${name}`);
            } catch (error) {
                failed += 1;
                originalConsoleError(`FAIL ${name}: ${safeError(error)}`);
                throw new CheckFailure("A database check failed; remaining checks were not run");
            }
        }

        async function newPhone() {
            // Do not reuse any phone already present in any of the three tables.
            for (let attempt = 0; attempt < 20; attempt += 1) {
                const phone = `099${crypto.randomInt(0, 100_000_000).toString().padStart(8, "0")}`;
                if (phones.has(phone)) continue;
                const counts = await Promise.all([
                    prisma.user.count({ where: { phone } }),
                    prisma.oTPCode.count({ where: { phone } }),
                    prisma.phoneVerification.count({ where: { phone } }),
                ]);
                if (counts.every((count) => count === 0)) {
                    phones.add(phone);
                    return phone;
                }
            }
            throw new CheckFailure("Could not reserve a fresh fixture phone; nothing was overwritten");
        }

        async function seedOtp(phone) {
            const fixture = otpFixtures.record(phone);
            const row = await prisma.oTPCode.create({ data: fixture.data });
            return { ...row, code: fixture.code }; // Test memory only; stored code remains null.
        }

        async function issueProof(phone) {
            const otp = await seedOtp(phone);
            const proof = await service.verifyPhone(phone, otp.code);
            return { otp, proof };
        }

        function post(path, body) {
            return request(app).post(path).set("X-CSRF-Protection", "1").send(body).timeout({ response: 5000, deadline: 10000 });
        }

        // Force both independent real transactions to read BEFORE either can update.
        async function overlap(model, method, action, phone) {
            if (model === "oTPCode") return otpFixtures.overlapVerify(phone, action);
            // Registration-only races below still rendezvous on their selected read.
            let readers = 0;
            let release;
            const gate = new Promise((resolve) => { release = resolve; });
            let timer;
            const expired = new Promise((_, reject) => {
                timer = setTimeout(() => reject(new CheckFailure("Concurrent-read barrier timed out")), 5000);
            });
            const rendezvous = Promise.race([gate, expired]);
            rendezvous.catch(() => { });
            const synchronizedDb = {
                $transaction: (callback) => prisma.$transaction(async (tx) => {
                    const scoped = { user: tx.user, oTPCode: tx.oTPCode, phoneVerification: tx.phoneVerification };
                    const delegated = {};
                    for (const operation of ["create", "findUnique", "findFirst", "updateMany"]) {
                        delegated[operation] = (args) => tx[model][operation](args);
                    }
                    delegated[method] = async (args) => {
                        const row = await tx[model][method](args);
                        readers += 1;
                        if (readers === 2) release();
                        await rendezvous;
                        return row;
                    };
                    scoped[model] = delegated;
                    return callback(scoped);
                }, { maxWait: 10000, timeout: 15000 }),
            };
            try {
                const guardedService = createRegistrationService(synchronizedDb);
                const outcomes = await Promise.allSettled([
                    action(guardedService, 0), action(guardedService, 1),
                ]);
                expect(readers === 2, "Both transactions must reach the intended read barrier");
                const winners = outcomes.filter((item) => item.status === "fulfilled");
                const losers = outcomes.filter((item) => item.status === "rejected");
                expect(winners.length === 1 && losers.length === 1,
                    "Exactly one competing operation must succeed");
                return { winner: winners[0].value, error: losers[0].reason };
            } finally { clearTimeout(timer); }
        }

        function failBeforeCommit() {
            const marker = new CheckFailure("Deliberate pre-commit failure");
            let reached = false;
            const failingService = otpFixtures.registration({
                $transaction: (callback) => prisma.$transaction(async (tx) => {
                    const result = await callback(tx);
                    // Ignore the independently committed IP-budget transaction.
                    if (result?.value?.verificationToken || result?.role) {
                        reached = true;
                        throw marker; // Roll back proof/OTP or account/proof writes.
                    }
                    return result;
                }),
            });
            return { failingService, marker, reached: () => reached };
        }

        await check("HTTP OTP -> verification proof -> MEMBER registration", async () => {
            const phone = await newPhone();
            const internationalPhone = `+98${phone.slice(1)}`;
            const sent = await post("/auth/request-code", { phone: internationalPhone });
            expect(sent.status === 200 && sent.body.message === "Code sent", "OTP request failed");
            const otp = await prisma.oTPCode.findFirst({ where: { phone, used: false }, orderBy: { id: "desc" } });
            expect(otp && otp.code === null && /^[a-f0-9]{64}$/.test(otp.codeHash), "Digest OTP was not stored for the normalized phone");
            const verified = await post("/auth/verify-code", { phone: internationalPhone, code: otpFixtures.codeFor(phone) });
            expect(verified.status === 200 && verified.body.nextStep === "REGISTER" &&
                verified.body.authenticated === false, "Verification did not issue a registration proof");
            expect(verified.headers["cache-control"] === "no-store", "Verification response must not be cached");
            const token = verified.body.verificationToken;
            expect(typeof token === "string" && /^[a-f0-9]{64}$/.test(token), "Unexpected proof-token format");
            const stored = await prisma.phoneVerification.findUnique({ where: { tokenHash: hash(token) } });
            expect(stored && stored.phone === phone && stored.purpose === "REGISTER" &&
                stored.tokenHash !== token && stored.usedAt === null, "Proof storage is incorrect");
            const registered = await post("/auth/register", details(token));
            expect(registered.status === 201 && registered.body.user?.role === "MEMBER" &&
                registered.body.user.phone === phone && registered.body.authenticated === true &&
                typeof registered.body.accessToken === "string" && registered.body.refreshToken === undefined &&
                Array.isArray(registered.headers["set-cookie"]), "HTTP registration result is incorrect");
            expect(registered.headers["cache-control"] === "no-store", "Registration response must not be cached");
            const member = await prisma.user.findUnique({ where: { phone } });
            expect(member && member.firstName === "Integration" && member.lastName === "Member" &&
                member.role === "MEMBER", "Member was not persisted correctly");
        });

        await check("A consumed verification token cannot register again", async () => {
            const phone = await newPhone();
            const { proof } = await issueProof(phone);
            await service.register(details(proof.verificationToken));
            const replay = await post("/auth/register", details(proof.verificationToken));
            expect(replay.status === 400 && replay.body.message === "Invalid or expired verification",
                "Replayed proof was not rejected");
            expect(await prisma.user.count({ where: { phone } }) === 1, "Replay changed the member count");
        });

        await check("Expired proof is rejected without creating a member", async () => {
            const phone = await newPhone();
            const { proof } = await issueProof(phone);
            const tokenHash = hash(proof.verificationToken);
            await prisma.phoneVerification.update({ where: { tokenHash }, data: { expiresAt: new Date(0) } });
            const response = await post("/auth/register", details(proof.verificationToken));
            expect(response.status === 400, "Expired proof was accepted");
            expect(await prisma.user.count({ where: { phone } }) === 0, "Expired proof created a member");
            expect((await prisma.phoneVerification.findUnique({ where: { tokenHash } })).usedAt === null,
                "Rejected expired proof was consumed");
        });

        await check("An existing member receives LOGIN proof, not registration permission", async () => {
            const phone = await newPhone();
            await prisma.user.create({ data: { phone, firstName: "Existing", lastName: "Member", role: "MEMBER" } });
            const otp = await seedOtp(phone);
            const response = await post("/auth/verify-code", { phone, code: otp.code });
            expect(response.status === 200 && response.body.nextStep === "LOGIN" &&
                response.body.authenticated === false, "Existing-member handoff is incorrect");
            const attempt = await post("/auth/register", details(response.body.verificationToken));
            expect(attempt.status === 400, "LOGIN proof authorized registration");
            expect((await prisma.user.findUnique({ where: { phone } })).firstName === "Existing",
                "Existing member was modified");
        });

        await check("Client-supplied phone and ADMIN role are rejected without consuming proof", async () => {
            const phone = await newPhone();
            const { proof } = await issueProof(phone);
            for (const extra of [{ phone }, { role: "ADMIN" }]) {
                const response = await post("/auth/register", { ...details(proof.verificationToken), ...extra });
                expect(response.status === 400, "Unexpected registration fields were accepted");
            }
            expect(await prisma.user.count({ where: { phone } }) === 0, "Invalid request created a member");
            const member = await service.register(details(proof.verificationToken));
            expect(member.role === "MEMBER", "Proof was consumed early or the role was elevated");
        });

        await check("Overlapping OTP verifications mint exactly one proof", async () => {
            const phone = await newPhone();
            const otp = await seedOtp(phone);
            const result = await overlap("oTPCode", "findFirst", (s) => s.verifyPhone(phone, otp.code), phone);
            expect(result.error.message === "Invalid OTP", "Unexpected losing-verification error");
            expect(await prisma.phoneVerification.count({ where: { phone } }) === 1, "Duplicate proofs were stored");
            expect((await prisma.oTPCode.findUnique({ where: { id: otp.id } })).used === true, "OTP was not consumed");
        });

        await check("Overlapping registrations with one proof create exactly one member", async () => {
            const phone = await newPhone();
            const { proof } = await issueProof(phone);
            const result = await overlap("phoneVerification", "findUnique", (s) => s.register(details(proof.verificationToken)));
            expect(result.error.statusCode === 400, "Unexpected losing-registration error");
            expect(await prisma.user.count({ where: { phone } }) === 1, "Duplicate members were created");
            expect((await prisma.phoneVerification.findUnique({ where: { tokenHash: hash(proof.verificationToken) } })).usedAt !== null,
                "Winning registration did not consume its proof");
        });

        await check("Two different proofs for one phone respect the unique member constraint", async () => {
            const phone = await newPhone();
            const first = await issueProof(phone);
            const second = await issueProof(phone);
            const tokens = [first.proof.verificationToken, second.proof.verificationToken];
            const result = await overlap("user", "findUnique", (s, index) => s.register(details(tokens[index])));
            expect(result.error.statusCode === 409, "Duplicate-phone error was not mapped to conflict");
            expect(await prisma.user.count({ where: { phone } }) === 1, "Unique phone constraint did not hold");
            expect(await prisma.phoneVerification.count({ where: { phone, usedAt: { not: null } } }) === 1,
                "Losing transaction did not roll back its proof claim");
        });

        await check("Aborted verification rolls back both OTP consumption and proof insertion", async () => {
            const phone = await newPhone();
            const otp = await seedOtp(phone);
            const injected = failBeforeCommit();
            let caught;
            try { await injected.failingService.verifyPhone(phone, otp.code); } catch (error) { caught = error; }
            expect(caught === injected.marker && injected.reached(), "Failure did not occur after actual verification writes");
            expect((await prisma.oTPCode.findUnique({ where: { id: otp.id } })).used === false, "OTP consumption was not rolled back");
            expect(await prisma.phoneVerification.count({ where: { phone } }) === 0, "Proof insertion was not rolled back");
            await service.verifyPhone(phone, otp.code); // A rolled-back OTP remains usable.
        });

        await check("Aborted registration rolls back member creation and leaves proof usable", async () => {
            const phone = await newPhone();
            const { proof } = await issueProof(phone);
            const injected = failBeforeCommit();
            let caught;
            try { await injected.failingService.register(details(proof.verificationToken)); } catch (error) { caught = error; }
            expect(caught === injected.marker && injected.reached(), "Failure did not occur after actual registration writes");
            expect(await prisma.user.count({ where: { phone } }) === 0, "Member insertion was not rolled back");
            expect((await prisma.phoneVerification.findUnique({ where: { tokenHash: hash(proof.verificationToken) } })).usedAt === null,
                "Proof consumption was not rolled back");
            await service.register(details(proof.verificationToken));
        });

        completed = true;
    } finally {
        otpFixtures?.restoreSender();
        console.log = originalConsoleLog;
        console.error = originalConsoleError;
        try {
            if (identityVerified && phones.size > 0) {
                const where = { phone: { in: [...phones] } };
                const otpKeys = otpFixtures?.keysFor(phones) || [];
                // Delete only rows for this run's newly allocated fixture phones.
                await prisma.$transaction([
                    prisma.otpRateBucket.deleteMany({ where: { key: { in: otpKeys } } }),
                    prisma.phoneVerification.deleteMany({ where }),
                    prisma.oTPCode.deleteMany({ where }),
                    prisma.user.deleteMany({ where }),
                ]);
                const remaining = await Promise.all([
                    prisma.phoneVerification.count({ where }), prisma.oTPCode.count({ where }),
                    prisma.user.count({ where }),
                    prisma.otpRateBucket.count({ where: { key: { in: otpKeys } } }),
                ]);
                expect(remaining.every((count) => count === 0), "Some fixture records remain after cleanup");
                console.log("Cleanup verified: this run's temporary records were removed.");
            }
        } finally { await prisma.$disconnect(); }
        if (completed) console.log(`Registration DB checks: ${passed} passed, ${failed} failed.`);
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(`STOP: ${safeError(error)}`);
        process.exitCode = 1;
    });
}

module.exports = { parseTarget, verifyIdentity };
