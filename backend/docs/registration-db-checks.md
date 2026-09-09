# Opt-in PostgreSQL registration checks

Prerequisites: the verified-phone registration patch, its three migrations applied
ONLY to customer_club_test_db, and Prisma Client generated from that schema.
Use the installed project packages; no new dependencies or migration are added.

## Deliberate scope

The checker exercises the actual Express app through Supertest and the actual
registration/OTP service factories through Prisma and PostgreSQL. It adds ten
named checks:

1. HTTP request-code -> verify-code -> register, normalized phone, hashed proof,
   no-store headers, persisted MEMBER, and authenticated:false.
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

Only the child Node process sets DATABASE_URL and NODE_ENV for application imports.
Do not copy a real password into this document, code, shell history, or .env. The
PowerShell launcher provided in chat asks through a hidden password prompt and
restores its two temporary environment variables afterward.

Expected final lines on the user's verified local environment:

    Cleanup verified: this run's temporary records were removed.
    Registration DB checks: 10 passed, 0 failed.

On any FAIL or STOP, share the named check and sanitized diagnostic. Do not share
credentials, tokens or full connection strings. Do not continue to production
migration or deployment on a failure.

## What was executed during preparation

Syntax check: Node.js 22.16.0 on Linux.
26 local safety-guard tests passed, covering target URL validation, actual identity
validation, and rejection before dependency loading or secret disclosure.
Patch application was checked on a separate local tree.

The ten PostgreSQL/HTTP integration checks have NOT been executed in the preparation
environment: it has no PostgreSQL server or installed project runtime dependencies.
They must run on the user's Windows/Node.js 24/PostgreSQL 18 test database. The
previous 86-test result and the migration success are user-reported evidence, not
new tests executed here. No remote repository, user's DB, or .env was changed by
preparing this patch.
