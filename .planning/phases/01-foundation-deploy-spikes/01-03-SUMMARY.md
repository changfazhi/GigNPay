---
phase: 01-foundation-deploy-spikes
plan: 03
subsystem: testing
tags: [vitest, zod, env, redaction, evidence, smoke-tests]
requires: [01-02]
provides:
  - Vitest 5 unit and smoke projects (npm run test, npm run test:smoke)
  - src/server/env.ts single env module (EnvSchema, getEnv, requireEnv, isDemoMode, appOrigin)
  - scripts/lib/local-env.ts (mainRoot, repoTop, loadLocalEnv, spikeStateDir, evidenceDir)
  - scripts/lib/redact.ts (SECRET_ENV_KEYS, redact, assertNoSecrets, writeEvidence)
  - scripts/lib/check-evidence.ts CLI evidence secret gate
  - tests/smoke helpers and the failing skeleton and health smoke tests
affects: [01-04, 01-05, 01-06, 01-07, 01-08, 01-09, 01-10]
tech-stack:
  added: []
  patterns: [env keys reported by name only, redact-then-assert evidence writer, describeSmoke skips without a base URL]
key-files:
  created:
    - vitest.config.mts
    - src/config.test.ts
    - src/server/env.ts
    - src/server/env.test.ts
    - scripts/lib/local-env.ts
    - scripts/lib/redact.ts
    - scripts/lib/redact.test.ts
    - scripts/lib/check-evidence.ts
    - tests/smoke/helpers.ts
    - tests/smoke/skeleton.smoke.test.ts
    - tests/smoke/health.smoke.test.ts
  modified: []
key-decisions:
  - "Empty env strings count as unset in EnvSchema, so a blank .env.example line never fails format checks"
  - "redact keeps numeric/boolean/null values under sensitive keys so usage counters such as input_tokens survive in evidence"
  - "Signed-URL redaction keeps only query parameter names: base?X-Amz-Algorithm&X-Amz-Credential&..."
  - "/api/me contract fixed by the skeleton test: top-level { id, email, name, role, paypalEmail } (matches plan 01-09)"
requirements-completed: [FND-01, AUTH-01]
duration: ~10min
completed: 2026-10-27
status: complete
---

# Phase 1 Plan 03: Test harness, env module and evidence helpers Summary

Vitest unit and smoke projects, a config test pinning the scaffold, one zod env module, a redacting evidence writer with a secret gate CLI, and a failing end-to-end skeleton smoke test that fixes the routes plans 01-08, 01-09 and 01-10 must deliver.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 | Vitest projects, config test and the env module | 14b8856 |
| 2 | Evidence helpers (local-env, redact, check-evidence) | e595634 |
| 3 | Smoke helpers and the failing skeleton and health smoke tests | 725bd0f |

TDD order was followed: config test failed on the missing env module before `env.ts` existed, `redact.test.ts` failed on the missing module before `redact.ts` existed, and the skeleton smoke test fails against a dead URL.

## Verification

- `npm run test`: 3 files, 20 tests pass. `npm run typecheck` and `npm run lint` exit 0.
- `npm run test:smoke`: 2 files, 7 tests skipped (no base URL known; no `.env.local` in MAIN_ROOT yet).
- `SMOKE_BASE_URL=http://127.0.0.1:9 npx vitest run --project smoke tests/smoke/skeleton.smoke.test.ts`: 4 failed (`fetch failed`, RED as intended).
- `check-evidence`: prints `no secrets in <path>` and exits 0 on a clean directory; with a file containing the value of `DIAG_TOKEN` it prints the file name only and exits 1.
- `grep -rlE "from ['\"]next/" src/server` prints nothing; `grep -c 'export const EnvSchema' src/server/env.ts` is 1; all four skeleton case titles are present verbatim.

## Deviations from Plan

**1. [Rule 2 - Missing critical functionality] Added `src/server/env.test.ts`**
- **Issue:** Threat T-01-03-02 (env errors must not leak values) is a mitigate disposition but the plan listed no test for it.
- **Fix:** Added 4 tests: `getEnv` error names keys not values, `requireEnv` message, `isDemoMode` exactness, `appOrigin` precedence.
- **Commit:** 14b8856

**2. [Rule 1 - Bug] Numeric values under sensitive keys are not redacted**
- **Issue:** The key regex `token` would blank Anthropic/Gemini `input_tokens` / `output_tokens` usage counters that the S-LLM evidence must record.
- **Fix:** `redact` only redacts string/object values under sensitive keys; numbers, booleans and null are kept (covered by a test).
- **Commit:** e595634

**3. [Type fix] `describeSmoke` is not annotated `typeof describe`** because Vitest 5's `SuiteAPI` type rejects the `describe | describe.skip` union assignment; inferred type is used. Commit 725bd0f.

The plan's one-line verify command for Task 2 uses `mktemp` and `!` in a single compound command; it was run as separate equivalent commands (clean directory exits 0, planted secret exits 1).

## Known Stubs

None.

## Threat Flags

None. Smoke tests create `@smoke.example.com` worker accounts on whichever base URL is configured (T-01-03-03, accepted in the plan).

## Notes for later plans

- `MAIN_ROOT/.env.local` does not exist yet, so `loadLocalEnv()` returns `[]` and `baseUrl()` is null until `SMOKE_BASE_URL` or `APP_BASE_URL` is set.
- The health smoke test requires an https base URL by design; running it against a local http URL fails the https cases.
- `.env.example` and `EnvSchema` are kept in lockstep by `src/config.test.ts`: adding a key to one without the other fails the unit project.

## Self-Check: PASSED

All 11 created files exist; commits 14b8856, e595634 and 725bd0f are in `git log`.
