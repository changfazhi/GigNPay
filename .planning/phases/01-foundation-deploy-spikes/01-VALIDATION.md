---
phase: 1
slug: foundation-deploy-spikes
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-27
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `01-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.5 with two projects: `unit` (no network, no DB, no secrets) and `smoke` (HTTP against a deployed URL). No Playwright in Phase 1. |
| **Config file** | `vitest.config.mts` — none yet, Wave 0 installs |
| **Quick run command** | `npm run test` (= `vitest run --project unit`) |
| **Full suite command** | `npm run typecheck && npm run lint && npm run test && npm run build:check` (`build:check` = `next build` with placeholder DATABASE_URL/BETTER_AUTH_SECRET; Render runs `npm run build` with real env); after deploy: `npm run test:smoke` (base URL from `SMOKE_BASE_URL` or `APP_BASE_URL` in the main checkout's `.env.local`) |
| **Estimated runtime** | ~20 seconds (unit); build ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test`
- **After every plan wave:** Run `npm run typecheck && npm run lint && npm run test && npm run build:check`
- **After each deploy:** Run `SMOKE_BASE_URL=... npm run test:smoke`
- **Before `/gsd-verify-work`:** Full suite green, smoke green on the live URL, SPIKES.md doc-lint green, manual checklist signed
- **Max feedback latency:** 30 seconds (unit)

---

## Per-Task Verification Map

Requirement-level map from research; the planner assigns task IDs, and execution updates Status.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-02-T3 | 01-02 | 1 | AUTH-01 | — | Sign-up then sign-in returns a session cookie | unit | `npx vitest run --project unit src/server/auth/auth.test.ts` | ❌ W0 (created 01-02-T3) | ⬜ pending |
| 01-02-T2 → 01-06-T3 | 01-02 / 01-06 | 1 / 3 | AUTH-01 | — | Skeleton: sign up, /api/me twice with same cookie, dashboard, health on the deployed app | smoke | `npm run test:smoke -- skeleton.smoke` | ❌ W0 (created 01-02-T2) | ⬜ pending |
| 01-07-T1 → 01-07-T2 | 01-07 | 4 | AUTH-01 | — | Session persists across requests; sign-out → 401; sign-in again restores | smoke | `npm run test:smoke -- auth.smoke` | ❌ W0 (created 01-07-T1) | ⬜ pending |
| 01-02-T3 | 01-02 | 1 | AUTH-02 | T-01-02-01/02/03 (privilege escalation) | Sign-up with role admin/missing → 400; update-user changing role → FORBIDDEN; judge without DEMO_MODE or valid JUDGE_SIGNUP_CODE → 403 (D-02) | unit | `npx vitest run --project unit src/server/auth/auth.test.ts` | ❌ W0 (created 01-02-T3) | ⬜ pending |
| 01-07-T1 → 01-07-T2 | 01-07 | 4 | AUTH-02 | T-01-07-01/02 (broken access control) | `assertRole` / `assertJobParty` table: every role × action, wrong party | unit | `npx vitest run --project unit src/server/auth/authorize.test.ts` | ❌ W0 (created 01-07-T1) | ⬜ pending |
| 01-07-T2 | 01-07 | 4 | AUTH-02 | T-01-07-01 (broken access control) | Customer cookie on worker action → 403; unauthenticated → 401 | smoke | `npm run test:smoke -- roles.smoke` | ❌ W0 (created 01-07-T1) | ⬜ pending |
| 01-02-T3 | 01-02 | 1 | AUTH-03 | — | Worker without PayPal email → 400; with email stored | unit | `npx vitest run --project unit src/server/auth/auth.test.ts` | ❌ W0 (created 01-02-T3) | ⬜ pending |
| 01-08-T1 → 01-08-T2 | 01-08 | 5 | AUTH-04 | T-01-08-01/02/03 (demo switch abuse) | Switch route 404 unless `DEMO_MODE === "true"`; 403 on bad Origin; rejects non-allowlisted target | unit | `npx vitest run --project unit src/server/auth/demo.test.ts` | ❌ W0 (created 01-08-T1) | ⬜ pending |
| 01-08-T2 | 01-08 | 5 | AUTH-04 | T-01-08-06 | After switch, `/api/me` returns the seeded role, guards apply, old session revoked | smoke | `npm run test:smoke -- demo.smoke` | ❌ W0 (created 01-08-T1) | ⬜ pending |
| 01-02-T2 → 01-06-T3 | 01-02 / 01-06 | 1 / 3 | FND-01 | — | `/api/health` 200 with db ok and worker heartbeat < 150 s; HTTPS; http redirects | smoke | `npm run test:smoke -- health.smoke` | ❌ W0 (created 01-02-T2) | ⬜ pending |
| 01-06-T3 | 01-06 | 3 | FND-01 | T-01-06-05 | [BLOCKING] live DB lists all eight Phase 1 tables and the pgboss schema | script | `npx tsx scripts/db/check-schema.ts` | ❌ W0 (created 01-06-T1) | ⬜ pending |
| 01-09-T2 | 01-09 | 4 | FND-01 | T-01-09-01 (webhook spoofing) | Simulator event → unverified row; forged POST → 401 stored unverified; oversize → 413 | script | `npx tsx scripts/spikes/paypal/simulate.ts` | ❌ W0 (created 01-09-T2) | ⬜ pending |
| 01-10-T3 | 01-10 | 5 | FND-01 | T-01-09-03 (replay) | Real event → verified; resend deduped (one row, deliveries ≥ 2) | script | `npx tsx scripts/spikes/paypal/webhook-smoke.ts` | ❌ W0 (created 01-10-T3) | ⬜ pending |
| 01-02-T2 | 01-02 | 1 | FND-01 | — | `next.config.ts` has no cache-components flags; exact pins; gitignore covers secrets | unit | `npx vitest run --project unit src/config.test.ts` | ❌ W0 (created 01-02-T2) | ⬜ pending |
| 01-05-T2 | 01-05 | 2 | FND-02 | T-01-05-03 (storage exposure) | Presigned PUT has no checksum params, expiry ≤ 600 s, signs content-length/type; GET expiry 300 s | unit | `npx vitest run --project unit src/server/storage/r2.test.ts` | ❌ W0 (created 01-05-T2) | ⬜ pending |
| 01-05-T3 | 01-05 | 2 | FND-02 | T-01-05-01 (storage exposure) | Presigned PUT works; signed GET 200; unsigned GET refused; expired GET refused; wrong type refused | script | `npx tsx scripts/spikes/r2/roundtrip.ts` | ❌ W0 (created 01-05-T3) | ⬜ pending |
| 01-14-T2 | 01-14 | 9 | FND-03 | T-01-14-01 | SPIKES.md has the eight FND-03 sections (+ S-ENV), six headings each, legal Status values, trial expiries, no secrets | unit (doc lint) | `npx vitest run --project unit tests/docs/spikes.test.ts` | ❌ W0 (created 01-14-T2) | ⬜ pending |
| 01-13-T2 / 01-09-T1 | 01-13 / 01-09 | 8 / 4 | FND-03 | T-01-09-02 | Helpers: `hammingBits`, `bitsToSignedBytes`; webhook postback body embeds raw text | unit | `npx vitest run --project unit src/lib/phash.test.ts src/server/payments/paypal-rest.test.ts` | ❌ W0 (created in those tasks) | ⬜ pending |
| every plan | all | — | all | — | Evidence and result files contain no secret values | script | `npx tsx scripts/lib/check-evidence.ts <id>` | ❌ W0 (created 01-02-T2) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `npm i -D vitest@5.0.5`; `vitest.config.mts` with `unit` and `smoke` projects; `package.json` scripts `test`, `test:smoke`, `typecheck`
- [ ] `src/server/auth/{auth,authorize,demo}.test.ts` (Better Auth memory adapter, no DB)
- [ ] `src/server/storage/r2.test.ts`, `src/lib/phash.test.ts`, `src/server/payments/paypal-rest.test.ts`, `src/config.test.ts`
- [ ] `tests/docs/spikes.test.ts`
- [ ] `tests/smoke/{health,auth,roles,demo}.smoke.test.ts` reading `SMOKE_BASE_URL` (skip, not fail, when unset)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Paid web + worker + Postgres services exist | FND-01 | Billing/plan state lives in the Render dashboard | Owner confirms in dashboard; screenshot referenced in SPIKES.md |
| Photo and short video from a real phone upload to R2 and display via signed URL | FND-02 | Needs physical iPhone and Android | Open `/spikes/camera` on each phone, run the capture matrix |
| One-click role switch from the browser | AUTH-04 | Presenter UX on laptop and phone | Click through customer → worker → judge, confirm role shown and guards apply |
| PayPal buyer approvals for spike orders | FND-03 | Sandbox buyer must approve in a browser | Open the five printed approval links logged in as the sandbox buyer |
| Zap creation, Elastic project creation | FND-03 | Vendor UIs, no API | Follow prerequisites table in 01-RESEARCH.md |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
