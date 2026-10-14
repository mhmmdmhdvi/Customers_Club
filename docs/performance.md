# Owned PostgreSQL HTTP measurements

Stage 6 measures actual loopback HTTP with live authorization and exact counts.
The committed baseline harness is `644ac15e271d85eec29b18bc1dbc89966badede2`
(initial harness `693a2b7`; a route-name correction and Node pool prewarm precede
the retained baseline). No production query or index was changed before this
baseline. Complete baseline evidence is in `performance-baseline.json`.

On Windows, start the independent cluster once with
`./scripts/test-postgres.ps1 -Action Start`, then run from the repository root:

```powershell
./scripts/benchmark.ps1 -Output docs/performance-baseline.json -AllowPerformance
```

Use the relevant committed version and a distinct output filename to reproduce
each measurement. The script loads only the independently marked native cluster;
testdb creates/migrates/seeds a unique marked child and drops it on completion.
The parent remains schema-free. Both the database opt-in and a separate expensive
performance opt-in are required. Ordinary tests/CI skip this workload. No `.env`,
existing database, real SMS, production secrets, deployment or external accounts
are used. The Node helper replaces the dotenv configuration and production DB
module before loading the actual Node app; real middleware/routes, JWT verification,
session reads, Prisma services and the pg adapter still execute.

Each implementation runs sequentially on the same seeded child, using 50 serial
warmup requests and 500 measured requests per endpoint, eight concurrent workers,
reused HTTP connections, and six prewarmed database connections. Go uses max/min
6/6; Node pg uses max 6, no idle eviction and explicit six-connection prewarm.
This matches testdb's maximum 6 explicitly. Production Go retains pgxpool defaults
(`max(4, NumCPU)` = 8 on this machine, minimum 0) unless connection-string options
override them; production Node pg's default maximum is 10. Existing production
configuration was not read. These results characterize the selected harness pool,
not either production default. Latencies are nearest-rank p50/p95/p99 from full
HTTP response consumption; throughput is requests divided by batch wall time.
Go acquire/wait counters are deltas for the measured batch only. Node pool wait
instrumentation is unavailable here and is not inferred from Go statistics.

The deterministic workload has 100,000 users (one ADMIN), 20,000 sessions, 20,000
messages, 20,000 audit events and 20,000 security events. Synthetic phones/names,
100 substring matches, thirty-day member distribution, mixed session expiry and
revocation, mixed message status and 20% event filter matches are fixed relative
to one timestamp anchor. Creation timestamps are distinct in the benchmark;
equal-time pagination is separately covered by a real database regression.
The run calls auth/me, users first/deep/search pages, overview and filtered
messages/audit/security. All responses must be HTTP 200. Table analysis precedes
plans and warmup. Complete EXPLAIN (ANALYZE, BUFFERS) output and PostgreSQL settings
are retained in each JSON result. Plans are single observations, not statistically
sampled latencies, and should be interpreted alongside the HTTP batch.

Hardware: Intel Core i3-12100F, four physical/eight logical cores, 16,980,832,256
bytes RAM; Windows 11 Pro 10.0.28000, amd64. Go 1.27.1 (GOMAXPROCS 8), Node
24.20.0, PostgreSQL 18.6. Native owned PostgreSQL loopback port 53760; shared
buffers 128MB, work_mem 4MB, effective_cache_size 4GB, max_connections 100,
random_page_cost 4, JIT on, track_io_timing off, UTC timezone.

The baseline user page uses a parallel sequential scan plus a sort over 100,000
rows. Session primary-key reads and filtered message/event pages already use
appropriate indexes. The measured ordering change adds the Prisma-owned
User(createdAt DESC, id DESC) B-tree and descending id tie ordering for Go user
pages. It keeps exact counts and the existing page/pageSize contract. The index
adds disk/write maintenance; no historical migration is edited.

The retained source versions and commands are:

| Measurement | Commit | Command suffix after `./scripts/benchmark.ps1` |
| --- | --- | --- |
| Original baseline | `644ac15` | `-Output docs/performance-baseline.json -AllowPerformance` |
| Ordering only | `b2a5033` | `-Output docs/performance-ordering.json -AllowPerformance` |
| Trigram trial, index built after seed | `1434c6d` | `-Output docs/performance-trigram-candidate.json -AllowPerformance -TrigramCandidate` |
| First single-pass overview trial | `1128348` | `-Output docs/performance-overview-candidate.json -AllowPerformance -OverviewCandidate` |
| MEMBER-filtered single-pass trial | `7106442` | `-Output docs/performance-overview-filter-candidate.json -AllowPerformance -OverviewCandidate` |
| Optimized, fresh bulk-written GIN | `ca8f83f` | `-Output docs/performance-optimized-bulk-pending.json -AllowPerformance` |
| Optimized, pending-list diagnostic | `403c00f` | `-Output docs/performance-optimized.json -AllowPerformance -FlushGinPending` |
| Controlled fastupdate ON/OFF trial | `c074b9c` | `-Output docs/performance-fastupdate-candidate.json -AllowPerformance -FastupdateCandidate` |
| Final optimized, no cleanup | `3737493` | `-Output docs/performance-final.json -AllowPerformance` |

Check out the listed commit before its command; candidate flags reproduce
experiments on those pre-optimization versions. The first optimized application
source is `ca8f83f`; `403c00f` adds only benchmark instrumentation. Final source
is `3737493`, with the measured GIN storage option described below. All versions retain
the same dataset distribution, 500 samples, 50 warmup, concurrency eight and pool
six. Index setup states are reported explicitly below. The first exploratory
baseline was repeated because compilation overlapped measurement; the retained
baseline is the clean second run. Additional runs changed candidate code or
resolved the observed GIN initialization concern.

Go latency triples below are p50 / p95 / p99 in milliseconds. The final run
uses the production `fastupdate=off` index, seeded through all 100k inserts,
with no benchmark cleanup or autovacuum override.

| Endpoint | Original baseline | Final optimized | Throughput before -> after (requests/s) |
| --- | --- | --- | --- |
| `/auth/me` | 0.57 / 1.74 / 4.98 | 0.52 / 1.30 / 5.76 | 9,253 -> 11,904 |
| `/admin/users` | 94.78 / 176.41 / 211.23 | 6.96 / 10.66 / 11.29 | 79 -> 1,086 |
| `/admin/users?page=500&pageSize=20` | 110.74 / 181.90 / 216.89 | 10.38 / 16.53 / 40.63 | 68 -> 699 |
| `/admin/users?search=Needle` | 115.02 / 133.03 / 137.66 | 1.69 / 2.65 / 3.63 | 69 -> 4,481 |
| `/admin/overview` | 28.05 / 39.74 / 44.15 | 19.76 / 25.80 / 28.75 | 274 -> 399 |
| `/admin/messages?status=NEW` | 3.14 / 4.37 / 5.44 | 3.09 / 4.05 / 4.64 | 2,474 -> 2,579 |
| `/admin/audit?action=CONTACT_MESSAGE_STATUS_CHANGED` | 1.78 / 3.05 / 5.83 | 1.73 / 2.80 / 4.55 | 3,910 -> 4,145 |
| `/admin/security?eventType=ADMIN_LOGIN` | 1.70 / 6.49 / 22.99 | 1.70 / 2.72 / 3.93 | 3,062 -> 4,274 |

Do not attribute small changes on untouched endpoints to optimization. Their
variation includes worse tails in several cases. No repeat-run confidence
intervals, CPU profiles, maximum-load saturation curve or production workload
are established here. These are eight separate fixed-concurrency endpoint
batches, not a mixed production traffic trace.

The B-tree removed the user sort: captured first-page plan execution
37.300 -> 0.019ms, deep page 46.115 -> 2.433ms. Exact unfiltered count remains
linear in rows. After ordering alone, user p50 was 7.31ms and deep-page p50
10.09ms, while search still cost 58.79ms because its exact count scanned 100k
rows (~32.5ms). This justified testing substring indexing rather than treating
the page optimization as sufficient.

One multicolumn GIN over phone/firstName/lastName with `gin_trgm_ops` supports
all three existing OR branches. The trial retained LIKE for phone and ILIKE
for names; it introduced no similarity operator, normalization change, minimum
search length or wildcard escaping. Real database regressions cover nulls,
mixed case, one-character, `%`, `_` and escaped wildcard behavior, and the
existing 29 actual Prisma comparisons remain the reference. PostgreSQL supports
any subset of a multicolumn GIN index; Prisma models the raw operator classes.
See [PostgreSQL multicolumn indexes](https://www.postgresql.org/docs/18/indexes-multicolumn.html)
and [Prisma index operator classes](https://docs.prisma.io/docs/orm/v7/prisma-schema/data-model/indexes).

The owned non-superuser could install available trusted pg_trgm and build the
index over the existing 100k rows in 363.65ms, including extension creation.
It occupied 4,030,464 bytes; the B-tree occupied 5,480,448 bytes in that trial.
The exact search count changed from a sequential scan to a BitmapOr over the
GIN index and 100 matching heap rows: trial execution 0.304ms; final production
index execution 0.116ms. Search HTTP trial p50 changed 58.65 -> 1.62ms and p95
78.03 -> 3.21ms. A single rolled-back 1,000-user INSERT probe changed 9.923 ->
12.375ms and WAL 352,928 -> 996,142 bytes. These two probes quantify an observed
write tradeoff, not registration throughput or a statistically stable write
benchmark. The repeated synthetic names make this index smaller than a dataset
with many distinct real names may be.

GIN initialization matters. The initial GIN migration before seeding meant the
new index received all 100k writes with default `fastupdate` enabled. The first full
optimized run retained that state: search 2.87 / 81.38 / 87.71ms and 268rps,
with its initial exact-count plan still choosing a 34.411ms sequential scan.
The later Node batch reached 12.49 / 17.54 / 21.16ms. To isolate this concern,
one controlled full rerun called `gin_clean_pending_list` on the owned index
after seeding, explicitly flushing 445 pages before EXPLAIN and warmup. It did
not VACUUM the seed population or change production settings. That run is the
clean setup retained in `performance-optimized.json`. The after-seed-built trial independently
demonstrates the same low search cost without a bulk-filled pending list.

One focused ON/OFF trial then seeded two marked children independently. Both
disabled User autovacuum only in this controlled trial so background cleanup
could not mask write-burst behavior. Both received the same 100k user writes;
OFF was set before seeding, and neither arm cleaned its pending list. Search
with ON was 59.12 / 86.86 / 99.40ms at 129rps; OFF was 1.59 / 2.70 / 7.79ms
at 4,599rps. OFF's cost was substantial: total seed wall time 5.005 -> 15.415s,
and one rolled-back 1,000-user INSERT changed 34.681 -> 166.781ms with WAL
2,329,389 -> 15,048,970 bytes. Index bytes were 7,946,240 (including pending
pages) with ON and 4,407,296 with OFF. The probe is one observation in each arm,
not a stable write throughput estimate. This tradeoff is retained explicitly.

The final additive migration sets `fastupdate=off` for this search index to
prioritize read-tail stability under the demonstrated burst. It increases User
insert/update work and WAL; a write-dominated deployment must reassess this
choice against its workload. Prisma models the logical GIN index/operator
classes; PostgreSQL physical reloptions are documented in schema comments and
owned by the additive Prisma SQL migration. Historical migrations are untouched.
The real write-burst regression observed 71 pending pages with ON and zero with
OFF. The final full run uses OFF without benchmark maintenance or background
maintenance suppression; all seed inserts go through the selected production
index. No automatic maintenance task, unconditional VACUUM or pool change was
introduced. Changing fastupdate does not flush an existing pending list: a
deployment that applied the initial index separately still needs its normal
index maintenance. This work has not established tail guarantees under arbitrary
concurrent production writes. The uncleaned ON result remains part of the
evidence. Short/broad patterns with no
extractable selective trigrams can still scan much of the table or index.
See [PostgreSQL pg_trgm](https://www.postgresql.org/docs/18/pgtrgm.html) for index
eligibility and trusted extension prerequisites. Deployment must provide the
extension and CREATE privilege to the migration role; existing deployments
with pg_trgm in a different schema require a reviewed schema-specific migration.
No migration was applied to an existing user database in this work.

Overview was also measured after indexing. The exact single-pass MEMBER-filtered
candidate changed 23.08 / 30.04 / 47.84ms to 18.46 / 24.59 / 26.60ms and 338 ->
425rps on the same HTTP workload. Retained SQL counts MEMBER users once (including
their inclusive seven-day subset), ContactMessage once (including NEW subset),
and unrevoked sessions with strict expiry once. The final plan executes in
14.304ms. It adds no write/schema cost and preserves exact keys/count predicates.
The real emitted-query regression checks one logical User and ContactMessage
pass while independently asserting mixed role/time/status/revocation counts.
The first aggregate variant checked role twice per row, and its p99 worsened;
its result remains in the first overview candidate artifact.

Pool profiling supported fixing query work rather than raising connection
limits. Summed empty-pool wait per HTTP request changed from 23.45 -> 1.41ms
for first user pages, 27.59 -> 2.42ms for deep pages, 28.37 -> 0.12ms for search,
and 7.14 -> 4.79ms for overview. These are summed acquire
wait deltas divided by 500, not independent per-request latency percentiles.
PK authentication lookups were about 0.01ms apiece, and auth/me p50 was already
0.57ms, so a session/user join was not justified. Existing message/event filter
indexes were appropriate; no further speculative indexes were added.

The actual Node reference supplies context, not a language claim. With the final
shared indexes, Node p50/p95 was 12.49/16.65ms for users, 15.87/21.36ms for the
deep page, 9.25/13.38ms for search, and 54.15/86.56ms for overview. Baseline Node
p50 was 112.90/135.25/116.44/47.65ms respectively. Node's Prisma generated SQL,
parallel overview counts, middleware, JWT library and JSON costs differ from Go;
both benefit from the same new schema indexes. Mocked/synthetic credentials
eliminate live SMS and unrelated external latency.

The original baseline/ordering EXPLAIN overview SQL represented time as `now()`;
subsequent candidate/final plan captures use a fixed millisecond UTC timestamp
literal to match the service's bound arguments and avoid charging per-row
function evaluation. This correction affects plan observations, not HTTP
workloads. The member-filtered candidate comparison uses the corrected form
in both plans. Complete JSON artifacts preserve all earlier observations.

Fresh final validation: full Go owned-database and offline suites, `go vet ./...`,
`go build ./...`, and Node offline 872/872 pass. Owned checks include live-role
and revocation behavior, session/status concurrency, all 296 shared HTTP cases,
29 populated real Prisma reads, and all seven actual Prisma migration histories.
Closing guarded catalog audit: parent public tables 0; owned child databases 0.
Local race execution is unavailable with CGO disabled/no C compiler; Docker
daemon execution is unavailable. Frontend/UI work is outside this backend stage.

This is one local Windows machine and a warm synthetic dataset, not production
capacity, maximum throughput or proof that a language is faster. Page-based
deep offsets and exact broad search/counts remain work proportional to data.
No JWT stateless authorization, weakened revocation, approximate count, cursor
API or speculative cache was introduced. Schema indexes add disk, WAL and write
maintenance. Performance tests remain separate from normal tests/CI.
