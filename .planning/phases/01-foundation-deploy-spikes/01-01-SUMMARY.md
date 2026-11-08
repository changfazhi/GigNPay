---
phase: 01-foundation-deploy-spikes
plan: 01
subsystem: payments-spike
tags: [paypal, sandbox, authorization, reauthorize, spike]
requires: []
provides:
  - scripts/spikes/paypal/aged-orders.ts (help, create, authorize, probe-too-soon, status, probe-aged, self-check)
  - MAIN_ROOT/.spike-state/paypal.json (labels A1, A2, B, C, D; consumed by 01-14 and 01-19)
  - spike-evidence/s-pay-reauth/setup.json, too-soon.json
affects: [01-14, 01-19, 06]
tech-stack:
  added: []
  patterns: [standalone node-only spike CLI, deterministic PayPal-Request-Id per call, redacted evidence with self-check]
key-files:
  created:
    - scripts/spikes/paypal/aged-orders.ts
    - .planning/phases/01-foundation-deploy-spikes/spike-evidence/s-pay-reauth/setup.json
    - .planning/phases/01-foundation-deploy-spikes/spike-evidence/s-pay-reauth/too-soon.json
  modified: []
key-decisions:
  - "Env is loaded from .env.local, then .env (owner keeps keys in .env; changed 2026-11-08)"
  - "Git exclude step skipped: the scaffold .gitignore (01-02) already ignores .env* and .spike-state/"
duration: run over 2026-11-08..09 (owner approvals in between)
completed: 2026-11-09
---

# Plan 01-01 Summary: S-PAY aged orders and honor-period reauth probe

Five sandbox AUTHORIZE orders were created, approved by the sandbox buyer, and authorized. The reauthorization clock is running.

## Authorizations

| Label | Amount | Authorization id | Status | Expires |
|---|---|---|---|---|
| A1 | 20.00 | 6LP65089RF371532A | CREATED | 2026-12-07T15:59:47Z |
| A2 | 20.00 | 6VN45365R1323900C | CREATED | 2026-12-07T16:01:07Z |
| B | 30.00 | 3WH54856K9495361T | CREATED | 2026-12-07T16:01:09Z |
| C | 20.00 | 2UD848126B1461209 | CREATED | 2026-12-07T16:01:11Z |
| D | 20.00 | 0MS90256UD826993E | CREATED | 2026-12-07T16:01:13Z |

A2 is reserved for Phase 6 and is never touched by any probe.

## Findings

- **Reauthorize inside the honor period (B):** HTTP 422 `UNPROCESSABLE_ENTITY`, issue `REAUTHORIZATION_TOO_SOON`, PayPal-Debug-Id `ca575cb99bd8b`. The sandbox enforces the 3-day honor period.
- **Same PayPal-Request-Id replayed on that reauthorize:** HTTP 422 `REAUTHORIZATION_TOO_SOON` again (debug `ca575cb9e4d77`). A failed call is not cached under its request id; the replay is re-evaluated.
- **Replaying B's order authorize with the same PayPal-Request-Id:** HTTP 201 with the same authorization id (debug `ca575cb91a962`). Authorize is idempotent under the request id, so a retried authorize cannot create a second hold.
- Approval link rel was `payer-action` at `https://www.sandbox.paypal.com/checkoutnow?token=<orderId>` (assumption A3 held).
- Authorizations last 29 days (create 2026-11-08, expiry 2026-12-07), matching the documented hold period.

S-PAY-REAUTH aged probe due 2026-11-11T16:04:47.000Z; command: node scripts/spikes/paypal/aged-orders.ts probe-aged

## Deviations

- The script loads `.env.local` and then `.env`, because the owner keeps keys in `.env`.
- The shared `info/exclude` entries were not added: `.gitignore` from plan 01-02 already covers `.env*` and `.spike-state/` (verified with `git check-ignore`).
- Owner approvals took two rounds; the first approval attempt did not reach the return page.

## Verification

- `probe-aged` prints `not-due until 2026-11-11T16:04:47.000Z` without calling PayPal.
- `self-check` prints `self-check ok`; `git ls-files .env .env.local .spike-state` prints nothing.
