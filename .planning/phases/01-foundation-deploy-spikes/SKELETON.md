# Walking Skeleton — Pay-When-Done Marketplace

**Phase:** 1
**Generated:** 2026-10-27
**Built by plans:** 01-02 (scaffold, auth core, schema), 01-03 (auth UI, dashboard, worker, health), 01-06 (Render deploy, [BLOCKING] schema apply, live smoke)

## Capability Proven End-to-End

A visitor opens the public Render HTTPS URL, signs up with email, password and a role (workers also give a PayPal email), stays signed in across refreshes, and lands on a role dashboard that reads their own row from Render Postgres and shows how many seconds ago the separate pg-boss background worker last wrote a heartbeat.

Proof: `tests/smoke/skeleton.smoke.test.ts` and `tests/smoke/health.smoke.test.ts` pass against the live URL (plan 01-06, Task 3), after `scripts/db/check-schema.ts` lists every Phase 1 table in the live database.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | Next.js 16.4.3 App Router, React 19.3.1, TypeScript ~5.9.3, route handlers for every API (`export const runtime = "nodejs"`), `src/proxy.ts` for optimistic redirects only | One full-stack TypeScript codebase for a solo build; route handlers carry money and state transitions (never Server Actions); TypeScript 7 is unsupported by typescript-eslint 8.72 |
| Scaffold flags | Cache Components and partial prefetching removed from `next.config.ts`; `serverExternalPackages: ["pg", "sharp-phash", "exifr"]` | The 16.4.3 scaffold enables them and they break `runtime`/`dynamic` exports; the app is per-user and live |
| Data layer | Render Postgres 18 + Drizzle ORM 0.45.4 on `pg` 8.23.1; generated SQL migrations in `drizzle/` applied by `drizzle-kit migrate` in Render's `preDeployCommand` | Types straight from the schema, plain SQL for atomic accepts and append-only tables later; migrations are repeatable and verified by `scripts/db/check-schema.ts` |
| Schema conventions | snake_case columns, `timestamp with time zone` everywhere, uuid primary keys (Better Auth `generateId: "uuid"`), auth tables generated once by `npx auth@1.7.14 generate` then owned | Consistent with the project architecture research; generated auth schema is edited once and never regenerated over hand edits |
| Auth | Better Auth 1.7.14, email + password, HttpOnly session cookie (7 days, no cookie cache), `role` additional field (customer / worker / judge, set once, immutable), `paypalEmail` required for workers, judge sign-up only in demo mode or with `JUDGE_SIGNUP_CODE` (D-02), `nextCookies()` last plugin | Mature library with scrypt hashing, origin checks and rate limiting; the role rules live in one tested `createAuth()` |
| Authorization | Pure `assertRole` / `assertJobParty` in `src/server/auth/authorize.ts`, applied through `withActor(roles, handler)` in `src/web/with-actor.ts` (401 / 403) | Server decides on every request; relationship rules are data so Phase 2's transition table reuses them |
| Demo access | `POST /api/demo/switch` performs a real `signInEmail` as one of three seeded accounts; 404 unless `DEMO_MODE === "true"`; Origin must equal the app origin | Lets one presenter run all roles without weakening authorization (AUTH-04) |
| Background work | Separate Render Background Worker running `tsx worker/index.ts` with pg-boss 12 in the same Postgres; liveness = `worker_heartbeats` rows (workers have no Render health check) | No Redis; jobs and state commit together; heartbeat proves web, worker and DB share `src/server` |
| Media storage | Cloudflare R2 private bucket `pwd-evidence`; browser uploads with presigned PUT (600 s, signed Content-Type and Content-Length, checksum mode `WHEN_REQUIRED`); reads via 300 s signed GET only; server-generated keys | Bytes never pass through Render; the bucket is never public (FND-02) |
| PayPal | Raw REST through one module `src/server/payments/paypal-rest.ts` (token cache, `paypalFetch`, webhook verification); webhook receiver verifies the raw body by postback and fails closed; webhook id resolved at runtime by URL | Seed of the Phase 2 single PayPal egress; verification is real from day one |
| Deployment target | Render Blueprint `render.yaml`: `pwd-web` (web, 0.5c-512mb), `pwd-worker` (worker, 0.5c-512mb), `pwd-db` (Postgres 0.1c-256mb), all in `oregon`, auto-deploy on commit to `main`, `healthCheckPath: /api/health`; deploys go through `scripts/deploy/push-and-wait.ts` | Paid plans so webhooks and the demo never hit a sleeping service (FND-01); the helper refuses to push secrets and waits for the deployed commit |
| Secrets | Render env (`sync: false`, `generateValue`, `fromDatabase`) and the owner's `.env.local` in the main checkout only; evidence written through `writeEvidence()` and gated by `scripts/lib/check-evidence.ts` | Public GitHub repo; nothing secret is ever committed or printed |
| UI | Tailwind 4 + shadcn 4.22.1 defaults (button, input, label, card, radio-group), single-column and phone-usable | D-05: plain and clean in Phase 1; UI specs start in Phase 2 |
| Tests | Vitest 5.0.5 with two projects: `unit` (no network, DB or secrets; Better Auth memory adapter) and `smoke` (HTTP against the deployed URL, skipped when no base URL) | Fast local feedback plus real end-to-end proof on Render; Playwright deferred (CONTEXT deferred ideas) |
| Directory layout | `src/app/**` (pages and route handlers), `src/server/**` (domain code shared by web and worker; no `next/*` imports), `src/web/**` (web-only server helpers such as `getActor`, `withActor`), `src/lib/**` (pure helpers and the browser auth client), `src/components/**` (UI), `worker/index.ts`, `scripts/**` (tsx scripts; `scripts/lib` shared helpers; `scripts/spikes/<name>` spike code), `tests/{smoke,docs}`, `drizzle/` | The worker and scripts import `src/server` directly with tsx; Next-specific code stays out of it |

## Stack Touched in Phase 1

- [x] Project scaffold (framework, build, lint, test runner) — plan 01-02
- [x] Routing — real routes `/signup`, `/login`, `/dashboard`, `/api/auth/*`, `/api/me`, `/api/health` — plans 01-02, 01-03
- [x] Database — real write (sign-up inserts user/account/session rows; worker inserts heartbeats) and real read (dashboard reads the user row and worker status) — plans 01-02, 01-03, verified live in 01-06
- [x] UI — sign-up form wired to the Better Auth API; dashboard role panel wired to role routes (01-07); demo switcher wired to the switch route (01-08)
- [x] Deployment — running on Render paid plans at a public HTTPS URL — plan 01-06

## Out of Scope (Deferred to Later Slices)

- Jobs, checklists, pricing, PayPal checkout and holds, captures and payouts in the product (Phase 2 onward; Phase 1 only spikes them)
- Evidence capture flow, integrity gate, AI verification, disputes, timers and the demo clock (Phases 3 to 6)
- Zapier notifications and the Elastic mirror in the product (Phase 7; Phase 1 only spikes them)
- Password reset, email verification, magic links, OAuth providers
- Better Auth admin plugin and impersonation (rejected in research)
- UI design contracts (from Phase 2 via /gsd-ui-phase) and Playwright end-to-end tests
- Postgres extensions in migrations (cube/earthdistance/pgcrypto availability is only probed by S-ENV; Phase 3 adds them if needed)
- Removing the Phase 1 diagnostic routes (`/api/spikes/*`) and the worker's spike notify producer (replaced in Phases 3 and 4)

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering its architectural decisions:

- Phase 2: A customer's PayPal sandbox funds are held on a job and, on a human click, captured and paid out 95% to the worker, with every money event in an append-only ledger.
- Phase 3: A customer describes a job in chat, agrees a checklist and price and places the hold; a nearby worker accepts and checks in; both watch status live over SSE.
- Phase 4: A worker's on-site photos and video are captured as untouched originals with server-observed proof, and reuse, edit and stock-image fraud is flagged.
- Phase 5: Claude and Gemini score the same evidence; payment auto-releases only when both agree, otherwise the customer decides.
- Phase 6: Every waiting state has a timer, and a rejected job goes through statements, an AI case brief and a one-screen judge ruling carried out in PayPal.
- Phase 7: Zapier emails and the Elastic mirror work without blocking jobs, and the three video moments run end to end on the deployed URL.
