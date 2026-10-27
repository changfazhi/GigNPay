# Phase 1: Foundation, Deploy & Spikes - Research

**Researched:** 2026-10-27
**Domain:** Next.js 16 + Drizzle/Postgres + Better Auth app on Render (web + pg-boss worker + Postgres), Cloudflare R2 private media, PayPal sandbox webhook receiver, and eight vendor spikes (PayPal, phone metadata, Elastic, Claude/Gemini, Zapier, SSE)
**Confidence:** MEDIUM-HIGH. Package versions, Better Auth behaviour, AWS-SDK/R2 presign behaviour, Next 16 scaffold behaviour, SSE streaming, sharp/exifr/phash behaviour and the PayPal reauthorize error catalogue were verified by running code or reading shipped schemas this session. Render plan IDs and R2/Elastic/Zapier account rules come from vendor docs (MEDIUM). Phone EXIF behaviour, Payouts enablement, sandbox honor-period enforcement and ffmpeg presence are unverified until the spikes run (LOW), which is exactly what the spikes are for.

> Project-level research (`.planning/research/*.md`) is taken as given and not repeated. This file verifies and deepens only what Phase 1 needs, and records where this session's checks **contradict or sharpen** it (see "Corrections to earlier research").

<user_constraints>
## User Constraints (from CONTEXT.md)

No `01-CONTEXT.md` exists for this phase (discuss-phase was not run). The constraints below are taken from the orchestrator brief, `PROJECT.md` Key Decisions and `REQUIREMENTS.md`, and are treated with locked-decision authority.

### Locked Decisions
- Stack: Next.js 16 App Router + TypeScript ~5.9 + Tailwind 4 (+ shadcn if cheap); Drizzle + `pg`; Better Auth; pg-boss 12 worker run with `tsx`; Postgres on Render; Cloudflare R2 via AWS SDK v3; one repo, two Render deployables sharing `src/server`.
- Render on **paid** plans from day 1 (web service + background worker + Postgres). No free tiers. (FND-01; REQUIREMENTS "Out of Scope: Free hosting tiers".)
- Photos and videos live in a **private** R2 bucket: presigned PUT upload, signed-URL view only. (FND-02)
- Spike results are written down **before** money and evidence code is built. They cover PayPal reauthorize count and timing, partial capture then void, Payouts in sandbox, iPhone/Android photo metadata, Elastic bit-vector search, Claude + Gemini structured scoring, Zapier Catch Hook access, SSE on Render. (FND-03; STATE: Phase 1 spike results gate Phase 2 money code and Phase 4 evidence code.)
- Auth: email + password, one role per account (customer / worker / judge), server checks role **and** job relationship on every decision, worker gives a PayPal email at sign-up, demo-mode one-click switch between seeded accounts where every switched request is still really authorized. (AUTH-01..04)
- Reauthorization is designed for **once, from day 4**; capture against the latest authorization id; 7-day job lifetime with a re-confirm-hold fallback (PROJECT Key Decisions). Phase 1 only confirms the facts.
- "EXIF is corroborating only" - server nonce + device GPS are primary integrity signals (PROJECT Key Decisions). The camera spike measures what survives; it does not make EXIF a gate.
- SSE + polling for live status, not WebSocket (PROJECT Key Decisions).
- Mode `mvp` (walking skeleton). UI-SPEC skipped by the owner: plain, clean auth screens are fine.
- Security enforcement on: ASVS L1, block on high. Nyquist validation on.
- PayPal **sandbox only**. US, USD, aircon servicing.

### Claude's Discretion
- Exact walking-skeleton slice (recommended below).
- Demo role-switch mechanism (recommended: `DEMO_MODE`-gated route handler that signs in as a seeded account; rejected: Better Auth admin impersonation).
- Test tooling (recommended: Vitest 5 only; Playwright not justified in Phase 1).
- Location and format of the spike results document (recommended below).
- Whether `judge` self-sign-up is open or invite-gated (see Open Questions; recommended default: open only while `DEMO_MODE=true`, or gated by an optional invite code).

### Deferred Ideas (OUT OF SCOPE)
- Everything in REQUIREMENTS "v2" (kill fee, rework, milestone holds, ratings, multi-trade, live PayPal) and "Out of Scope" (live reauth in the demo video, in-app chat, WebSocket hub, Postman, free hosting tiers).
- Money, job, evidence, AI, dispute and notification feature code. Phase 1 builds **only** the receiver stub for PayPal webhooks, the spike scripts, and the foundation.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FND-01 | App deployed on Render on paid plans (web, worker, Postgres) with a public HTTPS URL PayPal webhooks can reach | `render.yaml` below (plan IDs `0.5c-512mb` web/worker, `0.1c-256mb` Postgres, ~$20/mo); `preDeployCommand` migrations; `/api/health`; worker heartbeat; webhook receiver + registration script |
| FND-02 | Private R2 bucket, presigned PUT upload, signed-URL view only | R2 config, CORS JSON, checksum fix `WHEN_REQUIRED` (verified), signed `content-length`, unsigned-URL refusal test, phone upload page |
| FND-03 | Spike results written before money and evidence code | Eight spike plans with scripts, human steps, expected outcomes, and the `SPIKES.md` format |
| AUTH-01 | Email/password sign-up/login, stay logged in across refresh | Better Auth 1.7.14 + Drizzle adapter + `nextCookies()`; 7-day default session; verified sign-up/sign-in with memory adapter |
| AUTH-02 | One role per account; server checks role and job relationship on every decision | `role` additional field, allowlist hook (verified), `update-user` immutability hook (verified), pure `authorize()` helper with table tests |
| AUTH-03 | Worker provides PayPal email at sign-up | `paypalEmail` additional field + `hooks.before` rule (verified rejects worker without it) |
| AUTH-04 | Demo switch between seeded accounts, every switched request really authorized | `POST /api/demo/switch` signs in with `auth.api.signInEmail` as a seeded user (real session); strict `DEMO_MODE === "true"` gate; Origin check |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

Extracted from `./.claude/CLAUDE.md` (the GSD-managed project file; the home-directory `CLAUDE.md` describes unrelated projects and is not applicable):

- Next.js full-stack TypeScript (PWA + API route handlers), Postgres, object storage with signed URLs, **separate worker process** for the minute sweeper, one codebase, solo builder.
- Anthropic (Claude) + Google (Gemini) as the two vendors. PayPal **sandbox only**. Render hosting, deployed early so PayPal webhooks reach a public URL.
- Verification engine accepts only a job id; role auth enforced server-side on every decision; PayPal webhook signatures verified.
- Pin exact versions (`save-exact`). `typescript` pinned `~5.9.3` (never `latest`). `export const runtime = 'nodejs'` on webhook, SSE and any route using `pg`, `sharp` or PayPal. Do NOT enable `cacheComponents`. `next lint` is gone: run `eslint` directly. Server Actions must not carry money or state transitions.
- "What NOT to Use" table (typescript 7, prisma latest, next-auth/lucia, legacy PayPal SDKs, `getUserMedia`+canvas for evidence, EXIF as a hard gate, `temperature`/`top_p`/`top_k` on Claude, forced `tool_choice`, Claude server-side `fallbacks` on the judge, `fluent-ffmpeg`, free Render tiers, edge runtime, in-process cron, webhook simulator for signature testing).
- GSD workflow: all file changes go through a GSD command (`/gsd-execute-phase` for planned work).
- Next 16 scaffold ships `AGENTS.md` telling agents to read `node_modules/next/dist/docs/` (versioned docs shipped inside the package) before writing Next code. Keep that file and follow it. [VERIFIED: ran `create-next-app@16.4.3`]

## Summary

Phase 1 is two parallel tracks. **Track A (the walking skeleton)** is a thin vertical slice that proves every deployable and integration point end to end: sign up (role + PayPal email for workers) -> Better Auth writes the user row in Postgres -> role dashboard (a server component) reads it -> a pg-boss worker writes a heartbeat row that the dashboard displays -> the whole thing deployed from `render.yaml` on paid Render plans, with a signature-verifying PayPal webhook receiver, a one-click demo switcher, and a private R2 bucket with a phone upload page. **Track B (the spikes)** are eight scripts or pages that each produce a written result in `SPIKES.md`. Most Track B work does not need the deployed app and can start on day 1, in parallel with Track A.

**The clock-bound item must start first.** Reauthorization can only be tested 72+ hours after an authorization exists, so the very first task of the phase (after the owner has PayPal sandbox credentials) is to create and authorize the "aged" orders. Everything else in the PayPal spike can run the same day.

Four findings from this session change the plan and are not in the project research. (1) **The Next 16.4.3 scaffold turns on `cacheComponents: true` and `partialPrefetching: true` in `next.config.ts`; with that on, `export const runtime` and `export const dynamic` in route handlers fail the build** [VERIFIED: built it]. The scaffold output must be edited, and the scaffold command refuses this repo's directory name (space, capitals), so scaffold elsewhere and copy in. (2) **The AWS SDK v3 default adds `x-amz-checksum-crc32=AAAAAA==` and `x-amz-sdk-checksum-algorithm=CRC32` to presigned PUT URLs** (the checksum of an empty body), which would break real uploads; `requestChecksumCalculation: "WHEN_REQUIRED"` removes them [VERIFIED: generated URLs both ways]. (3) **PayPal's own error catalogue says a reauthorization cannot be reauthorized again (`REAUTHORIZATION_NOT_SUPPORTED`), "only once from Day 4 to Day 29" (`REAUTHORIZATION_TOO_SOON`), and a reauthorization cannot be voided - void the original parent (`CANNOT_BE_VOIDED`)** [VERIFIED: PayPal schema.json]. That settles the design (one reauth; void targets the original id) and leaves the spike to confirm sandbox behaviour. (4) **Android may strip GPS from file-input photos as well as iOS**; the camera spike must test both, and the design (EXIF corroborates only) already survives either outcome.

**Primary recommendation:** Build the skeleton and the spikes as two independent plan streams. Start the PayPal aged orders, the Elastic/LLM/Zapier scripts and the Render/R2/PayPal account set-up (all human prerequisites) in the first wave; deploy the skeleton to Render as early as it builds; run the deployed-only spikes (SSE, phone camera, webhook, ffmpeg/extension smoke) as soon as the URL is live; write every result into one `SPIKES.md`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Sign-up, login, session cookie | API / Backend (Better Auth route handler) | Browser (forms) | Credentials and session are server-owned; cookie is HttpOnly |
| Role and relationship authorization | API / Backend (`authorize()` in every route handler / server component) | Frontend Server (optimistic redirect in `proxy.ts` only) | `proxy.ts` is only an optimistic cookie check; real check lives next to the data |
| Role-specific dashboard | Frontend Server (RSC reads session + DB) | Browser | Server component can read the DB directly |
| Demo account switch | API / Backend (route handler, `DEMO_MODE` gate) | Browser (button) | Must mint a real session server-side |
| Photo/video upload | Browser -> R2 directly (presigned PUT) | API (mints presigned URL, validates) | Bytes never pass through Render; avoids body limits |
| Signed read URLs | API / Backend (re-checks relation, 5 min expiry) | CDN / Static (R2 as origin) | Bucket is private |
| PayPal webhook receive + verify | API / Backend (route handler, raw body) | Database (dedupe table) | Needs raw bytes and PayPal postback verification |
| Background heartbeat / queues | Worker process (pg-boss) | Database | Separate Render service; same code in `src/server` |
| Live status stream (spike only) | API / Backend (SSE route) | Database (LISTEN/NOTIFY), Worker (NOTIFY producer) | Proves the Phase 3 realtime path |
| Spike scripts (PayPal, LLM, Elastic, Zapier) | Local scripts (`tsx`) run by Claude | Vendor APIs | Not part of the shipped app |
| Phone metadata diagnostics | Browser (file input) -> R2 -> API (exifr on server) | Database (result rows) | EXIF must be read server-side from the untouched original |

## Standard Stack

### Core (Phase 1 subset; versions re-verified against the npm registry on 2026-10-27)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | 16.4.3 | App Router, route handlers, `proxy.ts` | Project decision; `latest` dist-tag [VERIFIED: npm view] |
| `react` / `react-dom` | 19.3.1 | UI | `latest`; scaffold pins 19.3.0, bump to 19.3.1 [VERIFIED: npm view] |
| `typescript` | ~5.9.3 | Types | `latest` is 7.0.2, which `typescript-eslint@8.72.1` does not support; scaffold resolves `^5` to 5.9.3 [VERIFIED: npm ls in scaffold] |
| `drizzle-orm` / `drizzle-kit` | 0.45.4 / 0.31.11 | Schema + migrations | `generate --custom` gives empty SQL migrations for extensions/triggers [VERIFIED: `--help`] |
| `pg` / `@types/pg` | 8.23.1 / 8.23.1 | Driver for Drizzle, pg-boss, LISTEN | pg-boss depends on `pg ^8.23.1` [VERIFIED] |
| `better-auth` | 1.7.14 | Auth, sessions | Drizzle adapter re-exported at `better-auth/adapters/drizzle`; `better-auth/next-js` exports `nextCookies`, `toNextJsHandler` [VERIFIED: imported modules] |
| `zod` | 4.6.7 | Validation, LLM schemas | Shared by API and spike schemas [VERIFIED: npm view] |
| `pg-boss` | 12.38.0 | Queue + schedule in the worker | Node >=22.12; `import { PgBoss } from "pg-boss"`; must `createQueue` before `send`/`work`; handler receives an **array** of jobs [VERIFIED: README in package] |
| `tsx` | 4.23.15 | Run `worker/index.ts` and spike scripts | Resolves the Next tsconfig `@/*` alias [VERIFIED: ran it] |
| `tailwindcss` + `@tailwindcss/turbopack` | 4.3.3 | Styling (scaffold uses the turbopack loader) | Emitted by `create-next-app@16.4.3` [VERIFIED] |
| `shadcn` | 4.22.1 | Components | `npx shadcn@4.22.1 init -d -y` works non-interactively (preset `base-nova`, Base UI) and the app still builds [VERIFIED: ran it] |
| `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` | 3.1157.0 (both) | R2 presign | Keep in lockstep [VERIFIED: npm view] |
| `vitest` | 5.0.5 | Unit + smoke tests | Uses Vite 8.3.5; `projects` and `resolve.tsconfigPaths` work [VERIFIED: ran it] |

### Supporting (spikes; install only what the spike needs)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `exifr` | 7.1.3 | EXIF read from a Buffer | Camera spike; returns `undefined` for a JPEG with no EXIF [VERIFIED] |
| `sharp` | 0.35.5 | Decode/resize; pHash input | Camera spike; its `heif` format lists only `.avif` as a file suffix, i.e. no HEVC `.heic` decode [VERIFIED: `sharp.format.heif`] |
| `sharp-phash` | 2.2.0 | 64-bit pHash | Returns a 64-char binary string [VERIFIED] |
| `@elastic/elasticsearch` | 9.5.1 | Elastic spike | Supports `serverMode: 'serverless'` and `element_type: 'bit'` in its types [VERIFIED: grep typings] |
| `@anthropic-ai/sdk` | 1.3.0 | Claude spike | `client.messages.parse` + `zodOutputFormat` from `@anthropic-ai/sdk/helpers/zod` [VERIFIED: skill docs + ran schema conversion] |
| `@google/genai` | 2.31.0 (pin `~2.31.0`) | Gemini spike | Both `models.generateContent` (+ `responseJsonSchema`) and `interactions` exist in 2.31.0 [VERIFIED: grep typings] |
| `@paypal/paypal-server-sdk` | 2.5.0 | Phase 2 module | Spikes use raw `fetch` instead (see PayPal spike); install the SDK in Phase 2 |
| `ffmpeg-static` | 5.3.0 | Only if system ffmpeg is absent | Has an `install` script that downloads a binary; Phase 4 dependency, not needed for Phase 1 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `POST /api/demo/switch` signing in as a seeded user | Better Auth `admin` plugin `impersonateUser` | Plugin adds `role`/`banned` columns and an `impersonatedBy` session field, collides with our own `role` field, needs an admin session first, and sessions default to 1 hour. Rejected. |
| Vitest only | Playwright | Playwright would add a browser download and flaky PayPal/phone steps for little extra coverage; HTTP-level smoke tests against the deployed URL cover sign-up, role refusal and health. Add Playwright in a later phase for the PayPal button if wanted. |
| Raw `fetch` for PayPal spikes | `@paypal/paypal-server-sdk` | Raw calls expose headers, status codes and `PayPal-Debug-Id` exactly, which is the evidence the spike needs; the SDK hides them. Production module (Phase 2) can still use the SDK. |

**Installation (after scaffolding; exact pins):**
```bash
# .npmrc: save-exact=true
npm i next@16.4.3 react@19.3.1 react-dom@19.3.1 \
  drizzle-orm@0.45.4 pg@8.23.1 better-auth@1.7.14 zod@4.6.7 pg-boss@12.38.0 tsx@4.23.15 drizzle-kit@0.31.11 \
  @aws-sdk/client-s3@3.1157.0 @aws-sdk/s3-request-presigner@3.1157.0 exifr@7.1.3
npm i -D typescript@5.9.3 @types/pg@8.23.1 vitest@5.0.5
# spike-only (devDependencies):
npm i -D sharp@0.35.5 sharp-phash@2.2.0 @elastic/elasticsearch@9.5.1 @anthropic-ai/sdk@1.3.0 "@google/genai@~2.31.0"
```
`tsx` and `drizzle-kit` go in `dependencies` (not dev) because the Render worker and `preDeployCommand` run them. Render does not set `NODE_ENV` at build time, so devDependencies are installed during the build, but putting runtime tools in `dependencies` removes the dependency on that behaviour. [CITED: render.com/docs/environment-variables]

**Version verification:** all versions above were read with `npm view <pkg> version` on 2026-10-27 (see Standard Stack table); `typescript@latest` is 7.0.2 and must not be installed.

## Package Legitimacy Audit

Seam used: `gsd-tools query package-legitimacy check --ecosystem npm ...`. **Important reading of the seam output:** the `too-new` reason is computed from the publish date of the *latest version*, not package age; every `SUS`/`too-new` row below is a heavily used package (hundreds of thousands to hundreds of millions of weekly downloads, established source repos, no `postinstall`). They are heuristic false positives for actively released packages, and listed as `Approved` here. Genuine attention items are `cn`, `@tailwindcss/turbopack` (verified by hand below) and `ffmpeg-static` (install-time binary download).

| Package | Registry | Weekly downloads | Source Repo | Verdict | Disposition |
|---------|----------|------------------|-------------|---------|-------------|
| next, react, react-dom, zod, pg, drizzle-orm, better-auth, pg-boss, @aws-sdk/client-s3, @aws-sdk/s3-request-presigner, @anthropic-ai/sdk, @google/genai, sharp, vitest, @vitest/coverage-v8, @playwright/test, eslint, dotenv | npm | 0.78M to 211M | official repos | SUS (`too-new` = latest version published <30 days ago) | Approved; no postinstall; popular, long-lived |
| typescript, drizzle-kit, @types/pg, tsx, tailwindcss, @paypal/paypal-server-sdk, @elastic/elasticsearch, exifr, sharp-phash | npm | 0.12M to 217M | official repos | OK | Approved |
| `@tailwindcss/turbopack` | npm | 0 reported | github.com/tailwindlabs/tailwindcss; maintainers reinink, adamwathan | SUS (`low-downloads`) | Approved: emitted by the official `create-next-app@16.4.3` template; maintainers are the Tailwind team [VERIFIED: npm view] |
| `cn` 0.5.0 | npm | 1.9k | github.com/shadcn-ui/cn; maintainer shadcn | SUS (`too-new`) | Flagged: shadcn 4.22.1 writes `export { cn } from "cn"` into `src/lib/utils.ts`. Repo and maintainer are the shadcn author's, so keep, but the planner should add a short `checkpoint:human-verify` ("confirm `cn` resolves to github.com/shadcn-ui/cn") or replace it with a 3-line `clsx`+`tailwind-merge` helper. [WARNING: flagged as suspicious - verify before using.] |
| `ffmpeg-static` | npm | 1.09M | github.com/eugeneware/ffmpeg-static | OK, but `scripts.install = node install.js` downloads a binary | Not needed in Phase 1 unless `which ffmpeg` fails on Render; if installed, gate behind a human-verify note |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** `cn` (see above); `@tailwindcss/turbopack` cleared by hand.

All package names in this research came from the project's STACK.md (already registry-checked), the `create-next-app`/`shadcn` CLIs' own output, or PayPal/Anthropic/Google/Elastic official docs, so none are tagged `[ASSUMED]`.

## Architecture Patterns

### System Architecture Diagram

```
 Phone / laptop browser
   |  sign-up / login / dashboard           |  <input type=file capture>          |  EventSource (spike)
   v                                        v  (original file, untouched)         v
┌─────────────────────────── RENDER WEB SERVICE (paid, Node 24) ──────────────────────────────┐
│ proxy.ts (optimistic cookie redirect only)                                                  │
│ /api/auth/[...all]  Better Auth  --hooks.before: role allowlist, worker needs paypalEmail--┐│
│ /signup /login /dashboard (RSC: getSession -> DB read -> role panel)                       ││
│ /api/{customer,worker,judge}/ping  -> requireActor() -> authorize(role) -> 200 | 403       ││
│ POST /api/demo/switch  (404 unless DEMO_MODE==="true"; Origin check; allowlisted accounts) ││
│ POST /api/spikes/presign -> R2 presigned PUT (auth, key prefix, size, mime allowlist)      ││
│ POST /api/spikes/analyze -> GET object from R2 -> sha256 + exifr + magic bytes -> DB       ││
│ GET  /api/spikes/sse  (heartbeat + LISTEN spike channel)                                   ││
│ POST /api/webhooks/paypal -> req.text() -> verify-webhook-signature postback -> dedupe -> DB││
│ GET  /api/health -> select 1 + latest worker heartbeat                                     ││
└───────┬───────────────────────────────┬──────────────────────────────┬─────────────────────┘│
        │ SQL (internal URL)            │ presigned PUT/GET (HTTPS)    │ verify postback      │
        v                               v                              v                      │
┌────────────────┐  LISTEN/NOTIFY  ┌─────────────────┐        ┌───────────────────┐          │
│ RENDER POSTGRES│<───────────────>│ CLOUDFLARE R2   │        │ PayPal sandbox    │──webhooks (signed, public HTTPS)
│ auth tables,   │                 │ private bucket, │        │ api-m.sandbox...  │
│ webhook_events,│                 │ CORS = Render   │        └───────────────────┘
│ worker_heartbeats, spike_uploads, pgboss.*       │ origin only
└───────▲────────┘                 └─────────────────┘
        │ pg-boss (same DATABASE_URL)
┌───────┴──────────────── RENDER BACKGROUND WORKER (paid) ──────────────────┐
│ worker/index.ts (tsx): PgBoss.start -> createQueue -> schedule("* * * * *")│
│ heartbeat handler -> INSERT worker_heartbeats; every 10 s pg_notify (SSE   │
│ spike); SIGTERM -> boss.stop({ graceful: true })                           │
└────────────────────────────────────────────────────────────────────────────┘

 Laptop (Claude-run, unattended once keys exist): scripts/spikes/* -> PayPal sandbox, Anthropic, Gemini, Elastic Cloud, Zapier hook, R2 round-trip, deployed URL (SSE probe, webhook simulate)
```

### Recommended Project Structure
```
.node-version             # "24" (Render honours it; pg-boss needs >=22.12)
.npmrc                    # save-exact=true
render.yaml               # Blueprint: web + worker + db
drizzle.config.ts
drizzle/                  # generated + custom SQL migrations (committed)
vitest.config.mts         # .mts avoids the CJS/ESM config warning
src/
├── app/
│   ├── (auth)/{signup,login}/page.tsx
│   ├── dashboard/page.tsx            # RSC, reads session + DB, role panel
│   ├── spikes/{camera,sse}/page.tsx  # diagnostic pages (auth + DIAG gate)
│   └── api/
│       ├── auth/[...all]/route.ts
│       ├── health/route.ts
│       ├── {customer,worker,judge}/ping/route.ts
│       ├── demo/switch/route.ts
│       ├── spikes/{presign,analyze,sse,diag}/route.ts
│       └── webhooks/paypal/route.ts
├── server/                           # imported by web AND worker (no next/* imports here)
│   ├── env.ts                        # zod-parsed env, one place
│   ├── db/{client.ts,schema/*.ts}    # drizzle; auth-schema.ts generated once then owned
│   ├── auth/{auth.ts,actor.ts,authorize.ts,demo.ts}
│   ├── storage/r2.ts
│   ├── payments/paypal-rest.ts       # token cache + verifyWebhook (seed of the Phase 2 module)
│   └── webhooks/paypal.ts
├── lib/{geo.ts,phash.ts}             # pure helpers (hamming, bit packing)
worker/index.ts
scripts/
├── seed.ts                           # idempotent, DEMO_MODE only
├── paypal-register-webhook.ts
└── spikes/{paypal,camera,elastic,llm,zapier,sse,env}/...
tests/{smoke,docs}/...
.planning/phases/01-foundation-deploy-spikes/{SPIKES.md,spike-evidence/}
```
`src/server` must not import `next/*` or `server-only` so `tsx` can run it from the worker.

### Pattern 1: Scaffold into a temp dir, then copy in (directory name blocks `create-next-app`)
**What:** `create-next-app` refuses the repo directory ("Pay-When-Done Marketplace": space and capitals) [VERIFIED: error from `npm naming restrictions`]. It also runs `git init` and adds `AGENTS.md`.
**How:**
```bash
cd "$SCRATCH" && npx create-next-app@16.4.3 pay-when-done --ts --tailwind --app --src-dir --eslint --turbopack \
  --import-alias "@/*" --use-npm --skip-install --yes
rm -rf pay-when-done/.git
# copy everything (including dotfiles, AGENTS.md) into the repo root; do NOT overwrite .planning/ .claude/ .git/
rsync -a --exclude .git pay-when-done/ "/Users/chang/Pay-When-Done Marketplace/"
```
Then edit `package.json` `name` to `pay-when-done`, **delete `cacheComponents: true` and `partialPrefetching: true` from `next.config.ts`** (keep the `turbopack.rules` block), bump React to 19.3.1, set exact pins, add `"engines": {"node": ">=22.12 <25"}`.

### Pattern 2: Better Auth with a role the user picks once and can never change [VERIFIED end-to-end with the memory adapter on 1.7.14]
```ts
// src/server/auth/auth.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";            // must be the LAST plugin
import { createAuthMiddleware, APIError } from "better-auth/api";
import { db } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { env } from "@/server/env";

export const ROLES = ["customer", "worker", "judge"] as const;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;                    // sandbox emails end in .example.com

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  secret: env.BETTER_AUTH_SECRET,                               // throws in production if left at the default [VERIFIED]
  baseURL: env.BETTER_AUTH_URL ?? process.env.RENDER_EXTERNAL_URL,
  trustedOrigins: [env.BETTER_AUTH_URL ?? process.env.RENDER_EXTERNAL_URL!].filter(Boolean),
  advanced: { database: { generateId: "uuid" } },               // uuid PKs, matches project convention [VERIFIED via `auth generate`]
  emailAndPassword: { enabled: true },                          // min 8 / max 128 chars by default
  user: { additionalFields: {
    role:        { type: ["customer", "worker", "judge"], required: true, input: true },
    paypalEmail: { type: "string", required: false, input: true },
  }},
  hooks: { before: createAuthMiddleware(async (ctx) => {
    if (ctx.path !== "/sign-up/email") return;
    const { role, paypalEmail } = (ctx.body ?? {}) as { role?: string; paypalEmail?: string };
    if (!ROLES.includes(role as never)) throw new APIError("BAD_REQUEST", { message: "invalid role" });   // 'admin', missing -> rejected
    if (role === "worker" && !EMAIL.test(paypalEmail ?? "")) throw new APIError("BAD_REQUEST", { message: "worker needs a PayPal email" });
    // optional: if (role === "judge" && env.JUDGE_SIGNUP_CODE && ctx.body.inviteCode !== env.JUDGE_SIGNUP_CODE) throw ...
  })},
  databaseHooks: { user: { update: { before: async (data) => {
    if ("role" in data) throw new APIError("FORBIDDEN", { message: "role is immutable" });             // update-user cannot escalate [VERIFIED]
    return { data };
  }}}},
  plugins: [nextCookies()],
});
```
Facts behind this (all observed): `hooks.before` also fires for server-side `auth.api.*` calls; a sign-up with `role: "admin"` or no role returns 400; a worker without `paypalEmail` returns 400; `auth.api.updateUser({ body: { role } })` returns FORBIDDEN while `{ name }` succeeds; sign-in returns the stored role; rate limiting is **only enabled when `NODE_ENV=production`** (100 requests per 10 s default, in-memory) and the default secret throws in production. Do **not** use the `admin` plugin in Phase 1. `generate` workflow: `npx auth@latest generate --config ./src/server/auth/auth.ts --output ./src/server/db/schema/auth-schema.ts -y`, then **edit the generated file once to `timestamp(..., { withTimezone: true })`** (it emits plain `timestamp`) and treat it as owned code; regenerating overwrites hand edits.

### Pattern 3: Server-side authorization helper (role + relationship) as a pure function
```ts
// src/server/auth/authorize.ts  (pure, table-tested; no next/* imports)
export type Role = "customer" | "worker" | "judge";
export type Actor = { id: string; role: Role };
export class Forbidden extends Error {}

export function assertRole(actor: Actor | null, ...allowed: Role[]): asserts actor is Actor {
  if (!actor) throw new Forbidden("unauthenticated");
  if (!allowed.includes(actor.role)) throw new Forbidden(`role ${actor.role} may not do this`);
}
// Relationship rules are data so Phase 2's transition table can reuse them.
export type JobRel = { customerId: string; workerId: string | null };
export function assertJobParty(actor: Actor, job: JobRel, party: "customer_owner" | "assigned_worker" | "judge") {
  const ok =
    (party === "customer_owner" && actor.role === "customer" && actor.id === job.customerId) ||
    (party === "assigned_worker" && actor.role === "worker" && job.workerId !== null && actor.id === job.workerId) ||
    (party === "judge" && actor.role === "judge");
  if (!ok) throw new Forbidden(`not ${party}`);
}
```
```ts
// src/server/auth/actor.ts (web-only; uses next/headers)
import { headers } from "next/headers";
export async function getActor(): Promise<Actor | null> {
  const s = await auth.api.getSession({ headers: await headers() });   // no cookieCache: role/session changes show up immediately
  return s ? { id: s.user.id, role: s.user.role as Role } : null;
}
// route handler: const actor = await getActor(); try { assertRole(actor, "worker") } catch { return new Response("forbidden", { status: 403 }) }
```
Unauthenticated -> 401, wrong role -> 403 (map in one `withActor(handler, ...roles)` wrapper so no route forgets the check). `proxy.ts` only redirects when there is no session cookie (`getSessionCookie`), never as the sole check. [CITED: better-auth.com/docs/integrations/next]

### Pattern 4: Demo switcher that is a real login, off by default [design; core call verified]
```ts
// src/app/api/demo/switch/route.ts
export const runtime = "nodejs";
const SEEDED = { customer: "customer@demo.example.com", worker: "worker@demo.example.com", judge: "judge@demo.example.com" } as const;

export async function POST(req: Request) {
  if (process.env.DEMO_MODE !== "true") return new Response(null, { status: 404 });          // strict equality, default OFF
  const origin = req.headers.get("origin");
  if (!origin || new URL(origin).origin !== new URL(req.url).origin) return new Response(null, { status: 403 }); // login-CSRF guard
  const { role } = z.object({ role: z.enum(["customer", "worker", "judge"]) }).parse(await req.json());
  await auth.api.signOut({ headers: await headers() }).catch(() => {});                       // revoke current session row
  await auth.api.signInEmail({ body: { email: SEEDED[role], password: env.DEMO_SEED_PASSWORD }, headers: await headers() }); // nextCookies() sets the cookie
  return Response.json({ ok: true, role });
}
```
Every later request carries a normal Better Auth session for the seeded user, so `getActor()` and every guard behave exactly as for a real login. The button is rendered by a server component only when `DEMO_MODE === "true"` (never `NEXT_PUBLIC_`). `scripts/seed.ts` creates the three accounts through `auth.api.signUpEmail` (so password hashes and hooks are the real ones), is idempotent, **refuses to run unless `DEMO_MODE=true`**, and takes `DEMO_SEED_PASSWORD` and `SEED_WORKER_PAYPAL_EMAIL` from env. Residual risk (accepted, see Security): while `DEMO_MODE=true` anyone who finds the URL can become any seeded role; non-demo deploys set `DEMO_MODE=false`.

### Pattern 5: R2 presign module [VERIFIED by generating URLs]
```ts
// src/server/storage/r2.ts
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
export const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,   // EU/FedRAMP buckets need their own endpoint
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
  requestChecksumCalculation: "WHEN_REQUIRED",    // without this the PUT URL carries x-amz-checksum-crc32=AAAAAA== and uploads break
  responseChecksumValidation: "WHEN_REQUIRED",    // without this the GET URL carries x-amz-checksum-mode=ENABLED
});
export const presignPut = (key: string, contentType: string, size: number) =>
  getSignedUrl(s3, new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: key, ContentType: contentType, ContentLength: size }),
    { expiresIn: 600, signableHeaders: new Set(["content-type", "content-length"]) });   // SignedHeaders=content-length;content-type;host
export const presignGet = (key: string) =>
  getSignedUrl(s3, new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }), { expiresIn: 300 });
```
Observed `SignedHeaders`: default presign signs only `host` (plus `content-length` when `ContentLength` is set); `content-type` is signed only when passed in `signableHeaders`. Signing both makes the browser's PUT enforce the declared type and exact size (R2 has no POST-policy size limit). The browser must send exactly `Content-Type: <declared>`; `fetch(url, { method: "PUT", body: file, headers: { "Content-Type": file.type } })` sets `Content-Length` itself. Key is **server-generated** (`spikes/{userId}/{uuid}`), never client-supplied.

**CORS (paste in Cloudflare dashboard -> R2 -> bucket -> Settings -> CORS Policy -> JSON):**
```json
[{ "AllowedOrigins": ["https://<service>.onrender.com", "http://localhost:3000"],
   "AllowedMethods": ["PUT", "GET", "HEAD"], "AllowedHeaders": ["Content-Type"],
   "ExposeHeaders": ["ETag"], "MaxAgeSeconds": 3600 }]
```
[CITED: developers.cloudflare.com/r2/buckets/cors]. Wildcard origin only allows one `*`; ports are not wildcardable. Keep the r2.dev public URL **disabled** (default) and attach no custom domain; presigned URLs do not work on custom domains anyway. [CITED: R2 public-buckets + presigned-urls docs]

### Pattern 6: PayPal webhook receiver (Phase 1 stub of the Phase 2 inbox)
```ts
// src/app/api/webhooks/paypal/route.ts
export const runtime = "nodejs";
export async function POST(req: Request) {
  const raw = await req.text();                                   // BEFORE any JSON.parse
  if (raw.length > 262_144) return new Response(null, { status: 413 });
  const h = req.headers;
  const verified = await verifyWebhook({                           // src/server/payments/paypal-rest.ts
    authAlgo: h.get("paypal-auth-algo"), certUrl: h.get("paypal-cert-url"), transmissionId: h.get("paypal-transmission-id"),
    transmissionSig: h.get("paypal-transmission-sig"), transmissionTime: h.get("paypal-transmission-time"), raw });
  const evt = safeParse(raw);                                      // for the id/type only
  // INSERT ... ON CONFLICT (paypal_event_id) DO NOTHING; unverified rows store verified=false and body truncated to 16 KB
  await recordDelivery({ id: evt?.id ?? `unverified:${h.get("paypal-transmission-id")}`, type: evt?.event_type, verified, raw: verified ? raw : raw.slice(0, 16_384) });
  return verified ? new Response(null, { status: 200 }) : new Response(null, { status: 401 });
}
// verifyWebhook builds the postback body by EMBEDDING the raw text, so the event is sent exactly as received:
// `{"auth_algo":${J(authAlgo)},"cert_url":${J(certUrl)},"transmission_id":${J(id)},"transmission_sig":${J(sig)},"transmission_time":${J(time)},"webhook_id":${J(env.PAYPAL_WEBHOOK_ID)},"webhook_event":${raw}}`
// POST {base}/v1/notifications/verify-webhook-signature with Bearer token -> require verification_status === "SUCCESS"
```
Facts: postback fields are `auth_algo, cert_url, transmission_id, transmission_sig, transmission_time, webhook_id, webhook_event` and the event "must be sent back exactly as received" [CITED: developer.paypal.com/api/rest/webhooks/rest]; the headers are `paypal-transmission-id/-time/-sig` and `paypal-cert-url` (the `paypal-auth-algo` header also exists in practice) [CITED + ASSUMED for the auth-algo header name]; simulator events use the webhook id string `WEBHOOK_ID`, belong to no app, and **cannot be verified by the postback endpoint** [CITED]. Phase 1 therefore proves "received" two ways: the simulator delivery appears as a `verified=false` row / 401 in the Render log, and a **real** sandbox event (any authorization from the PayPal spike fires `CHECKOUT.ORDER.APPROVED` / `PAYMENT.AUTHORIZATION.CREATED`) appears as `verified=true`. Replaying a real event with `POST /v1/notifications/webhooks-events/{event_id}/resend` tests the dedupe row. [CITED: Webhooks Management API operation list]

**Registration (unattended):** `scripts/paypal-register-webhook.ts` calls `GET /v1/notifications/webhooks`, creates `POST /v1/notifications/webhooks` with `{ url: "https://<host>/api/webhooks/paypal", event_types: [{name:"*"}] }` if the URL is missing (Phase 1 subscribes to all events; Phase 2 narrows to the list in STACK.md), prints the returned `id`; the owner sets it as `PAYPAL_WEBHOOK_ID` on the web service in the Render dashboard (it only exists after the URL does, so it is a `sync: false` variable filled after the first deploy), then redeploys. Simulated delivery for success criterion 1: `POST /v1/notifications/simulate-event` (exists; request fields not read, so the script should try `{ url, event_type }` first and fall back to the dashboard "Webhooks simulator" page). [CITED: operation list; request shape ASSUMED]

### Pattern 7: Worker bootstrap with pg-boss 12 [API verified from the package README; run on Render in the plan]
```ts
// worker/index.ts   (run: tsx worker/index.ts)
import { PgBoss } from "pg-boss";
import { db } from "@/server/db/client";
import { workerHeartbeats } from "@/server/db/schema";
const boss = new PgBoss({ connectionString: process.env.DATABASE_URL!, max: 3 });
boss.on("error", (e) => console.error("pg-boss", e));
await boss.start();                                   // creates/migrates the pgboss schema in the same database
await boss.createQueue("heartbeat");                  // v12: queues must exist before send/work/schedule
await boss.schedule("heartbeat", "* * * * *");        // one execution across instances
await boss.work("heartbeat", async ([job]) => { await db.insert(workerHeartbeats).values({ jobId: job.id }); });
const stop = async () => { await boss.stop({ graceful: true }); process.exit(0); };   // Render sends SIGTERM, SIGKILL after 30 s
process.on("SIGTERM", stop); process.on("SIGINT", stop);
```
Render background workers have **no health check** [CITED], so liveness = the heartbeat row; `/api/health` reports `workerLastSeenSeconds` and the smoke test fails if it is older than ~150 s.

### Pattern 8: `render.yaml` [plan IDs from the Blueprint spec; validate with `render blueprints validate`]
```yaml
databases:
  - name: pwd-db
    plan: 0.1c-256mb            # $6/mo, 100 connections [CITED: render.com/pricing.md]; bump to 0.5c-1g ($19) if slow
    postgresMajorVersion: "18"
    region: oregon
    # ipAllowList: []           # default 0.0.0.0/0 for the EXTERNAL url; set [] once local psql is no longer needed
services:
  - type: web
    name: pwd-web
    runtime: node
    plan: 0.5c-512mb            # $7/mo (the old "Starter")
    region: oregon              # MUST match the database region for the internal URL
    buildCommand: npm ci && npm run build
    preDeployCommand: npm run db:migrate && npm run seed     # paid plans only; failure keeps the old version running
    startCommand: npm run start
    healthCheckPath: /api/health                              # 2xx/3xx within 5 s, else unhealthy
    autoDeployTrigger: commit
    envVars:
      - { key: NODE_VERSION, value: "24" }
      - { key: DATABASE_URL, fromDatabase: { name: pwd-db, property: connectionString } }
      - { key: BETTER_AUTH_SECRET, generateValue: true }
      - { key: DEMO_MODE, value: "true" }                     # the hackathon deploy IS the demo; any other deploy sets "false"
      - { key: DEMO_SEED_PASSWORD, sync: false }
      - { key: SEED_WORKER_PAYPAL_EMAIL, sync: false }
      - { key: PAYPAL_CLIENT_ID, sync: false }
      - { key: PAYPAL_CLIENT_SECRET, sync: false }
      - { key: PAYPAL_WEBHOOK_ID, sync: false }
      - { key: R2_ACCOUNT_ID, sync: false }
      - { key: R2_ACCESS_KEY_ID, sync: false }
      - { key: R2_SECRET_ACCESS_KEY, sync: false }
      - { key: R2_BUCKET, sync: false }
      - { key: DIAG_TOKEN, sync: false }
  - type: worker
    name: pwd-worker
    runtime: node
    plan: 0.5c-512mb
    region: oregon
    buildCommand: npm ci
    startCommand: npm run worker                              # "tsx --env-file-if-exists=.env.local worker/index.ts"
    envVars:
      - { key: NODE_VERSION, value: "24" }
      - { key: DATABASE_URL, fromDatabase: { name: pwd-db, property: connectionString } }
```
Notes: `envVarGroups` cannot use `sync: false` or reference services [CITED], so secrets are declared per service. `sync: false` values are prompted only at initial Blueprint creation; later additions are dashboard edits. `BETTER_AUTH_URL` is not needed because Render injects `RENDER_EXTERNAL_URL` for web services [CITED]. Estimated cost ~ $20/month (web $7 + worker $7 + DB $6) on a Hobby workspace ($0 plus compute) [CITED: pricing.md]. `NODE_ENV=production` exists only at runtime on Render, which is what enables Better Auth rate limiting [CITED]. Render's default Node for services created after 2026-10-21 is 24.22.1 [CITED]; `NODE_VERSION=24` plus `.node-version` keeps web, worker and the laptop (24.16) aligned.

### Pattern 9: SSE route that streams through Next 16 unbuffered [VERIFIED locally with `next start` + `curl --compressed`]
Chunks arrived 1 s apart with no `Content-Encoding` even when gzip was requested. Headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no`. Write `retry: 3000`, then `: ping` comments every 15 s (use 1 s in the local test) and real events with `id:`; clear the interval on `req.signal` abort and on `cancel()`; guard `controller.enqueue` with try/catch. For the Render spike add a second mode that `LISTEN spike` on a dedicated `pg.Client` and relays worker `pg_notify('spike', ...)` messages, which validates the Phase 3 design (worker -> Postgres -> web -> browser). On deploys Render keeps the old instance for up to 30 s after SIGTERM (`maxShutdownDelaySeconds` up to 300) [CITED], so streams end at each deploy; the client must rely on `EventSource` auto-reconnect and `Last-Event-ID`.

### Pattern 10: Bit-vector helpers for the hash spike [VERIFIED]
```ts
// src/lib/phash.ts
export const hammingBits = (a: string, b: string) => { let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++; return d; };
export const bitsToSignedBytes = (bits: string) =>            // 64-char "0101..." -> 8 signed bytes, e.g. [93,-80,-48,19,-124,-90,-12,-104]
  Array.from({ length: bits.length / 8 }, (_, i) => { const b = parseInt(bits.slice(i * 8, i * 8 + 8), 2); return b > 127 ? b - 256 : b; });
```
Elastic: mapping `{ type: "dense_vector", dims: 64, element_type: "bit" }` (dims must be a multiple of 8; `l2_norm` is the only similarity and means Hamming; default index option is hnsw, `flat` is also allowed); documents take a byte array or hex string, **`knn` queries take a byte array**; score = (64 - hamming) / 64, so Hamming <= 10 means score >= 0.84375. On Serverless, `dense_vector` fields are not returned in `_source` by default, so never rely on reading the vector back; Postgres stays the source of truth. [CITED: elastic.co dense-vector reference]

### Anti-Patterns to Avoid
- **Keeping the scaffold's `cacheComponents: true`.** Build fails on `export const runtime/dynamic`; and it forces a Suspense/"use cache" model on a per-user app. [VERIFIED]
- **Letting the default AWS SDK checksum behaviour sign presigned PUTs.** [VERIFIED]
- **A `/api/demo/*` route that checks the flag only in the UI.** The route itself must 404 unless `DEMO_MODE === "true"`.
- **Parsing the PayPal webhook body before verifying** and re-stringifying it for the postback.
- **Calling the webhook simulator the "signature test".** It cannot verify; use real sandbox events.
- **Treating the unverified-webhook path as an error that returns 500.** Return 401; PayPal retries non-2xx up to 25 times over 3 days. [CITED]
- **Putting secrets in `NEXT_PUBLIC_*`, in `render.yaml` values, or in committed evidence files.**
- **Leaving diagnostic routes open.** Every `/api/spikes/*` route requires a session and, for `diag`, `DIAG_TOKEN`; remove or disable them when Phase 4 replaces them.

## Walking Skeleton (recommended thinnest end-to-end slice for SKELETON.md)

1. **Scaffold + CI-grade basics:** Pattern 1 scaffold; strict env parsing in `src/server/env.ts` (zod); `npm run typecheck | lint | test | build` scripts; Vitest config.
2. **One real DB read/write:** `/signup` form (name, email, password, role radio, PayPal email shown when role = worker) -> Better Auth inserts the `user` + `account` rows.
3. **One real UI interaction with a role dashboard:** `/dashboard` is a server component: `getActor()` -> reads the user's own row and counts of users per role from Postgres -> renders a role-specific card (customer / worker shows their PayPal email / judge) plus a "Ping my role's endpoint" button that calls `/api/<role>/ping` (200) and a "Ping another role" button (403 shown in the UI, which is success criterion 2's refusal).
4. **Worker in the loop:** pg-boss heartbeat -> `worker_heartbeats` row -> dashboard footer "worker last seen Ns ago" (proves web, worker and DB share `src/server`).
5. **Deployed:** `render.yaml` -> Blueprint on paid plans -> `/api/health` green -> `DEMO_MODE` switcher visible in the header -> webhook URL registered.
Spike pages (`/spikes/camera`, `/spikes/sse`) hang off the same app but are separate plans.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Password hashing, sessions, cookies, CSRF origin check | Own login/session code | Better Auth 1.7.14 | scrypt hashes, HttpOnly cookies, origin checks, rate limiting built in |
| Role escalation protection | Ad-hoc checks in each route | `hooks.before` allowlist + `databaseHooks.user.update` block + `assertRole` wrapper | Verified behaviour; one place to audit |
| Impersonation for the demo | Better Auth `admin` plugin or a cookie-forging helper | Real `signInEmail` as a seeded user | Session is genuine, no new privilege concept |
| Presigned URLs | Hand-signed SigV4 | `@aws-sdk/s3-request-presigner` with the two checksum options | Signing edge cases |
| Webhook signature verification | Own CRC32/cert-chain code | PayPal `verify-webhook-signature` postback | Documented, one call; self-verification is optional |
| Queue + cron in the worker | `setInterval` or `node-cron` | pg-boss `schedule` | Survives restarts, one execution across instances |
| Migrations | Hand-run SQL | `drizzle-kit generate` + `migrate`, `--custom` for extensions/triggers | Repeatable in `preDeployCommand` |
| EXIF parsing | Byte-level parser | `exifr` on the stored original (server-side) | Handles JPEG/HEIC/TIFF; never rewrites bytes |
| 64-bit perceptual hash | Own DCT | `sharp-phash` (returns the 64-char bit string) | Verified; ~40 lines if it must be vendored |
| Schema-valid LLM JSON | Regex on model output | `zodOutputFormat` (Claude) / `responseJsonSchema` (Gemini) + Zod re-validation | Both vendors drop range constraints (see Pitfalls) |
| Component library | Hand-made form widgets | shadcn (`init -d -y`) | Cheap, accessible; plain screens are enough in Phase 1 |

**Key insight:** every Phase 1 deliverable is either configuration of a vendor product or evidence about one. The only custom logic worth writing is the 30-line `authorize()` helper, the webhook receiver and the spike scripts.

## Runtime State Inventory

Not applicable: greenfield phase (no rename, refactor or migration). Nothing is stored, registered or deployed yet. The only pre-existing external state is the GitHub remote `origin = github.com/changfazhi/GigNPay.git` with `gh` authenticated as `changfazhi` [VERIFIED: `git remote -v`, `gh auth status`].

## Common Pitfalls

### Pitfall 1: Scaffold defaults contradict the project stack
**What goes wrong:** `next build` fails with "Route segment config "dynamic"/"runtime" is not compatible with `nextConfig.cacheComponents`".
**Why:** `create-next-app@16.4.3` writes `cacheComponents: true` and `partialPrefetching: true`.
**Avoid:** delete both lines immediately after scaffolding; add a unit/CI check that `next.config.ts` does not contain `cacheComponents`. **Warning sign:** build error on the first route handler.

### Pitfall 2: `create-next-app` rejects the repo directory name
**Avoid:** Pattern 1 (scaffold elsewhere, copy in, remove the nested `.git`, keep `.planning/`, `.claude/`).

### Pitfall 3: Presigned PUT works in a script but fails from the browser
**Why:** default SDK checksum params (`x-amz-checksum-crc32=AAAAAA==`) in the URL, mismatched `Content-Type`, or missing bucket CORS. **Avoid:** Pattern 5 options; unit-test the generated URL contains neither `x-amz-checksum` nor `x-amz-sdk-checksum-algorithm`; the browser must send the exact declared `Content-Type`. **Warning signs:** 403 `SignatureDoesNotMatch`, or a CORS error with no status in the console.

### Pitfall 4: Anthropic and Gemini schema helpers drop numeric ranges
**Why:** `zodOutputFormat` turned `z.number().int().min(0).max(10)` into `{"type":"integer","description":"{minimum: 0, maximum: 10}"}` (range moved into prose) [VERIFIED]; Gemini ignores `minLength/maxLength/uniqueItems` etc. [CITED]. **Avoid:** always re-validate parsed output with the full Zod schema and treat failure as an outage for that vendor. `z.number().int()` also emits huge safe-integer bounds; prefer `z.int().min(0).max(10)` or accept the noise.

### Pitfall 5: Claude 5.5 API constraints
`claude-opus-5-5` / `claude-sonnet-5-5`: `temperature`/`top_p`/`top_k` return 400; forced `tool_choice` returns 400; `thinking: {type: "disabled"}` returns 400 (omit `thinking`, set `output_config.effort`; Opus 5.5 defaults to `medium`); refusals are HTTP 200 with `stop_reason: "refusal"`. [CITED: claude-api skill, cached 2026-10-06] The skill's default advice is to add server-side `fallbacks` for Opus 5.5; **the project forbids it for the judge** (a silent model swap would falsify the verdict log). Record the decision in S-LLM; the spike calls without `fallbacks` and logs `stop_reason`/`stop_details`.

### Pitfall 6: Gemini docs now lead with a different API surface
Google's structured-output page shows `client.interactions.create({ response_format: {type:'text', mime_type:'application/json', schema} })`; the project pins `generateContent` + `responseJsonSchema`. Both exist in `@google/genai@2.31.0` [VERIFIED: typings]. The spike should try `generateContent` first and note if it errors. The only stable flash ids on the models page are `gemini-3.8-flash` and `gemini-3.6-flash`; `gemini-4-argon` is the stable flagship; `gemini-2.0-flash` and `gemini-3-pro-preview` are shut down [CITED: ai.google.dev/gemini-api/docs/models]. Call `ai.models.list()` and write the id that actually answers.

### Pitfall 7: PayPal reauthorization cannot be explored in one sitting
Honor period is 3 days; the first legal reauth is at day 4 (schema text: "from 4 to 29 days after the 3-day honor period"); inside the period it returns 422 "Re-authorization is not allowed within the three-day honor period" (`REAUTHORIZATION_TOO_SOON`). Start the aged orders first. A failed attempt may or may not consume the single reauth, so run the too-soon probe on a **different** authorization than the aged ones.

### Pitfall 8: Webhook ID chicken-and-egg and simulator confusion
`PAYPAL_WEBHOOK_ID` exists only after the public URL is registered, so the first deploy cannot have it; the verifier must fail closed (401) when it is unset. Simulator events fail postback verification by design.

### Pitfall 9: Render specifics
- Env groups cannot hold `sync: false` secrets; `sync: false` is prompted only at Blueprint creation.
- Web and DB must share a region for the internal URL; internal TLS is optional (self-signed, `verify-*` unsupported); external URL needs `sslmode=require` and accepts any IP by default.
- Worker has no health checks; use the heartbeat.
- `preDeployCommand` runs on a separate instance; seed and migrate must be idempotent; a failure keeps the previous deploy running.
- `RENDER_EXTERNAL_URL` is empty for non-web services.

### Pitfall 10: Free-trial clocks expire before Phase 7
Elastic Cloud and Zapier trials are 14 days. If the owner starts them during Phase 1 spikes, they may lapse before Phase 7 (sponsor integrations). Either start them as late in Phase 1 as the spike allows, ask whether the hackathon provides sponsor credits (Open Question 2), or plan to re-create the project/Zap in Phase 7.

### Pitfall 11: Spike evidence leaks secrets
Capture scripts must redact `Authorization`, client secrets, API keys, Zapier hook URLs (bearer secrets) and PayPal access tokens before writing evidence; commit only redacted JSON.

### Pitfall 12: Diagnostic endpoints are an attack surface
`/api/spikes/presign` mints write access to a bucket. Require a session, restrict keys to `spikes/{userId}/{uuid}`, allowlist MIME types (`image/jpeg`, `image/heic`, `image/heif`, `image/png`, `video/mp4`, `video/quicktime`, `video/webm`), cap size (e.g. 100 MB), and delete the objects at end of phase.

## Code Examples

### Drizzle config and scripts
```ts
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";
export default defineConfig({ dialect: "postgresql", schema: "./src/server/db/schema", out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL! } });
```
```jsonc
// package.json scripts
"dev": "next dev", "build": "next build", "start": "next start",
"worker": "tsx --env-file-if-exists=.env.local worker/index.ts",
"db:generate": "drizzle-kit generate", "db:migrate": "drizzle-kit migrate",
"seed": "tsx --env-file-if-exists=.env.local scripts/seed.ts",
"typecheck": "tsc --noEmit", "lint": "eslint .",
"test": "vitest run --project unit", "test:smoke": "vitest run --project smoke", "test:all": "vitest run"
```
First custom migration (`npx drizzle-kit generate --custom --name=extensions`): `CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS cube; CREATE EXTENSION IF NOT EXISTS earthdistance;`. Running it on the Render database is itself a spike check (extension availability is MEDIUM-confidence from docs). Also run `select bit_count(B'1010' # B'0011')` on Postgres 18 in the env smoke script.

### Vitest 5 config [VERIFIED: both projects ran]
```ts
// vitest.config.mts
import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: { projects: [
    { extends: true, test: { name: "unit", include: ["src/**/*.test.ts", "tests/docs/**/*.test.ts"] } },
    { extends: true, test: { name: "smoke", include: ["tests/smoke/**/*.test.ts"], testTimeout: 30_000 } },
  ] },
});
```

### Claude and Gemini structured scoring (same Zod schema) [shapes verified; calls need keys]
```ts
const Crit = z.object({ score: z.int().min(0).max(10), reason: z.string(), evidence_ref: z.int() });
export const Rubric = z.object({
  criteria: z.object({ checklist_met: Crit, visible_change: Crit, workmanship: Crit, working_proof: Crit, site_clean: Crit }),
  items: z.array(z.object({ item_id: z.string(), verdict: z.enum(["met", "unmet", "unclear"]), reason: z.string() })),
  instructional_text_in_media: z.boolean(), suspicious_text_quote: z.string().nullable(),
});
// Claude (images BEFORE text, each labelled "Image n: ..."); no temperature, no tool_choice, no fallbacks
const r = await anthropic.messages.parse({ model: process.env.CLAUDE_JUDGE_MODEL ?? "claude-opus-5-5", max_tokens: 16000,
  messages: [{ role: "user", content: [...imgs.map(toImageBlock), { type: "text", text: prompt }] }],
  output_config: { effort: "medium", format: zodOutputFormat(Rubric) } });
Rubric.parse(r.parsed_output);                 // re-validate: ranges were moved into prose
// Gemini
const g = await ai.models.generateContent({ model, contents: [{ role: "user", parts: [...imgs.map(toInlinePart), { text: prompt }] }],
  config: { responseMimeType: "application/json", responseJsonSchema: z.toJSONSchema(Rubric) } });
Rubric.parse(JSON.parse(g.text!));
```
(`toImageBlock` = `{type:"image",source:{type:"base64",media_type:"image/jpeg",data}}`; Gemini inline limit is 20 MB per request, so use resized JPEG derivatives.) Record: model id, `usage`, latency, `stop_reason`, raw text, parse success, per-criterion scores, and the vendor score gap against the 1.5 tolerance.

### PayPal sandbox calls for the spikes (raw `fetch`, base `https://api-m.sandbox.paypal.com` [ASSUMED standard host])
- Token: `POST /v1/oauth2/token` (Basic client id:secret, `grant_type=client_credentials`).
- Order: `POST /v2/checkout/orders` `{ intent: "AUTHORIZE", purchase_units: [{ amount: {currency_code:"USD", value:"20.00"}, custom_id, invoice_id }], payment_source: { paypal: { experience_context: { return_url, cancel_url, user_action: "PAY_NOW" } } } }`; take the link with `rel` `payer-action` (or `approve`). [link rel ASSUMED]
- Authorize: `POST /v2/checkout/orders/{id}/authorize`; read `purchase_units[0].payments.authorizations[0]` (`id`, `status`, `expiration_time` [VERIFIED present in schema]).
- Capture: `POST /v2/payments/authorizations/{id}/capture` `{ amount, final_capture, invoice_id }`; reauthorize `.../reauthorize` (`{ amount }` or empty body); void `.../void`; every mutating call with a deterministic `PayPal-Request-Id`; always log `PayPal-Debug-Id`.
- Payout: `POST /v1/payments/payouts` `{ sender_batch_header: { sender_batch_id, email_subject }, items: [{ recipient_type: "EMAIL", receiver, amount: {value, currency}, sender_item_id }] }`; duplicate `sender_batch_id` within 30 days is rejected; retry a 5xx with the same id [VERIFIED: Payouts schema].

## The Eight Spikes (plans, human steps, expected outcomes)

Each spike gets one section in `SPIKES.md`. Scripts live in `scripts/spikes/<name>/`, evidence in `.planning/phases/01-foundation-deploy-spikes/spike-evidence/<spike>/` (redacted JSON transcripts, screenshots, CSVs).

### S-PAY - PayPal reauthorize count/timing, partial capture then void, Payouts (needs: PayPal sandbox credentials; runs from the laptop, no deploy required)
**Least-manual route.** An order needs buyer approval and there is no documented API shortcut [no source found; search suggests browser automation is the only alternative, which is fragile]. So: `01-create-orders.ts` creates **five** AUTHORIZE orders at once and prints five approval links; the human opens them in **one** browser session logged in as one sandbox personal (buyer) account and clicks approve five times (about 3 minutes); `02-authorize-approved.ts` polls each order until `APPROVED` and **immediately** authorizes it (approved orders must be authorized soon after approval; exact window ASSUMED about 3 hours), writing `{orderId, authId, createdAt, expiration_time}` to `.spike-state/paypal.json` (gitignored; ids are not secrets but keep them out of git anyway).

| Order | Amount | Purpose |
|-------|--------|---------|
| A1 | $20 | **Aged authorization #1**: untouched until 72h+; later reauth probes (count test) |
| A2 | $20 | **Aged authorization #2**: kept for Phase 6 / the optional reauth beat; do not touch |
| B | $30 | Immediate reauth (too-soon) + replayed `PayPal-Request-Id`; then up to 5 non-final captures of $5 until the count limit appears; then void the remainder |
| C | $20 | One `final_capture=true` of $6; check the remainder is released; then try void and a second capture (expect `PREVIOUSLY_CAPTURED`/`AUTHORIZATION_ALREADY_CAPTURED`) |
| D | $20 | Full capture, then Payout of $19.00 (95%) to a sandbox personal **worker** account; plus one payout to a non-sandbox address to see `UNCLAIMED` |

**Hypotheses to confirm or kill (schema-backed unless noted):**
1. Immediate reauth -> 422, "Re-authorization is not allowed within the three-day honor period" (`REAUTHORIZATION_TOO_SOON`). Whether sandbox enforces this is unknown.
2. Replaying the same `PayPal-Request-Id` returns `200` with the existing resource (schema example) rather than `201`.
3. Non-final captures: the cap is "default overage"/count limited (`MAX_CAPTURE_COUNT_EXCEEDED` exists; the number is undocumented) - record the actual count; authorization status becomes `PARTIALLY_CAPTURED`; void after a non-final partial capture succeeds (PayPal material says so; schema is silent) and what status results.
4. `final_capture=true` ends further captures and releases the remainder (`AUTHORIZATION_ALREADY_CAPTURED`); void then fails (`PREVIOUSLY_CAPTURED`).
5. Capture comes back `COMPLETED` immediately or `PENDING` (pay only on `COMPLETED`); record `seller_receivable_breakdown.paypal_fee` and the payout item fee to size the "5% margin" drag.
6. Payout to a sandbox personal email -> item `SUCCESS`; to an unregistered email -> `UNCLAIMED`; webhook event names actually delivered. Payouts may need enabling on the sandbox app/business account (`AUTHORIZATION_ERROR` otherwise) - the human checks the app's feature list in the Developer Dashboard [feature toggle location ASSUMED].
7. **Aged (>=72h):** reauth A1 -> `201` with a **new** authorization id; reauth A1's original id again -> expected `REAUTHORIZATION_TOO_SOON` ("only once from Day 4 to Day 29"); reauth the new id -> expected `REAUTHORIZATION_NOT_SUPPORTED`; capture against the *original* id after reauth works (PayPal guide: capture may use original or latest); void of the new id -> `CANNOT_BE_VOIDED` (void the original parent). `07-aged-reauth.ts` is a resumable probe: first attempt at T+72h+5min, then hourly until the first success, logging every response; Claude can schedule it with `/schedule` or `/loop`.
**Deliverable if the phase ends before day 4:** SPIKES.md marks S-PAY-aged `PENDING (due <date>)` with the exact command, STATE.md gets a dated blocker, and the Phase 2 authorization-chain model proceeds on the schema-documented once-only rule (Phase 6 is the first consumer). The success criterion "reauthorize count and timing" is then met by: the schema/error catalogue evidence + the immediate-probe result + the dated pending item. **Ask the owner to accept this** (Open Question 1).

### S-CAM - iPhone and Android photo and video metadata (needs: deployed URL + R2 + two phones)
`/spikes/camera` (login required) offers four inputs: photo with `capture="environment"`, photo without `capture` (library/action sheet), video with `capture`, video without. Each: reads `navigator.geolocation` (`enableHighAccuracy`) and records the fix + accuracy, `POST /api/spikes/presign`, `PUT` the untouched `File`, `POST /api/spikes/analyze`. The server downloads the object from R2 and records: byte length, `sha256`, magic bytes (JPEG `FFD8` vs HEIC `ftyp heic/heix/mif1`), reported MIME, `exifr.parse(buf, {tiff:true, exif:true, gps:true})` fields (`DateTimeOriginal`, `OffsetTimeOriginal`, `GPSLatitude/Longitude`, `Make`, `Model`, `Orientation`, `Software`), `sharp(buf).metadata()` (can it decode?), and `sharp-phash`. For video: `ffprobe -show_format` tags (`creation_time`, `com.apple.quicktime.location.ISO6709`) via `ffprobe-static` or system ffprobe. Rows go to `spike_uploads`; the page shows a table.
**Matrix (fill every cell, with OS and browser versions):** {iPhone Safari, iPhone Chrome, Android Chrome} x {camera path, library path} x {photo, video} x {location services on, off}; iPhone also {High Efficiency, Most Compatible}. Human-held: someone takes about 20 captures; Claude reads the table from the DB and writes the truth table.
**Known priors (LOW):** iOS camera-path photos lose GPS (WebKit bugs 257534/263192; last evidence iOS 18.6.2) and iOS may deliver JPEG not HEIC; Android may also strip GPS from file-input images; neither is confirmed for current OS versions. Output required: which EXIF fields survive per cell, whether HEIC ever arrives, whether `sharp` can decode what arrives, the geolocation accuracy distribution, and a recommended integrity-gate truth table (pass / fail / unverifiable). This same page satisfies success criterion 4 (photo and video from a phone uploaded to R2, viewed via a signed URL).

### S-ES - Elastic bit-vector `dense_vector` kNN with Hamming similarity (needs: Elastic Cloud trial, API key)
Create an Elastic Cloud trial (14 days; one hosted deployment and up to three Serverless projects; card requirement not stated in docs) and an **Elasticsearch Serverless project** (fall back to the hosted deployment if bit vectors misbehave). Script: `new Client({ node: ELASTIC_URL, auth: { apiKey }, serverMode: "serverless" })`; create index `photo_hashes` with `phash: { type: "dense_vector", dims: 64, element_type: "bit" }` + `job_id`, `source`; index 20 hashes (10 from real JPEGs via `sharp-phash`, a few Hamming-1/5/10 variants of one hash, a duplicate); run the `knn` query with `bitsToSignedBytes`; assert score `== (64 - hamming)/64`; test a `bool` filter excluding one `job_id`; time the calls. Record whether Serverless accepts `element_type: bit` (docs mark `dense_vector` GA on Serverless but do not call out `bit`) and whether `_source` hides the vector. Fallback to document if it fails: four 16-bit `keyword` band tokens + Hamming in code, or the Postgres `bit_count(phash # $1) <= N` scan (works at demo scale; Postgres 14+). Run from the laptop; the Render egress is plain HTTPS. Changes: Phase 4 reuse query and Phase 7 mirror design.

### S-LLM - Claude and Gemini structured scoring on the same 4 JPEGs (needs: Anthropic key with billing, Gemini key)
Fixtures: 4 JPEGs under `scripts/spikes/llm/fixtures/` (2 before/after pairs; the owner may drop real phone photos there, otherwise Claude generates plausible placeholder renders and the spike is flagged "schema and timing only"). Steps: `ai.models.list()` and write the exact Gemini id that answers (prefer `gemini-3.8-flash`); run Claude (`claude-opus-5-5`, `output_config.effort: "medium"`) and Gemini in parallel with `Promise.allSettled`, 3 runs each; log schema validity, latency, token usage, cost, `stop_reason`, per-criterion scores and the gap vs 1.5. Include one fixture with a visible instruction-like sign if available (precursor to AI-08). Record the decision on `fallbacks` (not used). The spike ends with the measured pass rate of the Phase 5 thresholds on these images only as an indicator, not a calibration.

### S-ZAP - Zapier Catch Hook access (needs: Zapier account; the human creates the Zap)
Zapier help says Webhooks by Zapier is available on Professional/Team/Enterprise and not on Free [CITED: help.zapier.com article 8496288690317]; another source claims Free works; a 14-day trial of premium apps is claimed. Human: create a Zap with trigger *Webhooks by Zapier -> Catch Hook* and an *Email by Zapier* (or Gmail) action, copy the hook URL into `.env.local` as `ZAPIER_HOOK_URL` (treat as a secret). Script: POST `{event, jobId, to, subject, body, deepLink}` JSON, record status (expect 200; a turned-off Zap eventually 404s), response body, latency, whether the email arrives and how fast, behaviour on an array body (runs once per object), and payload limit (10 MB documented). Result: which plan/trial is needed, delay, whether Phase 7 keeps Zapier or swaps the sink.

### S-SSE - SSE on Render survives 60+ seconds with heartbeats (needs: deployed URL)
`GET /api/spikes/sse?mode=heartbeat|notify` (login or `DIAG_TOKEN`). `scripts/spikes/sse/probe.ts` connects from the laptop for 5 minutes and logs arrival gaps (flags >2x heartbeat interval), `Content-Encoding`, headers, and reconnect with `Last-Event-ID`; a second run from a phone browser page on cellular. `notify` mode: the worker `pg_notify('spike', ts)` every 10 s; the web process `LISTEN spike` on a dedicated client and relays. Then **redeploy during an open stream** and record the cut and reconnect time. Test with heartbeat 15 s; if the 60 s community-reported drop appears, shorten to 10 s and re-test. Local result already recorded: unbuffered through `next start`, gzip not applied [VERIFIED]. Changes: Phase 3 heartbeat interval, reconnect strategy and polling fallback timing.

### S-ENV - ffmpeg and Postgres extensions on the deployed boxes (cheap add-on)
Token-gated `/api/spikes/diag` (or `render ssh`) returns: `which ffmpeg`/`ffprobe` and `-version`, Node version, memory, `select version()`, result of `CREATE EXTENSION cube/earthdistance/pgcrypto`, `select bit_count(...)`, and Postgres `max_connections`. A community staff reply says ffmpeg is present on Render's native runtime [LOW]. If absent, record `ffmpeg-static` as the Phase 4 route.

## SPIKES.md format (single document)

Location: `.planning/phases/01-foundation-deploy-spikes/SPIKES.md` (+ `spike-evidence/<spike>/`). Top of file: a summary table (Spike | Status | Headline result | Design changes | Affects phases/reqs). One section per spike with exactly these headings so a doc-lint test can assert them:
1. `### Question` - what the design assumed.
2. `### Method` - script/page path, date, environment (local/Render, OS/browser versions, model ids), commands run.
3. `### What happened` - observed facts only (status codes, error codes, timings, field presence).
4. `### Evidence` - links to redacted files in `spike-evidence/`, PayPal debug ids, ids/screenshot names.
5. `### Design impact` - concrete changes to requirements, PROJECT.md Key Decisions or later phase plans (name the IDs), or "none - assumption holds".
6. `### Status` - one of `CONFIRMED`, `REFUTED`, `PARTIAL`, `PENDING (due YYYY-MM-DD)`, `BLOCKED (reason)`.
After the spikes: write the resulting decisions back into PROJECT.md Key Decisions (outcome column) in the same commit that closes the phase.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js / npm | Everything | yes | 24.16.0 / 11.13.0 | - (Render uses 24.x via `NODE_VERSION`) |
| git, `gh` (authenticated as changfazhi) | Push, Render GitHub link | yes | remote `origin` = github.com/changfazhi/GigNPay | - |
| Docker | Local Postgres for dev/integration | CLI yes, daemon **not running** (Colima socket missing) | 29.6.1 | `colima start` (human/permission), or develop against the Render DB external URL, or PGlite for unit tests |
| `psql` | Ad-hoc DB inspection | no | - | `render psql` (needs Render CLI) or `node -e` with `pg` |
| `ffmpeg` / `ffprobe` (local) | Video spike analysis | no | - | `ffprobe-static` / `ffmpeg-static` in the spike, or run on Render via diag |
| Render CLI | `blueprints validate`, `psql`, `ssh` | no | - | `brew install render` + `render login` (browser auth by the owner); otherwise validate by creating the Blueprint in the dashboard |
| `wrangler` | R2 CORS via CLI | no | - | Paste CORS JSON in the dashboard (recommended) |
| Render account / paid workspace, Cloudflare account + R2, PayPal developer account, Anthropic key, Gemini key, Elastic Cloud trial, Zapier account | Deploy and spikes | unknown - owner must supply | - | none; see Prerequisites |
| Two phones (iPhone + Android) | S-CAM | unknown | - | Test the one available; document the gap |

**Missing dependencies with no fallback:** vendor accounts/keys and phones (human). **With fallback:** local Postgres (use Render DB or PGlite), Render CLI, wrangler.

## External prerequisites the owner must create (for human-action checkpoints)

Order matters: items marked **EARLY** start clocks or unblock the longest track.

| # | Item | Needed by | Human steps | Claude can do unattended afterwards |
|---|------|-----------|-------------|-------------------------------------|
| P1 **EARLY** | PayPal developer account + sandbox: default business account, 2 sandbox **personal** accounts (buyer; worker payout receiver), a third personal for a second worker; REST app (sandbox) client id/secret; note Payouts toggle if present | S-PAY, webhook, Phase 2 | Create accounts in Developer Dashboard > Sandbox > Accounts; copy credentials; save sandbox emails/passwords | Write `.env.local` template, run all PayPal scripts, register webhook, simulate event |
| P2 **EARLY** | Approve 5 orders in a browser logged in as the sandbox buyer | S-PAY | Click links printed by `01-create-orders.ts` (about 3 min) | Authorize, run immediate-reauth/capture/void/payout tests |
| P3 | Render account with a card on file, workspace Hobby (compute paid per service); authorize the Render GitHub app for `changfazhi/GigNPay` | FND-01 | Dashboard: New > Blueprint > pick repo; fill `sync:false` prompts; (optional) `brew install render && render login` | Write/validate `render.yaml`, push, read deploy logs via CLI if logged in |
| P4 | Cloudflare account + R2 enabled (a payment method is likely required to subscribe; ASSUMED), private bucket, CORS JSON (above), R2 API token "Object Read & Write" scoped to that bucket (Access Key ID, Secret, Account ID); leave r2.dev public URL disabled | FND-02 | Dashboard steps; copy 3 values | Run `r2-roundtrip.ts` (PUT via presign, signed GET 200, unsigned GET refused, expired URL refused) |
| P5 | Anthropic API key with billing; Google AI Studio Gemini key (paid tier preferred) | S-LLM | Create keys | Run `llm` spike |
| P6 | Elastic Cloud trial (14-day clock), Serverless Elasticsearch project, endpoint URL + API key | S-ES | Sign up, create project/key | Run `elastic` spike |
| P7 | Zapier account (trial/paid), Zap with Catch Hook + Email action, hook URL | S-ZAP | Build the Zap in the UI (no API for this) | POST payloads, record results |
| P8 | iPhone (note iOS version) and Android phone (note version) with cellular or Wi-Fi, able to open the Render URL | S-CAM, S-SSE, FND-02 | Take the matrix of photos/videos; open the page | Read DB rows, write the truth table |
| P9 | `.env.local` filled by the owner (never printed or committed): PayPal, R2, LLM, Elastic, Zapier values, `DEMO_SEED_PASSWORD`, `DIAG_TOKEN`, `SEED_WORKER_PAYPAL_EMAIL` | all scripts | Paste values | Scripts read env; evidence is redacted |
| P10 | Decide: judge sign-up policy, and whether sponsor credits exist for Render/Elastic/Zapier | Plan | Answer Open Questions | - |

**Unattended-by-Claude work:** scaffold, schema, auth, hooks, seed, worker, receiver, render.yaml, scripts, unit/smoke tests, running every script once its keys exist, SPIKES.md, committing, `gh` push. **Needs a human at a keyboard:** accounts/cards/keys, Render Blueprint creation click-through and secret prompts, R2 CORS paste, PayPal approvals, Zap creation, Elastic project creation, phone testing, accepting the aged-reauth deferral.

## Validation Architecture

> `workflow.nyquist_validation` is not set to false in `.planning/config.json`, so this section is required.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.5 (Vite 8.3.5; Node `^22.12 \|\| ^24`) - unit and smoke as two `projects`; no Playwright in Phase 1 (justification: phone/PayPal-approval steps are manual anyway; HTTP-level smoke tests against the deployed URL cover sign-up, role refusal, health, webhook and storage at far lower cost) |
| Config file | `vitest.config.mts` (does not exist - Wave 0) |
| Quick run command | `npm run test` (= `vitest run --project unit`, no network, no DB, ~seconds) |
| Full suite command | `npm run typecheck && npm run lint && npm run test && npm run build` locally; deployed: `SMOKE_BASE_URL=https://<host> npm run test:smoke` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | Sign-up then sign-in returns a session; session cookie set | unit (Better Auth memory adapter, as verified) | `npx vitest run --project unit src/server/auth/auth.test.ts` | Wave 0 |
| AUTH-01 | Persisting across refresh on the deployed app | smoke (sign up via `/api/auth/sign-up/email`, reuse cookie on `/api/me`) | `npm run test:smoke -- auth.smoke` | Wave 0 |
| AUTH-02 | `assertRole` / `assertJobParty` table (every role x action, wrong party, null job worker) | unit | `npx vitest run --project unit src/server/auth/authorize.test.ts` | Wave 0 |
| AUTH-02 | Sign-up with `role: admin`/missing -> 400; `update-user` with `role` -> FORBIDDEN | unit | same `auth.test.ts` | Wave 0 |
| AUTH-02 | Customer cookie `POST /api/worker/ping` -> 403, unauthenticated -> 401 | smoke | `npm run test:smoke -- roles.smoke` | Wave 0 |
| AUTH-03 | Worker without PayPal email -> 400; with email stored on user row | unit | `auth.test.ts` | Wave 0 |
| AUTH-04 | Switch route returns 404 when `DEMO_MODE !== "true"` (unset, "false", "TRUE", "1"), 403 on bad Origin, rejects non-allowlisted role | unit (route handler called with `Request`) | `npx vitest run --project unit src/server/auth/demo.test.ts` | Wave 0 |
| AUTH-04 | After switch, `/api/me` returns the seeded role and role guards apply | smoke | `npm run test:smoke -- demo.smoke` | Wave 0 |
| AUTH-04 | One-click switch from the browser UI | **manual** (presenter click-through on laptop and phone) | - | n/a |
| FND-01 | `GET /api/health` 200 with `db: ok` and worker heartbeat younger than 150 s; HTTPS URL; `http://` redirects | smoke | `npm run test:smoke -- health.smoke` | Wave 0 |
| FND-01 | Paid plans and three services exist | **manual** (owner confirms in Render dashboard; screenshot into SPIKES.md or SUMMARY) | - | n/a |
| FND-01 | PayPal webhook received (simulate-event produces a `verified=false` row + 401; real event produces `verified=true`; resend is deduped) | script (credentials needed) | `npx tsx scripts/spikes/paypal/webhook-smoke.ts` | Wave 0 |
| FND-01 | `next.config.ts` has no `cacheComponents` | unit (reads file) | `src/config.test.ts` | Wave 0 |
| FND-02 | Presigned PUT URL has no `x-amz-checksum*` / `x-amz-sdk-checksum-algorithm`, `X-Amz-Expires <= 600`, signs `content-length` and `content-type`; GET expiry 300 | unit | `npx vitest run --project unit src/server/storage/r2.test.ts` | Wave 0 |
| FND-02 | PUT via presign succeeds; signed GET 200; **unsigned GET refused (non-2xx)**; expired GET refused; wrong Content-Type PUT refused | script (R2 credentials) | `npx tsx scripts/spikes/r2/roundtrip.ts` | Wave 0 |
| FND-02 | Photo and short video from a real phone upload and display | **manual** (phone) | - | n/a |
| FND-03 | `SPIKES.md` contains the eight spike sections, each with the six headings and a legal Status value | unit (doc lint) | `npx vitest run --project unit tests/docs/spikes.test.ts` | Wave 0 |
| FND-03 | Each spike's evidence | script / manual per spike (see spike sections) | `npx tsx scripts/spikes/<name>/...` | Wave 0 |
| Helpers | `hammingBits`, `bitsToSignedBytes` (pairs with the verified sample output), webhook postback body builder embeds raw text verbatim | unit | `npx vitest run --project unit src/lib/phash.test.ts src/server/payments/paypal-rest.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test` (unit only).
- **Per wave merge:** `npm run typecheck && npm run lint && npm run test && npm run build`.
- **After each deploy:** `SMOKE_BASE_URL=... npm run test:smoke`.
- **Phase gate:** full local suite green, smoke green on the live URL, `SPIKES.md` doc-lint green, manual checklist signed (dashboard plans, phone upload, switcher click-through, PayPal approvals) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `vitest.config.mts`, `package.json` scripts, `tsconfig` paths already from scaffold
- [ ] `src/server/auth/{auth,authorize,demo}.test.ts`, `src/server/storage/r2.test.ts`, `src/lib/phash.test.ts`, `src/server/payments/paypal-rest.test.ts`, `src/config.test.ts`, `tests/docs/spikes.test.ts`
- [ ] `tests/smoke/{health,auth,roles,demo}.smoke.test.ts` reading `SMOKE_BASE_URL` (skip, not fail, when unset)
- [ ] Env fixtures: unit tests must not require a database (use the Better Auth memory adapter with `{ user: [], session: [], account: [], verification: [] }`) or real secrets
- [ ] Framework install: `npm i -D vitest@5.0.5`

## Security Domain

> `security_enforcement` is on (ASVS L1, block on high).

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Better Auth email/password (scrypt), min 8 / max 128 chars, built-in rate limit (on only when `NODE_ENV=production`; set explicit `rateLimit` for `/sign-in/*` and `/sign-up/*` to something stricter, e.g. 5 per 60 s) |
| V3 Session Management | yes | HttpOnly Secure cookie (HTTPS baseURL), 7-day default session; no `cookieCache`; sign-out revokes the row |
| V4 Access Control | yes | `assertRole` + `assertJobParty` in every handler; `proxy.ts` is optimistic only; role immutable after sign-up |
| V5 Input Validation | yes | zod on every route body; MIME allowlist and size cap on presign; PayPal email regex; key names server-generated |
| V6 Cryptography | yes | No hand-rolled crypto; `BETTER_AUTH_SECRET` via `generateValue` (256-bit); presigned URLs SigV4 |
| V7 Error Handling / Logging | yes | No secrets/tokens in logs or evidence; log `PayPal-Debug-Id`, event ids, not bodies |
| V8 Data Protection | yes | Private bucket, 5-minute GET URLs, no PII in object keys, delete spike objects at end |
| V9 Communications | yes | Render HTTPS only; DB internal URL; R2 over HTTPS |
| V10 Malicious Code / supply chain | yes | Exact pins, lockfile, legitimacy audit above, `ffmpeg-static` install script flagged |
| V12 Files and Resources | yes | Content-Type and Content-Length signed into the PUT; allowlist; sha256 recorded; no server-side execution of uploads |
| V13 API / Web Service | yes | Webhook signature verified via PayPal postback on raw body; unverified never acts; event-id dedupe |
| V14 Configuration | yes | Secrets only in Render env (`sync:false`) and local `.env.local` (gitignored); `DEMO_MODE` default off in code |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Role escalation via sign-up body (`role: admin`) or `update-user` | Elevation | `hooks.before` allowlist + `databaseHooks.user.update` role block (both verified) |
| Anyone self-registers as `judge` | Elevation | Optional `JUDGE_SIGNUP_CODE`; or open only while `DEMO_MODE=true`; decision in Open Questions |
| `DEMO_MODE` switcher abuse (anyone becomes any seeded role; login CSRF forcing a victim into another account) | Spoofing / Elevation | Route 404 unless `DEMO_MODE === "true"` (strict, default off, server-read only), same-origin `Origin` check, fixed allowlist of three emails, password only in env, seed script refuses without the flag, non-demo deploys set `false`; accepted risk while the demo URL is public (add optional `DEMO_SWITCH_KEY` cookie if the owner wants a gate) |
| R2 bucket exposure (public r2.dev, wildcard CORS, leaked token) | Information disclosure | Bucket private, r2.dev disabled, no custom domain, CORS limited to the Render origin (+ localhost), token scoped to one bucket with Object R/W, unsigned and expired URL refusal tested, short expiry |
| Presign endpoint abused for free storage / path traversal | Tampering / DoS | Auth required, server-generated keys under `spikes/{userId}/`, MIME + size caps, signed `content-length`, cleanup |
| Secrets in Render env or repo | Information disclosure | `sync:false`, `generateValue`, `.gitignore` for `.env*` and `.spike-state/`, GitHub push protection, redact evidence, rotate sandbox keys if leaked |
| Webhook spoofing / replay | Spoofing / Repudiation | Postback verification with `PAYPAL_WEBHOOK_ID`, fail closed when unset, dedupe on event id, size cap 256 KB, store unverified bodies truncated (bounded DB growth), never act on unverified |
| Diagnostic routes left open | Information disclosure | Session + `DIAG_TOKEN`; disable after the phase |
| SSE endpoint holds unbounded connections | DoS | Auth, per-user connection cap, abort handling |
| Dependency compromise (install scripts) | Tampering | Exact pins, audit table, avoid `ffmpeg-static` until needed |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `middleware.ts` | `proxy.ts` with `export function proxy` (Node runtime) | Next 16 | Optimistic redirect only; do real checks in handlers |
| Segment config with Cache Components | `cacheComponents` incompatible with `runtime`/`dynamic` exports | Next 16.x scaffold default | Remove it from `next.config.ts` |
| AWS SDK without default checksums | `WHEN_SUPPORTED` default adds CRC32 params to presigned PUT | AWS SDK v3 (2025) | Set `WHEN_REQUIRED` for R2 |
| Render plan names Starter/Standard | Plan IDs `0.5c-512mb`, `1c-2g`, Postgres `0.1c-256mb` | 2026 docs | Use the new IDs in `render.yaml` |
| Better Auth drizzle adapter inside core | Separate package `@better-auth/drizzle-adapter`, re-exported at `better-auth/adapters/drizzle` | 1.7.x | Import from `better-auth/adapters/drizzle`; no extra install needed |
| Gemini `generateContent` docs | Docs lead with `interactions` API | late 2026 | Keep `generateContent`; verify it works in S-LLM |
| `temperature` on Claude | removed (400) on every model since 2026-10-21 | Oct 2026 | Do not send sampling params |

**Deprecated/outdated:** `next lint`; `fluent-ffmpeg`; Prisma 8 RC; `typescript@7`; the `admin`-plugin impersonation for demo switching.

## Corrections to earlier research (for PROJECT.md / roadmap upkeep)
| Earlier statement | This session found | Action |
|-------------------|--------------------|--------|
| STACK: "Do NOT enable `cacheComponents`" (no mention of the scaffold) | The 16.4.3 scaffold enables it and breaks `runtime`/`dynamic` exports | Phase 1 scaffolding task must remove it |
| STACK: install `shadcn` init | Works non-interactively with `-d -y`; adds `cn`, `@base-ui/react`, `lucide-react`, `class-variance-authority`, `tw-animate-css`; `cn` is flagged | Audit table above |
| STACK/ARCH: Render plans "Starter" | Plan IDs are `0.5c-512mb` (web/worker, $7) and `0.1c-256mb` (DB, $6) | Use the IDs; ~$20/month total |
| PITFALLS: reauth count uncertain | PayPal error catalogue: `REAUTHORIZATION_TOO_SOON` says "only once from Day 4 to Day 29"; `REAUTHORIZATION_NOT_SUPPORTED` blocks reauth of a reauth; `CANNOT_BE_VOIDED` says void the original parent | Strong support for the once-only design; the authorization chain must store `original_auth_id` for voids |
| PITFALLS: EXIF stripped on iOS | Android may also strip GPS from file-input photos | S-CAM tests both; no design change |
| ARCH: `PAYPAL_ALLOW_UNSIGNED` dev path | Not needed in Phase 1; unverified deliveries are stored with `verified=false` and answered 401 | Skip the bypass entirely |
| Roadmap criterion 1 "test webhook received" | Simulator events cannot verify | Prove receipt via the stored unverified row, and verification via a real event |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Cloudflare R2 subscription needs a payment method | Prerequisites P4 | Owner may not need a card; low impact |
| A2 | A "Payouts" feature toggle exists on the sandbox REST app | S-PAY | If enablement differs, the first payout 403s; human inspects the dashboard |
| A3 | Order approval link has `rel` `payer-action` (or `approve`) with the `experience_context` request shape | PayPal calls | Script must adapt; low |
| A4 | An approved order must be authorized within roughly 3 hours | S-PAY | If shorter, approve and authorize one at a time |
| A5 | `POST /v1/notifications/simulate-event` accepts `{ url, event_type }` | Pattern 6 | Fall back to the dashboard simulator (a human click) |
| A6 | `api-m.sandbox.paypal.com` is the sandbox REST host (docs examples showed `api.sandbox.paypal.com` for one call) | PayPal calls | Either host works historically; script reads base from env |
| A7 | Sandbox personal accounts hold enough default balance for $20-$30 authorizations | S-PAY | Duplicate account with a higher balance (dashboard allows editing the balance) |
| A8 | Unsigned R2 object URL returns 4xx (probably 403/400); docs do not state it | FND-02 | Test records the actual status; criterion only needs "refused" |
| A9 | ffmpeg exists on Render's native Node runtime | S-ENV | Use `ffmpeg-static` in Phase 4 (LOW source: a community reply) |
| A10 | Render Postgres allows `CREATE EXTENSION cube, earthdistance, pgcrypto` | Code Examples | Phase 3 job-board query needs a haversine fallback |
| A11 | Android Chrome camera path may strip GPS | S-CAM | None; the spike measures it |
| A12 | `paypal-auth-algo` is delivered as a header | Pattern 6 | If missing, verifier reads `auth_algo` from the spec value `SHA256withRSA` |
| A13 | Elastic Serverless accepts `element_type: bit` | S-ES | Use hosted deployment or the band-token / Postgres fallback |
| A14 | Zapier Free vs paid access to Catch Hook (sources conflict) | S-ZAP | Trial or paid plan needed; may affect Phase 7 budget |
| A15 | Owner accepts "judge" self-signup behind a code or demo flag | Open Questions | If the owner wants fully open judge signup, drop the code |
| A16 | Render keeps `node_modules` from build for the worker start command | Pattern 8 | Move `tsx` and `drizzle-kit` to `dependencies` (already recommended) |

## Open Questions

1. **Is a dated "pending" acceptable for the aged-reauth half of the PayPal spike?**
   - Known: reauth is legal only from day 4; the Phase 1 build may finish in fewer than 4 days; the only consumer is Phase 6 (PAY-09), and Phase 2's chain model already follows the schema's once-only rule.
   - Unclear: whether the owner wants Phase 1 held open until day 4, or closed with a dated follow-up.
   - Recommendation: start the aged orders in the first hour of execution; if day 4 has not arrived at phase end, close Phase 1 with S-PAY-aged `PENDING (due <date>)` and a STATE.md blocker that gates Phase 6, not Phase 2.
2. **Do Render, Elastic, Zapier or Anthropic/Google offer hackathon credits or sponsor codes?** Trials are 14 days; Phase 7 may land after they lapse. Recommendation: ask the owner; otherwise defer account creation for Elastic and Zapier to the latest point in Phase 1 and plan to recreate in Phase 7 if needed.
3. **Judge sign-up policy.** Open sign-up lets any visitor judge disputes. Recommendation: allow `judge` at sign-up only when `DEMO_MODE=true` or an optional `JUDGE_SIGNUP_CODE` matches; the seeded judge covers the demo either way.
4. **Seed data for webhook proof.** Which sandbox personal email is the seeded worker's PayPal email? Needed as `SEED_WORKER_PAYPAL_EMAIL`; use a real sandbox personal account so Phase 2 payouts reach it.
5. **Will one person have both an iPhone and an Android phone?** If not, S-CAM records the gap and the Phase 4 gate stays three-state with real-device calibration deferred.

## Sources

### Primary (HIGH confidence; run or read this session)
- npm registry `npm view` for all versions/peers/engines (2026-10-27); local installs of better-auth 1.7.14, drizzle-orm 0.45.4, drizzle-kit 0.31.11, pg-boss 12.38.0, `@aws-sdk/*` 3.1157.0, sharp 0.35.5, sharp-phash 2.2.0, exifr 7.1.3, `@elastic/elasticsearch` 9.5.1, `@google/genai` 2.31.0, `@anthropic-ai/sdk` 1.3.0, vitest 5.0.5, tsx 4.23.15, `@paypal/paypal-server-sdk` 2.5.0 in a scratch project.
- Scratch builds: `create-next-app@16.4.3` output, `next build` with/without `cacheComponents`, SSE route under `next start`, `shadcn@4.22.1 init -d -y`, `npx auth@latest generate`, Better Auth memory-adapter role tests, presigned URL generation both checksum modes, `zodOutputFormat` conversion.
- PayPal Payments v2 `schema.json` (reauthorize text, `x-errors` catalogue, authorization/capture status enums, `expiration_time`) and Payouts v1 `schema.json` (fetched 2026-10-27).
- Claude API skill (bundled, cached 2026-10-06): model ids, constraints, `messages.parse` + `zodOutputFormat`.

### Secondary (MEDIUM confidence; official docs read)
- better-auth.com docs: concepts/database, typescript additional fields, hooks, admin plugin, integrations/next, email-password, adapters/drizzle.
- render.com docs: blueprint-spec, health-checks, deploys, node-version, environment-variables, postgresql-creating-connecting, cli, pricing.md.
- developers.cloudflare.com/r2: presigned-urls, examples/aws-sdk-js-v3, buckets/cors, buckets/public-buckets, api/tokens, platform/limits (5 GiB single PUT), pricing.
- elastic.co docs: dense_vector reference; Elastic Cloud trial page (14 days, hosted + three Serverless projects).
- developer.paypal.com: webhooks (retry 25 over 3 days), webhooks REST guide (postback fields, simulator), Webhooks Management API operations, authorization guide.
- ai.google.dev: models page (stable ids), structured output, image understanding (20 MB inline).
- help.zapier.com: Trigger Zaps from webhooks.

### Tertiary (LOW confidence; needs validation by the spikes)
- WebKit bugs 257534/263192 and Apple forum threads; addpipe iOS 18.6.2 video test; unsourced Android GPS-stripping blog posts.
- Render community threads on SSE (conflicting) and ffmpeg on native runtime.
- Search summaries on PayPal sandbox approval automation, Payouts enablement, Zapier plan tiers.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - every version and import verified by installing or `npm view` this session.
- Architecture: MEDIUM-HIGH - Better Auth hooks, R2 presign, SSE and scaffold behaviour executed locally; Render deploy, pg-boss on Render and PayPal verify-postback not yet run.
- Pitfalls: MEDIUM-HIGH - the four headline findings reproduced locally or read from PayPal's schema; platform behaviours (Render SSE, phone EXIF, sandbox honor period) are explicitly spike items.
- Spike plans: MEDIUM - procedures are sound; PayPal request shapes for orders/simulate-event and the Payouts enablement toggle are assumptions flagged above.

**Research date:** 2026-10-27
**Valid until:** 2026-11-03 (7 days; the stack and Anthropic/Google model tables are moving quickly, and PayPal/Render doc layouts have changed within weeks)
