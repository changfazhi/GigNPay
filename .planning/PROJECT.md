# Pay-When-Done Marketplace

## What This Is

A marketplace for physical gig jobs (starting with aircon servicing in the US) where the customer's payment is **held** by PayPal when the job is booked, AI checks photo and video proof that the work was done well, and the worker is paid automatically. When the AI isn't sure, the customer decides. When they disagree, a human judge does. Built for the PayPal + AI Hackathon 2026.

Full source blueprint: `.planning/BLUEPRINT.md` (copy of the owner's Google Doc "AI PayPal Hackathon", rev 1, 2026-10-23).

## Core Value

Money only moves when the work is proven: a PayPal authorization holds the customer's funds at booking, and it is captured and paid out only after AI-verified (or human-approved) proof — the AI can approve payment but can never take it away.

## Business Context

- **Customer**: US homeowners/renters booking aircon servicing; independent aircon technicians doing the work
- **Revenue model**: 5% platform fee on each captured job (worker receives 95%)
- **Success metric**: Hackathon judging — the demo video shows the three moments (happy path, fraud catch, dispute) working end to end on real PayPal sandbox calls
- **Strategy notes**: Blueprint section 10 "Hackathon fit" in `.planning/BLUEPRINT.md`

## Requirements

### Validated

(None yet — ship to validate)

### Active

**Ground rules (apply to every feature)**
- [ ] Held, not taken: booking places a PayPal authorization; money moves only on capture, after proof
- [ ] AI can only say yes: AI may auto-release when highly confident; it never refunds or penalises — every "no" goes to a person
- [ ] Two models must agree: Anthropic (Claude) and Google (Gemini) score the same pinned evidence in parallel; disagreement or outage routes to the customer
- [ ] The checklist is the contract: per-task checklist agreed before work starts, stored as structured items, loaded from the DB at verification time
- [ ] Nothing stalls: every waiting state has a timer (open-job expiry, day-3 reauth, review window, dispute SLA)

**Customer**
- [ ] Chat job request: photo/video of the problem, caption, map pin; intake agent asks follow-ups until job fields are complete
- [ ] AI-drafted per-task checklist (spec agent) and AI-suggested price range; customer edits and approves checklist and sets price before paying
- [ ] PayPal checkout via JS SDK button approving an AUTHORIZE order; UI says "held, not charged"
- [ ] Live job tracker (status, worker en route, check-in, evidence as it arrives) over WebSocket/live updates
- [ ] Review panel: before/after side by side, AI checklist verdicts, fraud flags; approve or reject
- [ ] Pay now / approve anyway manual override (skip AI, or pay after AI rejection)
- [ ] Cancel open job before anyone accepts (voids the hold)

**Worker**
- [ ] Job board: browse/filter open jobs by distance, trade, pay
- [ ] Atomic accept: succeeds only if the job is open and the hold is valid
- [ ] On-site check-in: device location must be inside the 300 m job geofence
- [ ] Required before-photo capture at check-in; in-app camera, original file uploaded with EXIF intact
- [ ] Checklist runner: one after-photo per checklist item plus a short working-proof video
- [ ] Payout setup: worker's PayPal email collected at sign-up
- [ ] Earnings screen (held, released, paid, per-job split) read from the ledger

**Judge**
- [ ] Dispute queue with SLA countdown
- [ ] AI case summary (request, checklist, evidence pairs, AI scores, fraud flags, both statements, timeline)
- [ ] Evidence viewer (before/after pairs, video, EXIF time/place, pHash matches)
- [ ] Resolution builder: release, split by %, refund, or send back for rework
- [ ] Agreement step: both parties accept, or the judge's ruling stands when the window closes
- [ ] Append-only verdict log of every AI and human decision with pinned inputs

**Platform core**
- [ ] Job API with role auth on every decision (only customer approves, only assigned worker submits, only judge resolves)
- [ ] Job state machine as the only code allowed to change status; every transition records timestamp + actor
- [ ] Minute sweeper: open-job expiry (48 h), reauthorize at day 3, 2 h customer review window, dispute SLA
- [ ] Admin "advance clock" control to demo timer-driven transitions (day-3 reauth, review window)
- [ ] Evidence ingest: store originals, read EXIF before any resize, extract video keyframes, compute pHash
- [ ] Payment service as the only PayPal caller; idempotency key per job transition
- [ ] Webhook receiver: verify PayPal signatures, dedupe events, confirm holds/captures/payouts
- [ ] Ledger: one row per money event (hold, reauth, capture, void, payout, refund)
- [ ] Notifications: live status hub plus Zapier-driven email/push at each step needing action

**AI verification pipeline**
- [ ] Stage 0 pin inputs: engine takes only a job id, loads checklist + evidence from DB, locks job as Verifying, caps at 3 attempts
- [ ] Stage 1 completeness: before/after per required item, video if required, keyframes extracted
- [ ] Stage 2 integrity gate: pHash after-vs-before (edited before), pHash vs all past photos (reuse), stock/web image check, EXIF time in job window, EXIF + device GPS within 300 m
- [ ] Stage 3 checklist check: vision agent marks each item met/unmet with reason and photo used
- [ ] Stage 4 rubric: Claude and Gemini score 5 criteria (checklist met, visible change, workmanship, working proof, site clean) 0–10 in parallel on the same pinned prompt
- [ ] Stage 5 route: numeric comparison with 1.5-point tolerance; auto-release (gate clean, all items met, both avg ≥ 8, no criterion < 6) / ask customer (below bar, disagreement, outage) / flag and ask (gate failed, items unmet, avg < 6)

**Money flow (PayPal sandbox)**
- [ ] Book: Orders v2 create (intent AUTHORIZE) → authorize → held
- [ ] Cancel/expire open job: void authorization
- [ ] Day 3 still open: reauthorize
- [ ] Release (AI, customer, or judge): capture full → Payouts 95% to worker, 5% fee retained
- [ ] Judge split X%: capture X% final → payout; rest released
- [ ] Customer silent past 2 h review window: capture 30% (not final) as kill fee → payout; rest goes to judge
- [ ] Judge refund: void (or refund after a kill fee was captured)
- [ ] Capture denied webhook: retry once, then notify and flag job
- [ ] Payout failed/unclaimed webhook: ledger keeps amount owed, worker prompted to fix email

**Auth & demo**
- [ ] Real auth (email/password or magic link) with seeded customer, worker and judge accounts plus a demo role switcher so one person can run the full video

**Sponsor integrations**
- [ ] Deploy on Render (app, worker/sweeper, Postgres) so PayPal webhooks reach a public URL
- [ ] Elastic: pHash index for reuse detection and searchable verdict log
- [ ] Zapier: customer/worker notifications at each step

### Out of Scope

- Ratings and worker reputation/profile — stretch in blueprint; cut for the 1–2 week solo timeline unless time remains
- Postman published collection — not selected among sponsor tools
- Multiple trades / handyman jobs — one trade (aircon) keeps verification uniform and the pitch specific
- Non-US markets / non-USD currency — single market for the demo
- Milestone holds for jobs longer than 29 days — jobs must complete within one authorization's 29-day life
- PayPal multiparty/marketplace (payee) payments — Payouts from platform balance in sandbox; production would need compliant marketplace setup
- Community judges — platform admins act as judges for the demo
- Production money (live PayPal) — sandbox only for the hackathon
- AI-initiated refunds or penalties — violates the "AI can only say yes" ground rule
- Crypto/on-chain escrow — reference repos used it; this project runs on real PayPal payments

## Context

- Hackathon entry: PayPal + AI Hackathon 2026. Five equally weighted criteria: fit + required APIs, technological implementation, design, potential impact, innovation (plus presentation video).
- Design is the biggest judging risk: three role apps with many modules. Priority is polishing customer and worker flows; judge console kept to one screen.
- Innovation framing: held payments exist (Upwork, Airtasker); the new part is AI verifying physical work and releasing payment itself — "AI-verified proof of work, AI can only approve".
- Demo video plan: (1) happy path — book, hold in sandbox dashboard, proof, AI auto-release, capture + payout; (2) fraud catch — reused photo flagged, routed to customer; (3) dispute — customer rejects, AI brief, judge splits, partial capture in sandbox.
- Blueprint synthesizes five reference projects: GigSmartPay (checklist, before/after photos, pHash/EXIF fraud), Arbiq (5-criteria rubric, manual override, cancel), Mappers (parallel multi-model, pinned inputs), Colony (job states, 30% kill fee), Sharetribe (marketplace process, preauth/capture — Stripe-based, adapted to PayPal). Section 07 of the blueprint lists each repo's failure and how this design fixes it.
- Known PayPal nuance to verify in research: an authorization has a 3-day honor period and 29-day validity, and can be reauthorized only once (after the honor period). The rework path ("reauthorized if needed") cannot renew a second time — may need a fresh order or the 29-day cap.
- Blueprint build order puts the sweeper (day-3 reauth, review window) and judge console in stretch Phase 4, but the demo video's dispute moment and the "advance clock" demo need them — the roadmap should pull the demo-critical parts forward.
- Blueprint diagram images (lifecycle, money flow) could not be read via the Drive connector; the tables in the doc carry the same information.

## Constraints

- **Tech stack**: Next.js full-stack TypeScript (PWA + API route handlers), Postgres, object storage with signed URLs, separate worker process for the minute sweeper — one codebase, solo builder
- **AI providers**: Anthropic (Claude) + Google (Gemini) as the two independent model vendors — so one outage can't decide a payment; Gemini also handles video natively
- **Payments**: PayPal sandbox only — Orders v2 (AUTHORIZE → capture), Authorizations (capture/reauthorize/void), Payouts, Captures/refunds, Webhooks
- **Timeline**: Solo build, ~1–2 weeks — blueprint phases 1–3 are must-haves; phase 4 trimmed to what the demo video needs
- **Market**: Aircon servicing, United States, USD
- **Hosting**: Render, deployed early so PayPal webhooks reach a public URL
- **Security**: Verification engine accepts only a job id and reads all inputs from the DB; role auth enforced server-side on every decision; PayPal webhook signatures verified
- **Job length**: Jobs must complete within 29 days (one authorization lifetime)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Next.js full-stack TypeScript for app + API | Fastest single-codebase path for a solo hackathon build and one Render deploy | — Pending |
| Anthropic + Google as the dual-model judge | Two independent vendors; Gemini handles video natively for working-proof clips | — Pending |
| Aircon servicing, US, USD | Very visual before/after and a clear working-proof video; biggest PayPal market | — Pending |
| Customer sets price from AI-suggested range; hold placed at posting | Blueprint section 09 default | — Pending |
| Strict auto-release thresholds (avg ≥ 8, no criterion < 6, models within 1.5) | Start strict, loosen with demo data | — Pending |
| Silent customer past 2 h window → 30% kill fee captured, rest to judge | Colony-style; protects workers without auto-releasing unreviewed work | — Pending |
| PayPal Payouts from platform balance (95/5 split) | Simplest working sandbox path; marketplace payee setup is production-only | — Pending |
| Jobs capped at 29 days | One authorization lifetime; milestone holds later | — Pending |
| Platform admins act as judges | Simplest for demo | — Pending |
| Real auth + seeded accounts + demo role switcher | Keeps role auth real while one person runs the whole demo video | — Pending |
| Sponsor tools: Render, Elastic, Zapier (not Postman) | Render needed for webhooks anyway; Elastic for pHash index + verdict search; Zapier for notifications | — Pending |
| Ratings/reputation deferred | Stretch; not needed for the three demo moments | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-10-27 after initialization*
