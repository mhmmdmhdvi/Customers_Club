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
(`max(4, NumCPU)` = 8 on this machine, minimum 0), and production Node pg has
its default maximum 10. These results characterize the selected harness pool,
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

Further results and the final optimization decision are recorded after identical
workload remeasurement. This is one local Windows machine and a warm synthetic
dataset, not production capacity, maximum throughput or proof that a language is
faster. Node's Prisma queries, parallel overview requests, middleware and JSON
costs differ from Go, and both implementations benefit from a shared new index.
