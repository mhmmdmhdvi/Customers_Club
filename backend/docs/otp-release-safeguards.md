# OTP release safeguards

Implementation base: a26edfdeac0bb9f7a0e4f83c61fdf0350b0390ba.
Branch: feat/otp-release-safeguards. This change is not production-release approval.
The earlier four migrations and session behavior are preserved. The NEW fifth
migration is supplied for review, not executed by the application bundle.

## Current local verification record (after the UTC clock fix)

The user reported successful completion of the Windows clock-fix/resume runner
on feat/otp-release-safeguards. This is local user-reported evidence, not GitHub
CI or a PostgreSQL run performed by the documentation updater.

- The runner's completion gates require the full automatic suite to pass with no
  failures, cancellations, skips or todos (at least 386 tests including the 11
  clock regressions). The earlier 375-test result predates the clock fix; an exact
  post-fix count is not asserted here from the abbreviated terminal output.
- Separate real-PostgreSQL checks: 8 OTP + 10 registration + 12 session = 30 passed.
  Delivery was fake; this is not evidence of SMS-provider integration.
- The test database has five completed migrations. Migration five was applied by
  the earlier guarded checkpoint; the successful resume applied no migration.
- The normal development database was not accessed by these checkpoints and was
  last observed with four migrations. Do not run this branch against it until a
  separately reviewed backup/migration/configuration checkpoint.
- Pre-existing table values matched the private baseline after each checker, with
  fixture cleanup verified. Sequence counters may advance and were not compared.
  The private backup was retained; restore has not been rehearsed.

The failing initial OTP checker exposed a +12,600-second timestamp conversion
error in the installed adapter under the database's non-UTC connection timezone.
The OTP helper now selects clock_timestamp() AT TIME ZONE 'UTC'. The successful
resume verified the actual helper through Prisma against the database epoch under
the default, Asia/Tehran and America/New_York connection timezones. No server
clock/timezone changes, timestamp rewrites or migration retries were needed.

These results supersede pending-test statements in the original bundle instructions
below. They are not public-release approval. Real SMS, runtime configuration,
bounded retention and deployment/restore/frontend work remain outstanding.

## Policy

| Control | Limit |
| --- | --- |
| Challenge lifetime | 120 seconds from reservation, not delivery acknowledgment |
| Phone resend cooldown | 60 seconds |
| Phone requests | 5 in a rolling 15 minutes; 20 in a rolling 24 hours |
| IP requests | 30 in a rolling 15 minutes |
| Incorrect guesses | 5 per challenge |
| Incorrect guesses per phone | 10 in a rolling 15 minutes, retained across resends |
| IP verification submissions | 100 in a rolling 15 minutes |

These are application defaults, not claims about mandated standard thresholds.
The fifth wrong guess returns 429 and blocks that challenge; the tenth phone
failure blocks that phone's verification until the relevant rolling event expires.
429 responses carry an integer Retry-After in seconds and Cache-Control: no-store.
Rejections do not extend the budget window. Resends do not reset wrong-guess history.
Successful sessions are not revoked, and accounts are not permanently locked.
Rejected missing/expired-code attempts also count toward the phone failure budget.

Existing syntactic input validation still returns 400 before service/DB work.
These budgets meter well-formed OTP operations, not all malformed HTTP traffic.
Global connection/body/request limits at the reverse proxy are still release work.
IP attempts commit separately, including when a phone quota or later delivery fails.
Request reservations consume the phone send budget even on failed delivery.

## Persistence and concurrency

OTPCode receives nullable codeHash/nonce/deliveryState and failedAttempts (default 0).
The existing code field becomes nullable; no historical row is deleted or rewritten
by the migration. New rows set code=null. Only ACTIVE, unconsumed digest-format rows
can verify. Legacy plaintext rows remain historical data and NEVER authenticate.
Existing users, proofs, sessions, refresh hashes, and old migrations are unchanged.

Codes use crypto.randomInt; each challenge has a random 32-byte nonce. The stored
value is HMAC-SHA-256 over a versioned, unambiguous encoding of phone, nonce and code.
Digest comparison uses timingSafeEqual after format/length validation. The separate
OTP_HMAC_SECRET must be 32 random bytes encoded as 64 hexadecimal characters. It must
not reuse ACCESS_TOKEN_SECRET. NODE_ENV must explicitly be development/test/production.
Missing configuration fails closed; no key is supplied or written by this bundle.

OtpRateBucket holds bounded arrays of admission timestamps: at most 20 for phone
requests, 10 for phone failures, 30 for IP sends, and 100 for IP verification. Keys
are domain-separated HMAC values, not raw IP addresses. A row is reused per bucket;
old timestamps are discarded when it next admits an event. expiresAt is indexed.
Rotating OTP_HMAC_SECRET invalidates pending codes AND changes rate-bucket keys;
coordinate all workers and account for restarted budgets during controlled rotation.

Every OTP issuance/activation/verification uses the same transaction-scoped phone
advisory lock. IP charging uses its own, separately committed lock/transaction.
The database clock is read after lock acquisition. Transactions use ReadCommitted
and bounded lock/transaction waits; there is no in-process production mutex or
unmetered fallback on database errors. This does not promise validity after arbitrary
external/manual locks or clock changes outside the protocol.

Wrong-code outcomes return an error value from the transaction, allowing counters
to commit; the error is thrown only after commit. Correct-code consumption invokes
registration proof creation inside that same transaction. A proof insert failure
rolls back consumption. Existing registration/session issuance is not rewritten.

## Delivery boundary — NOT implemented SMS

The sender is injected. backend/src/services/otp-delivery.js intentionally refuses
to supply a runtime sender until real SMS is integrated. Therefore a normal
request-code call returns 503 until key configuration AND a real provider are ready.
There is no development console-code or fake-success fallback. Manual test scripts
explicitly inject an in-memory fake sender; their results are not delivery evidence.

Issuance reserves a PENDING challenge and commits quotas, releases database locks,
then calls the sender with {phone, code, expiresAt, signal}. Delivery has an 8-second
local timeout. A provider must honor cancellation where possible; no automatic
resend occurs after ambiguous acknowledgment. After acknowledgment, a transaction
activates the still-unexpired pending challenge and invalidates prior unused ones.
Failure keeps the prior active code valid. An expired/failed pending code cannot
activate. An acknowledged SMS can still be unusable if the later DB commit fails;
SMS and PostgreSQL do not share an atomic transaction. No guarantee of exactly-once
SMS is made. Do not log credentials, provider response bodies or raw DB exceptions.

## HTTP/IP boundary

Controllers pass Express req.ip, never a body field or raw X-Forwarded-For header.
The app's existing default trust-proxy=false remains unchanged. Equivalent IPv4 and
IPv4-mapped IPv6 addresses share budgets; native IPv6 addresses are canonicalized.
This is per-address, not IPv6-subnet enforcement. Before reverse-proxy deployment,
configure exact trusted proxy addresses and verify forwarding headers are overwritten.
Do not enable blanket trust proxy=true. NAT sharing and address rotation remain tuning
considerations. Keep existing session CSRF/CORS/cookie contracts unchanged.

## Original bundle verification instructions (historical)

Apply code and run the automatic suite without connecting to a database:

    node --require ./tests/helpers/offline-test-env.js --test

Run from backend/. The supplied applicator runs that command with --test. The explicit
test preload disables dotenv file loading, clears auth keys in the test process,
uses a deliberately unusable database URL and rejects pg Pool/Client connections.
HTTP tests can still use local Supertest sockets. It does NOT change the app's runtime
configuration, .env, dependencies, generated client, or either real database.

The bundle's report records which tests were actually run in preparation. Unit
transaction stores serialize callbacks; they are NOT PostgreSQL concurrency proof.
After separate SQL/target review, the dedicated test database needs this new migration:
20260912150000_add_otp_release_safeguards. Both local databases previously had four
migrations as last observed; that history is not changed by this unexecuted file.
Migration/client generation must use the explicit prisma.test.config.cjs, guarded
TEST_DATABASE_URL and ALLOW_TEST_DATABASE_WRITES setup. No unqualified migrate, reset,
db push, old-migration editing, or production/development DB writes are authorized here.

After that separately authorized rehearsal, run the manual registration/session
checkers and the new scripts/otp-db-check.js. They generate an ephemeral OTP key and
use digest-format fixtures and fake delivery. Their PostgreSQL results are still
pending for THIS revision. Existing earlier 244/59/12/10 results do not certify it.
OTP overlap barriers rendezvous BEFORE acquiring the phone lock, not after a read
performed while another transaction holds that lock. Cleanup is limited to this
run's allocated phones and HMAC budget keys; inspect failures rather than resetting.

Expired buckets for inactive subjects and expired OTP rows still need a separately
reviewed bounded retention job before public release. Nothing in this bundle wipes
history or runs global cleanup. Retain used refresh hashes while sessions need replay
detection; this OTP change does not touch them. Also outstanding: real SMS, runtime
configuration, proxy/load testing, deployment/backup/restore rehearsal and frontend
integration. Do not use a green unit count as public-release approval.

## References
- https://www.postgresql.org/docs/18/explicit-locking.html#ADVISORY-LOCKS
- https://nodejs.org/api/crypto.html#cryptocreatehmacalgorithm-key-options
- https://nodejs.org/api/crypto.html#cryptotimingsafeequala-b
- https://expressjs.com/en/guide/behind-proxies/
