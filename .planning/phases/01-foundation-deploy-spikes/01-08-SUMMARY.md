---
phase: 01-foundation-deploy-spikes
plan: 08
subsystem: infra
tags: [pg-boss, worker, heartbeat, health-check, render]
requires: [01-05]
provides:
  - src/server/heartbeat.ts (HEARTBEAT_STALE_SECONDS, secondsSince, workerStatusFrom, recordHeartbeat, getWorkerStatus)
  - worker/index.ts pg-boss worker with per-minute heartbeat, startup heartbeat, graceful SIGTERM
  - GET /api/health returning db, worker age and deployed commit
affects: [01-09, 01-10]
tech-stack:
  added: []
  patterns: [staleness rule as a pure function so it is unit-tested without a database, worker imports the db client dynamically so config errors reach main().catch]
key-files:
  created:
    - src/server/heartbeat.ts
    - src/server/heartbeat.test.ts
    - worker/index.ts
    - src/app/api/health/route.ts
  modified: []
key-decisions:
  - "Worker status is ok only when the newest heartbeat is under 150 s old (two missed one-minute beats plus slack); never-seen is not ok"
  - "Error logging in the worker uses err.message, falling back to err.code or name, because Node's connection errors can have an empty message"
  - "Health endpoint returns lastSeenSeconds and ok only; lastSeenAt stays internal"
requirements-completed: [FND-01]
duration: ~15min
completed: 2026-10-27
status: complete
---

# Phase 1 Plan 08: Heartbeat worker and /api/health Summary

A pg-boss worker writes a `worker_heartbeats` row at startup and every minute, and `GET /api/health` reports database status, worker age and the deployed commit using a unit-tested 150 second staleness rule.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 (RED) | Failing heartbeat staleness tests | 874b3e8 |
| 1 (GREEN) | Heartbeat module | 10602ff |
| 2 | pg-boss worker and /api/health | 12ebaa1 |

## Verification

- `npx vitest run --project unit src/server/heartbeat.test.ts`: 8 tests pass (null, 10, 149, 150, 600 seconds plus floor and constant). `npm run test`: 7 files, 63 tests pass.
- `npm run typecheck`, `npm run lint` and `npm run build:check` exit 0. The build lists `/api/health` as a dynamic route next to `/api/auth/[...all]`.
- Fast-fail check: `DATABASE_URL=postgres://x:x@127.0.0.1:9/x npx tsx worker/index.ts` exits 1, prints `worker failed: connect ECONNREFUSED 127.0.0.1:9` and does not print the connection string.
- Greps: `HEARTBEAT_STALE_SECONDS = 150` 1, `createQueue("heartbeat")` 1, `graceful: true` 1, `RENDER_GIT_COMMIT` 1, `status: 503` 1; `grep -rlE "from ['\"]next/" src/server` prints nothing.

## Not verified locally

There is no local Postgres, so these are proven only by plan 01-10 after deploy: the worker actually starting pg-boss and writing rows, the SIGTERM path (`boss.stop({ graceful: true })`, pool end, exit 0), and `/api/health` returning 200 with `worker.ok` true. The 503 branch is exercised only by reading the code. The `worker_heartbeats` migration (`drizzle/0000_phase1_init.sql`) is not applied anywhere yet.

## Deviations from Plan

**1. [Minor] `worker/index.ts` imports `@/server/db/client` and `@/server/heartbeat` dynamically inside `main()`** instead of at the top of the file. The db client calls `requireEnv("DATABASE_URL")` at import; a static import would throw before `main().catch`, skipping the `worker failed:` line. `requireEnv` is also called first in `main()` for the pg-boss connection string.

**2. [Rule 2 - hardening] Error text helper.** Node 24 can raise connection errors with an empty message (for example an AggregateError). The worker's `safeMessage` falls back to `code` or the error name so `worker failed:` is never blank. Only message text is logged, never the error object, which backs T-01-08-03.

**3. [Rule 2 - hardening] Shutdown guard.** A second SIGTERM/SIGINT while stopping is ignored, and a failed stop logs the message and exits 1.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model. `/api/health` is unauthenticated by design (T-01-08-01) and returns no versions or env values; on failure it returns only `{ status: "error", db: "error" }` with the error message going to the server log.

## Notes for later plans

- Plan 01-09 can call `getWorkerStatus(db)` from `@/server/heartbeat`; it returns `lastSeenAt` as well as `lastSeenSeconds` and `ok`.
- Plan 01-10 must run `npm run db:migrate` before the worker starts, and set `RENDER_GIT_COMMIT` (Render supplies it) for the `commit` field. pg-boss creates its own `pgboss` schema in the same database on first `boss.start()`.
- The health smoke test requires `worker.ok` true, so the worker service must be running and at least one heartbeat written within 150 s of the check.

## Self-Check: PASSED

All four created files exist; commits 874b3e8, 10602ff and 12ebaa1 are in `git log`.
