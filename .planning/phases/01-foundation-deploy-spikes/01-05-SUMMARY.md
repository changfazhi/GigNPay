---
phase: 01-foundation-deploy-spikes
plan: 05
subsystem: auth
tags: [better-auth, drizzle, postgres, roles, d-02, migration]
requires: [01-03]
provides:
  - createAuth(cfg) with role allowlist, worker PayPal email rule, D-02 judge gate, immutable role, rate-limit rules
  - Runtime Better Auth instance on the Drizzle adapter (src/server/auth/auth.ts)
  - Drizzle schema for all eight Phase 1 tables and one migration (drizzle/0000_phase1_init.sql)
  - /api/auth/[...all] route handler
affects: [01-06, 01-07, 01-08, 01-09, 01-10]
tech-stack:
  added: []
  patterns: [auth rules injected via createAuth(cfg) so tests run on the memory adapter, generated auth schema then owned with timestamptz]
key-files:
  created:
    - src/server/auth/options.ts
    - src/server/auth/auth.test.ts
    - src/server/auth/auth.ts
    - src/server/db/client.ts
    - src/server/db/schema/auth-schema.ts
    - src/server/db/schema/app.ts
    - drizzle.config.ts
    - drizzle/0000_phase1_init.sql
    - drizzle/meta/_journal.json
    - drizzle/meta/0000_snapshot.json
    - src/app/api/auth/[...all]/route.ts
  modified: []
key-decisions:
  - "Judge code is compared as SHA-256 digests with crypto.timingSafeEqual; it is read from the x-judge-signup-code header only and never stored"
  - "Judge sign-up is closed (403) when demo mode is off and no JUDGE_SIGNUP_CODE is configured, even if a header is sent"
  - "Generated auth ids use pg_catalog.gen_random_uuid() (built in), so the migration needs no CREATE EXTENSION"
requirements-completed: [AUTH-01, AUTH-02, AUTH-03]
duration: ~10min
completed: 2026-10-27
status: complete
---

# Phase 1 Plan 05: Auth core, Phase 1 schema and migration Summary

Better Auth enforces role, worker PayPal email and the D-02 judge gate in code tested on the memory adapter, and one generated Drizzle migration defines all eight Phase 1 tables behind a mounted `/api/auth/*` route.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 (RED) | Failing auth core tests | 68c71b3 |
| 1 (GREEN) | Auth rules: roles, PayPal email, judge gate (D-02) | b42bd96 |
| 2 | Schema, runtime auth, migration, /api/auth route | 5363930 |

## Verification

- `npx vitest run --project unit src/server/auth/auth.test.ts`: 15 tests pass. `npm run test`: 4 files, 35 tests pass.
- `npm run typecheck`, `npm run lint` and `npm run build:check` exit 0; the build lists `/api/auth/[...all]` as a dynamic route.
- `drizzle/0000_phase1_init.sql` has 8 `CREATE TABLE` statements: account, session, user, verification, spike_observations, spike_uploads, webhook_events, worker_heartbeats. No extension statements.
- `grep -c 'withTimezone: true' src/server/db/schema/auth-schema.ts` prints 12; `grep -rlE "from ['\"]next/" src/server` prints nothing.
- Options greps: `x-judge-signup-code` 1, `timingSafeEqual` 2, `role is immutable` 1.

Test coverage of the behavior list: worker sign-up stores role and paypalEmail and sign-in returns role plus a set-cookie header; customer sign-up without paypalEmail; admin, unknown and missing role give 400; worker without or with an invalid paypalEmail gives 400; 7-character password gives 400; judge gate branches (no code 403, wrong code 403, correct code ok, no code configured 403, demo mode ok); admin still rejected in demo mode; updateUser role gives 403 FORBIDDEN while name succeeds.

## Deviations from Plan

**1. [Minor] `grep -c toNextJsHandler` on the route file prints 2, not 1.** The route has the required import line plus the call, so the literal count in the acceptance criteria cannot be 1 with normal code. The plan's automated verify uses `grep -q` and passes. No code change.

**2. [Rule 2 - hardening] Extra test: judge sign-up with no configured `JUDGE_SIGNUP_CODE`** stays 403 even when the header is present but empty, and an extra test that `admin` is rejected in demo mode. Both back threat T-01-05-01 and T-01-05-03.

**3. Test helper detail.** `updateUser` is exercised with the cookie from a real sign-in response; the FORBIDDEN case is asserted as HTTP status 403 (Better Auth `APIError.statusCode`).

`npx auth@1.7.14 generate` was fetched through npx at the version the plan pins (not added as a dependency). The first run printed a "schema mismatch" notice because the schema file did not exist yet, then generated it.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model. Rate limiting (T-01-05-04) is configured but Better Auth applies it only when `NODE_ENV=production`, so it is not exercised by unit tests.

## Notes for later plans

- `src/server/db/client.ts` calls `requireEnv("DATABASE_URL")` at import, and `auth.ts` requires `BETTER_AUTH_SECRET`; anything importing them needs those env vars (the `build:check` script supplies placeholders).
- Plan 01-10 applies `drizzle/0000_phase1_init.sql` via `npm run db:migrate` against Render Postgres; it was generated without a database and not applied anywhere.
- `auth-schema.ts` is owned code now (timestamps edited to `withTimezone: true`); regenerating with the Better Auth CLI would overwrite those edits.

## Self-Check: PASSED

All 11 created files exist; commits 68c71b3, b42bd96 and 5363930 are in `git log`.
