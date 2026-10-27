# Phase 1: Foundation, Deploy & Spikes - Context

**Gathered:** 2026-10-27
**Status:** Ready for planning
**Source:** Owner answers during /gsd-plan-phase 1 (no discuss-phase run). Project-wide decisions live in `.planning/PROJECT.md` Key Decisions.

<domain>
## Phase Boundary

Deliver a live app on a public Render HTTPS URL (paid web service, background worker, Postgres) with email/password accounts for three roles, a demo role switcher, private R2 photo/video storage reachable only through signed URLs, a PayPal webhook receiver, and written results for the eight vendor spikes in `SPIKES.md`. No job, payment, evidence or AI product features are built in this phase; spike scripts and diagnostic pages are throwaway-quality but their findings are binding.

</domain>

<decisions>
## Implementation Decisions

### Aged PayPal reauthorization spike
- D-01: Phase 1 may close with the aged-reauthorization half of S-PAY marked `PENDING (due <date>)` in SPIKES.md. The aged orders are created in the first hour of execution. The pending item gates only Phase 6 (where reauth is built), not Phase 2. Phase 2 proceeds on PayPal's documented once-only rule (day 4 to 29, reauth of a reauth not supported, void the original parent).

### Judge sign-up
- D-02: Judge sign-up is allowed only when `DEMO_MODE` is on, or when the sign-up request carries a secret `JUDGE_SIGNUP_CODE` that matches the server env value. Otherwise a judge role at sign-up is rejected. Customer and worker sign-up stay open. Admin is never selectable.

### Phone testing for S-CAM
- D-03: The owner has both an iPhone and an Android phone. The S-CAM matrix covers both; no cell may be left "untested" for lack of a device.

### Trial-clock accounts (Elastic, Zapier)
- D-04: Sponsor credits are unknown. Create the Elastic Cloud trial and the Zapier account as late in Phase 1 as possible (their spikes run last), and record each trial's expiry date in SPIKES.md and STATE.md so Phase 7 can renew or switch.

### UI
- D-05: No UI-SPEC for Phase 1 (owner chose to skip). Auth screens, role dashboards, the role switcher and spike diagnostic pages should be plain and clean (Tailwind + shadcn defaults), mobile-usable. Proper UI specs start in later phases.

### Claude's Discretion
- File layout, test layout, and spike script structure, within the patterns in 01-RESEARCH.md.
- Seed data contents beyond the three seeded accounts (customer, worker with sandbox PayPal email from env, judge).
- Exact rate-limit numbers, session length, and error copy.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

- `.planning/phases/01-foundation-deploy-spikes/01-RESEARCH.md` - verified stack, scaffold pitfalls (cacheComponents), R2 checksum fix, Better Auth role hooks, demo switch route, Render Blueprint facts, eight spike procedures, SPIKES.md format, prerequisites table, Validation Architecture, security domain
- `.planning/PROJECT.md` - Key Decisions (incl. research corrections)
- `.planning/REQUIREMENTS.md` - FND-01..03, AUTH-01..04
- `.planning/research/STACK.md`, `.planning/research/ARCHITECTURE.md`, `.planning/research/PITFALLS.md` - project-level stack and architecture

</canonical_refs>

<specifics>
## Specific Ideas

- Seeded worker's PayPal email comes from env (`SEED_WORKER_PAYPAL_EMAIL`), which must be a real sandbox personal account email the owner creates.
- Human-action steps (accounts, keys, Render Blueprint click-through, R2 CORS paste, PayPal buyer approvals, Zap creation, phone captures) are checkpoints; everything else runs unattended.

</specifics>

<deferred>
## Deferred Ideas

- UI design contracts: from Phase 2 onward via /gsd-ui-phase.
- Playwright end-to-end tests: not in Phase 1 (HTTP smoke tests instead).

</deferred>

---

*Phase: 01-foundation-deploy-spikes*
*Context gathered: 2026-10-27*
