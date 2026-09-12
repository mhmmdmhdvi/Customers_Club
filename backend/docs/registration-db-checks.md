# Opt-in PostgreSQL registration checks

Prerequisites for a future integration run: the registration/session code, its
four migrations already present in customer_club_test_db, the matching generated
Prisma Client and installed dependencies. The checker itself never applies migrations.
These prerequisites and the local checks were completed at the recorded checkpoint;
this is not an instruction to reinstall dependencies or repeat migrations.
The test-only execution policy must not be confused with historical migration state:
BOTH local databases had all four migrations applied as last observed below.

## Local migration incident and last observed state

Recorded checkpoint: 2026-09-12. This is user-reported history from the project
handoff, not a fresh inspection by the documentation/test follow-up.

An earlier launcher assigned DOTENV_CONFIG_OVERRIDE the string "false". The
incident investigation reported that the installed dotenv/config treated that
nonempty value as enabling override. Prisma's environment loading then replaced
the temporary test DATABASE_URL with the ordinary backend/.env development URL.
A successful identity check in a different process did not establish Prisma's
actual eventual target.

Consequently, the PhoneVerification and AuthSession/RefreshToken migrations were
accidentally applied to customer_club_db, the normal LOCAL development database.
They were not rolled back or undone. A subsequent read-only psql inspection found:

- customer_club_db: all four migrations completed, none rolled back; verification
  and session tables present; 0 User rows and 3 OTPCode rows.
- customer_club_test_db at that inspection: only the first three migrations
  completed; session tables absent; 0 User rows and 0 OTPCode rows.

There was no pre-incident data snapshot. These counts do NOT prove that all
historical data was unchanged. The inspected migration SQL was additive, not a
row-deletion/reset migration.

The missing session migration was subsequently applied deliberately to
customer_club_test_db using backend/prisma.test.config.cjs. Both integration
checkers then passed and verified their scoped cleanup. At that last checkpoint,
BOTH databases had these four migrations applied, in order:

1. 20260906113919_init
2. 20260906115513_add_otp_model
3. 20260909120000_add_phone_verification
4. 20260912120000_add_auth_sessions

No production-server migration was performed in this conversation. Leave the
normal database alone; do not reset, drop/truncate tables, edit _prisma_migrations
or blindly try to reverse the accidental additive migrations. Older instructions
that describe these migrations as pending locally are superseded by this record.

## Deliberate scope

The checker exercises the actual Express app through Supertest and the actual
registration/OTP service factories through Prisma and PostgreSQL. It adds ten
named checks:

1. HTTP request-code -> verify-code -> register, normalized phone, hashed proof,
   no-store headers, persisted MEMBER, authenticated access and an HttpOnly refresh cookie.
2. Consumed proof replay rejection.
3. Expired proof rejection without account creation or proof consumption.
4. Existing-member LOGIN proof and wrong-purpose registration rejection.
5. Client-supplied phone/ADMIN rejection without consuming proof.
6. Two overlapping OTP verifications mint just one proof.
7. Two registrations claiming the same proof create just one member.
8. Two different proofs for the same phone exercise the unique phone constraint;
   the losing transaction rolls back its proof claim and returns a conflict.
9. A controlled pre-commit failure rolls back OTP consumption AND proof insertion.
10. A controlled pre-commit failure rolls back account creation AND proof consumption.

Concurrent checks use separate real interactive transactions. A read barrier holds
both after their selected SELECT completes, then releases both to compete on writes.
The barrier has a timeout. Rollback checks throw a deliberate error after the
service's actual SQL writes but before the transaction commits. The failure is
injected by a test wrapper, not by altering the production service or database schema.

These tests are not full security certification, load testing, a substitute for
rate limiting or resend hardening, or a check of production deployment. Application
versus database clock skew and expiry during long lock waits are not modeled.

## Safety and operation

The script is backend/scripts/registration-db-check.js. Its name and location keep
it out of the project's normal `node --test` discovery; invoke it explicitly.

It requires TEST_DATABASE_URL and ALLOW_TEST_DATABASE_WRITES=customer_club_test_db.
It accepts only the exact loopback host 127.0.0.1, port 5432, database
customer_club_test_db, user customer_club_test_user, and the public schema. Other
URL options, database names, hosts, admin credentials, or missing passwords are
rejected before importing the app. It also checks the actual database, current
user, session user, schema and role privileges before seeding data.

Run this checker by itself against the dedicated test DB. Do not simultaneously
point manual test servers or other fixture scripts at that DB. Temporary phones
are randomly generated and checked against all three tables before use. No SMS is
sent by this currently implemented development request-code flow. NODE_ENV=test
prevents the current service from printing OTPs. Raw proof tokens and connection
URLs are not printed. Application error details are suppressed in this process.

The checker creates and deletes data ONLY in the dedicated test database. Cleanup
uses WHERE phone IN (this run's newly allocated phones), never an unfiltered delete,
TRUNCATE, DROP, migration, or reset. Cleanup is attempted on failures as well as
success and checked afterward. Killing the process or losing the DB connection
can still leave fixture data; do not then reset or wipe the database blindly.
PostgreSQL sequence values advance even when the fixture rows are removed.

Only the checker child process sets DATABASE_URL and NODE_ENV for application
imports. Do not copy a real password into documentation, code, shell history or
.env. Reusing an older launcher without checking its environment handling is unsafe.

### Corrected procedure for future test work

The explicit backend/prisma.test.config.cjs reads TEST_DATABASE_URL and
ALLOW_TEST_DATABASE_WRITES through parseTarget. It does not import dotenv or read
ordinary DATABASE_URL. Both checker scripts delete DOTENV_CONFIG_OVERRIDE before
loading application configuration and check that their guarded DATABASE_URL and
NODE_ENV remain unchanged before importing the database module.

Any future launcher must temporarily remove inherited DOTENV_CONFIG_OVERRIDE and
NODE_OPTIONS before starting child processes, obtain the test password through a
hidden prompt, and set TEST_DATABASE_URL plus the exact write-permission value
without displaying credentials. It must restore the previous values/presence of
ALL environment variables it changes in a finally block. Never assign the string
"false" to DOTENV_CONFIG_OVERRIDE. These are launcher requirements, not a claim
that a migration launcher is included in this follow-up.

For FUTURE test work only, from the repository root AFTER secure temporary
environment setup, the explicit command forms are:

```powershell
backend\node_modules\.bin\prisma.cmd migrate status --config backend\prisma.test.config.cjs
# Only for separately reviewed, genuinely pending test migrations:
backend\node_modules\.bin\prisma.cmd migrate deploy --config backend\prisma.test.config.cjs
```

Do not run these commands for this follow-up: both local databases were already
migrated at the last checkpoint. Never use an unqualified Prisma migration command
for test work or treat a separate process's identity check as proof of its target.
The real checkers additionally validate the connected database/login/schema and
role flags before writing fixtures; offline tests cannot establish that identity.

The user reported these final lines after the corrected local registration run:

    Cleanup verified: this run's temporary records were removed.
    Registration DB checks: 10 passed, 0 failed.

On any FAIL or STOP, share the named check and sanitized diagnostic. Do not share
credentials, tokens or full connection strings. Do not continue to production
migration or deployment on a failure.

## Verification record

The original preparation notes reported a Linux/Node.js 22.16.0 syntax check and
26 ad hoc safety-guard tests. Those notes predated the migration incident and the
subsequent completed local integration runs; they were not a committed regression
suite in the session branch. The earlier 86-test registration baseline is historical.

The later handoff reports Windows/Node.js 24 local verification:

- npm suite BEFORE the offline tests added here: 244 passed, 0 failed, 0 skipped.
- Session DB checker: 12 passed, 0 failed.
- Registration DB checker: 10 passed, 0 failed.

Both real-PostgreSQL checkers used customer_club_test_db / customer_club_test_user
and reported that this run's temporary records were removed. Prisma 7.10.0 schema
validation and client generation also succeeded locally as reported. The 22 manual
DB checks are separate from the npm suite. None of these historical results is a
new database inspection, proof of unchanged historical data or production approval.

## Offline migration-target regressions

backend/tests/migration-target-isolation.test.js adds 59 Node built-in tests.
To run just this new file from the repository root:

```powershell
node --test backend/tests/migration-target-isolation.test.js
```

The test evaluates the actual reviewed guard/config/checker source with synthetic
URLs and private environment objects. Its dependency allowlist blocks unexpected
imports. It uses the real parseTarget and verifyIdentity functions, a capture-only
stub for Prisma defineConfig, and controlled environment/database import boundaries.
Both checkers stop before loading any database module or running integration work.
The tests neither read .env nor inherit real connection settings, change the real
process environment, invoke migrations or connect to PostgreSQL.

Coverage includes unauthorized targets and write permissions; mismatched identity
fields and privilege flags; no DATABASE_URL fallback or dotenv import in the test
config; backend-relative schema/migration paths; deletion of inherited override
values before environment loading; and rejection of post-load target/NODE_ENV drift.
Node VM contexts here isolate tests of trusted repository code; they are not a
security sandbox for hostile code.

These tests do NOT execute the installed Prisma CLI or dotenv implementation,
verify actual server privileges/migration state, or test PostgreSQL concurrency.
They protect the source-level corrections without repeating the completed manual
DB checks. The 59 added tests passed in the separate Linux/Node.js 22.16.0 preparation
workspace; Windows execution and a new full-suite total are not claimed by that run.
