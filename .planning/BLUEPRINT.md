# Pay-When-Done Marketplace — System Blueprint

> Copy of the owner's Google Doc "AI PayPal Hackathon" (PayPal + AI Hackathon 2026 · Sheet A-00 Master · Rev 1 draft · drawn 2026-10-23 · owner Chang).
> Source: https://docs.google.com/document/d/155FrfLXOqhX8tu5XvCt0QPwJGsvr0d7Wa12flxOJFyo
> Diagram images in the doc are not reproduced; the tables carry the same content.
> Decisions made at project init that override "open" items here are recorded in PROJECT.md (Key Decisions).

A marketplace for physical gig jobs where the customer's payment is held by PayPal when the job is booked, AI checks photo and video proof that the work was done well, and the worker is paid automatically. When the AI isn't sure, the customer decides. When they disagree, a human judge does.

Built from: plan doc + 10 reference diagrams (GigSmartPay, Arbiq, Mappers, Colony, Sharetribe). Payments: PayPal Orders v2 (authorize → capture) · Payouts.

Legend: [DOC] this plan · [GSP] GigSmartPay · [ARB] Arbiq · [MAP] Mappers · [COL] Colony · [STR] Sharetribe · [FIX] closes a gap in that repo · [NEW] added in this blueprint

## 01 Ground rules

- **Held, not taken** — Booking places a PayPal authorization on the customer's funds. Money only moves on capture, after proof.
- **AI can only say yes** — The AI may release payment when it is highly confident. It never refunds or penalises anyone. Every "no" goes to a person.
- **Two models must agree** — Two different AI providers score the same pinned evidence in parallel. Disagreement or an outage hands the job to the customer.
- **The checklist is the contract** — The per-task checklist is agreed before work starts, stored as structured items, and loaded from the database at verification time.
- **Nothing stalls** — Every waiting state has a timer: open jobs expire, holds are renewed at day 3, silent customers and slow disputes are swept.

## 02 System diagram

Items marked (stretch) are not MVP.

### L1 · People and apps — Next.js PWA · one app, three roles

**Customer (posts & pays)**
- Chat job request [DOC][GSP] — Photo or video of the problem, caption, map pin for location. The intake agent asks follow-up questions until the job fields are complete.
- Checklist review [GSP][FIX ARB] — Edit and approve the AI-drafted per-task checklist and price before paying.
- PayPal checkout [DOC][STR] — PayPal button approves an authorization. The UI says "held, not charged".
- Live job tracker [GSP][COL] — Status, worker en route, check-in, evidence as it arrives.
- Review panel [DOC] — Before/after side by side, AI checklist verdicts, fraud flags. Approve or reject.
- Pay now / approve anyway [ARB] — Manual override: skip the AI, or pay after an AI rejection.
- Cancel open job [ARB] — Before anyone accepts. Voids the hold.
- Rate worker [ARB] (stretch) — Stars plus a note after completion. Feeds worker profile.

**Worker (does & proves)**
- Job board [ARB][STR] — Browse and filter open jobs by distance, trade, pay.
- Accept job [COL][FIX COL] — Atomic: succeeds only if the job is open and the hold is valid.
- On-site check-in [GSP] — Device location must be inside the job geofence (300 m).
- Before capture [FIX GSP] — Required at check-in. Camera opens in-app, original file uploaded with EXIF intact.
- Checklist runner [GSP] — One after-photo per checklist item, plus a short video (e.g. aircon running).
- Payout setup [NEW] — Worker's PayPal email for Payouts, collected at sign-up.
- Earnings [STR] — Held, released, paid, with each job's split.
- Profile & reputation [ARB][COL] (stretch) — Completion rate, auto-release rate, ratings.

**Judge (resolves)**
- Dispute queue [FIX MAP] — Every escalation lands here with an SLA countdown. Mappers only logged escalations.
- AI case summary [DOC] — What was asked, what was delivered, which items failed, both sides' statements.
- Evidence viewer [GSP] — Before/after pairs, video, EXIF time and place, pHash matches.
- Resolution builder [NEW] — Release, split by %, refund, or send back for rework.
- Agreement step [DOC] — Customer and worker both accept the proposal, or the judge rules after the window.
- Verdict log [FIX MAP] — Every AI and human decision, inputs pinned, append-only.

↕ REST for actions · WebSocket for live job status

### L2 · Platform core — API + orchestrator

- Job API [FIX COL] — Role auth on every decision. Only the customer approves, only the assigned worker submits, only a judge resolves.
- Job state machine [COL][STR] — The only code allowed to change status. Each transition records a timestamp and actor (see 03).
- Timers & sweeper [COL][FIX STR] — Runs every minute: open-job expiry, reauthorize at day 3, customer review window, dispute SLA.
- Evidence ingest [FIX GSP] — Stores originals, reads EXIF before any resize, extracts video keyframes, computes pHash.
- Payment service [STR] — The only caller of PayPal. Each call carries an idempotency key tied to the job transition.
- Webhook receiver [STR] — Verifies PayPal signatures, dedupes events, confirms holds, captures and payouts.
- Ledger [NEW] — One row per money event: hold, reauth, capture, void, payout, refund. The earnings screens read from it.
- Notifications [GSP][STR] — Live status hub plus email or push at each step that needs someone to act.

↕ job id in, verdict out (the engine reads inputs from the database, never from the request body)

### L3 · AI engine — agents + checks, two model providers

- Intake agent [DOC][GSP] — Chat job creator. Reads the customer's photo and caption, fills trade, problem, location, urgency.
- Spec agent [GSP] — Paralegal role: drafts the per-task checklist from the request and what it sees in the customer's media.
- Pin inputs (stage 0) [MAP] — Loads checklist and evidence from DB, locks the job, caps verification attempts at 3.
- Fraud module [GSP][DOC] — pHash (edited-before and reused photos), stock image check, EXIF time window, EXIF and device GPS vs geofence.
- Vision agent [GSP] — Eye role: compares before and after for each checklist item, marks met or unmet with a reason.
- Dual-model judge [ARB][MAP] — 5-criteria rubric, scored by Model A and Model B in parallel on the same pinned prompt.
- Confidence router [DOC][MAP] — Auto-release, ask the customer, or flag. Degrades to ask the customer on any outage.
- Case summariser [DOC] — Writes the judge's brief from the job record, verdicts and both parties' statements.

↕ server-to-server, payment service only

### L4 · PayPal — sandbox for the demo

- JS SDK buttons — Customer approves the order in PayPal's own window.
- Orders v2 — intent AUTHORIZE, then authorize the order. Replaces Sharetribe's Stripe preauth.
- Authorizations — Capture (full or partial), reauthorize, void.
- Payouts — Sends the worker's share to their PayPal account after capture.
- Captures and refunds — Refund only for reversals after money has already moved.
- Webhooks — Authorization created and voided, capture completed and denied, payout item succeeded and failed.

↕ reads and writes

### L5 · Data and infrastructure — Postgres + object storage

- Postgres — users, jobs, checklist_items, evidence, verdicts, disputes, ledger, events.
- Object storage — Original photos and videos, keyframes. Signed URLs only.
- pHash index — Hash of every photo ever submitted, for reuse detection across jobs.
- Model providers — Two vendors so one outage can't decide a payment.

## 03 Job lifecycle

Merges Colony's job states, Sharetribe's process timers and Arbiq's cancel and override paths into one state machine.

| State | Moves to | Money | Timer |
|---|---|---|---|
| Draft | Open, when the customer approves the hold | nothing | — |
| Open | Assigned (worker accepts) · Cancelled (customer cancels) · Expired (no taker) | held | Expires if not accepted (e.g. 48 h) |
| Assigned | In progress, after check-in and before photos | held | Worker must check in by the booked slot |
| In progress | Submitted, with after photos and video | held | Reauthorize at day 3 if still open |
| Submitted, Verifying | Released (high confidence, or customer pays now) · Awaiting customer | held | AI verdict within minutes, max 3 tries |
| Awaiting customer | Released (approve) · Disputed (reject, or review window passes) | held | Review window (2 h, Colony-style) |
| Disputed | Released · Settled (split) · Refunded · In progress (rework) | held, maybe part paid | Judge SLA, then agreement window |
| Released, Completed | Payout sent | captured, paid out | — |
| Cancelled / Expired / Refunded | End | hold voided | — |

## 04 AI verification pipeline

Runs when the worker submits.

- **Stage 0 — Pin inputs**: load job, checklist and evidence from DB by job id; lock job as Verifying; cap at 3 attempts.
- **Stage 1 — Completeness**: before and after photo for every required item; video present if the checklist asks for one; keyframes extracted.
- **Stage 2 — Integrity (gate)**: pHash after vs before (too similar means an edited before photo); pHash vs every past photo (reused); stock or web image check; EXIF time inside the job window; EXIF and device GPS within 300 m.
- **Stage 3 — Checklist check**: vision agent compares before and after per item; output met or unmet, plus a reason and the photo it used.
- **Stage 4 — Rubric scoring**: Model A and Model B in parallel; same pinned prompt and evidence; 5 criteria, 0–10 each.
- **Stage 5 — Route**: compare numeric scores with a tolerance, not exact text; write the verdict log; pick one of three routes.

Rubric criteria:
- C1 Checklist met — share of required items marked met in stage 3.
- C2 Visible change — the after state clearly differs from before in the expected way.
- C3 Workmanship — neat, finished, no obvious damage or shortcuts.
- C4 Working proof — the video or photo shows the thing working (aircon cold air, tap not leaking).
- C5 Site left clean — no debris, parts or tools left behind.

Routes:
- **Auto-release** — integrity gate clean; every required item met; both models average ≥ 8 and no criterion under 6; models within 1.5 of each other. Capture the hold and pay the worker. Customer gets a receipt with the evidence.
- **Ask the customer** — scores pass but below auto bar; models disagree; one model timed out or errored. Evidence and AI notes go to the review panel. Approve pays, reject opens a dispute.
- **Flag and ask** — integrity gate failed; required items unmet; average under 6. Still goes to the customer, with warnings shown first. The AI never refunds on its own.

## 05 Money flow

An authorization is honoured for 3 days and can be captured for up to 29, so the sweeper reauthorizes at day 3.

| Event | PayPal call | Result |
|---|---|---|
| Customer books | orders create (AUTHORIZE) → authorize | held |
| Open job cancelled or expired | authorizations/{id}/void | released (void, not refund) |
| Job still open at day 3 | authorizations/{id}/reauthorize | renewed |
| Release (AI, customer, or judge) | capture full → payouts | worker 95 / fee 5 |
| Judge splits X% | capture X%, final → payout | rest released |
| Customer silent past window | capture 30%, not final → payout | kill fee paid, rest to judge |
| Judge refunds | void (or refund after a kill fee) | returned |
| Capture denied | webhook → retry once, then notify | job flagged |
| Payout failed or unclaimed | webhook → ledger keeps it owed | worker prompted to fix email |

## 06 Dispute resolution

The judge sees an AI-written brief, proposes an outcome, and both sides agree. The hold stays in place the whole time.

- D1 Open — Customer rejects: picks which checklist items failed and writes what's wrong. Worker gets a chance to reply.
- D2 Brief — AI summarises: request, checklist, evidence pairs, AI scores, fraud flags, both statements, timeline.
- D3 Propose — Judge proposes from the queue, inside the SLA. Chooses one outcome with a short reason.
- D4 Agree — Customer and worker accept, or the judge's ruling stands when the window closes. Logged.

Outcomes: **Release** (capture 100%, pay worker 95%) · **Split** (capture an agreed %, void the rest) · **Refund** (void the hold; worker's record notes it) · **Rework** (back to In progress with a deadline; hold kept, reauthorized if needed).

## 07 Lessons from the reference repos

| Repo | Problem shown in the diagram | How the blueprint handles it | Where |
|---|---|---|---|
| GigSmartPay | Checklist saved as generic on-chain text and lost | Checklist stored as structured items, loaded at stage 0 | L3 · 04 |
| GigSmartPay | No worker before photo; EXIF stripped by canvas | Before capture required at check-in; original file uploaded, EXIF read server-side before resize | L1 · L2 |
| GigSmartPay | Device GPS is spoofable; fraud module not built | Integrity gate cross-checks device GPS, EXIF GPS, time and pHash. Failure blocks auto-pay only | 04 stage 2 |
| Arbiq | No checklist field or checklist scoring | Checklist review screen and stage 3 per-item check | L1 · 04 |
| Arbiq | No review timeout; disputes can stall with no override | Review window sweeper, override panel, judge SLA | L2 · 06 |
| Arbiq | Validators compare prose with strict equality | Models return numeric scores, compared with a 1.5-point tolerance | 04 stage 5 |
| Mappers | Oracle trusts criteria re-sent in the request body | Engine takes only a job id and reads everything from the database | 04 stage 0 |
| Mappers | One model outage returns HTTP 500 | Outage routes to ask the customer | 04 routes |
| Mappers | Escalations only logged; no verdict log or arbiter queue | Judge queue and append-only verdict log | L1 judge |
| Colony | Assigned status can be overwritten; escrow fails open | Accept is atomic and requires a valid hold | L1 · L2 |
| Colony | No submittedAt; no timer; poster decisions unauthenticated | Timestamp on every transition, minute sweeper, role auth | L2 |
| Sharetribe | Stripe preauth and Stripe Connect payouts | PayPal Orders v2 authorize/capture and PayPal Payouts | L4 |
| Sharetribe | 6-day hold timer too long; capture failure unhandled | Reauthorize at day 3; capture-denied webhook handling | 05 |

## 08 Build order (as written in the blueprint)

- **Phase 1 · Money skeleton — Hold and release**: job table and state machine; PayPal sandbox authorize, capture, void; webhook receiver and ledger; payout to worker.
- **Phase 2 · Proof — Capture evidence**: chat intake and spec agent; checklist review; check-in, before and after capture; evidence ingest with EXIF and pHash.
- **Phase 3 · Judgement — AI decides**: stages 0–3; dual-model rubric; router and review panel; pay-now override, cancel.
- **Phase 4 · Stretch — People decide**: judge console and case brief; sweeper (day-3 reauth, review window); kill fee, rework; ratings and reputation.

## 09 Open decisions (defaults accepted at init unless noted in PROJECT.md)

- Who sets the price? Default: AI suggests a range from the photo, customer sets the price, the hold is placed at posting.
- Customer goes silent? Default: 30% kill fee paid, rest goes to the judge. Alternative: auto-release 100%.
- Auto-release thresholds: start strict (avg ≥ 8, no criterion under 6) and loosen with demo data.
- How the worker gets paid: Payouts in sandbox for the hackathon.
- Long jobs: must complete within 29 days. Milestone holds later.
- Who are the judges? Platform admins for the demo.

Thresholds, timers and the 95/5 split are starting values to tune.

## 10 Hackathon fit

| Criterion | Rating | Assessment | To do |
|---|---|---|---|
| Stage One (fit + required APIs) | pass | PayPal is the core: authorize, capture (full and partial), void, reauthorize, Payouts, webhooks. The AI decides when money moves. | Keep both visible in the demo. |
| Technological implementation | strong if it works | Full authorization lifecycle, two models checking each other, pHash and EXIF fraud checks. | Add an admin "advance clock" button to show the day-3 reauthorization. Deploy early so webhooks reach a public URL. |
| Design | biggest risk | Three apps and many modules. Half-built screens read as a proof of concept. | Polish the customer and worker flows. Keep the judge console to one screen. Ship build phases 1–3 first. |
| Potential impact | make it specific | "Freelance gig workers" is too broad. | Pick one trade and one market. Collect 2–3 real quotes from workers and customers. |
| Innovation | frame carefully | Held payments exist (Upwork, Airtasker). New: AI verifying physical work and releasing payment itself. | Lead with "AI-verified proof of work, AI can only approve". Reference repos run on crypto; this runs on real PayPal payments. |
| Presentation | 3 moments | The video must show the project working end to end. | Build the video around the three moments. |

Video plan:
1. **Happy path** — Customer books, the hold appears in the PayPal sandbox dashboard, the worker submits proof, the AI auto-releases, then show the capture and the payout landing.
2. **Fraud catch** — A worker reuses an old photo. The integrity gate flags it and the job goes to the customer instead of paying out.
3. **Dispute** — The customer rejects, the AI writes the brief, the judge splits the payment, then show the partial capture in the sandbox.

Sponsor tools: Render (hosting; webhooks need a public URL) · Elastic (photo-hash index, searchable verdict log) · Postman (published PayPal API collection) · Zapier (notifications). Check section 8 of the hackathon rules for each sponsor prize's requirements.

Questions judges may ask:
- Can photos really prove the job was done well? Not always — uncertainty routes to the customer and anything flagged to a person. The AI can only approve payment, never take it away.
- Is it legal to hold money for other people? At real scale it needs a compliant marketplace setup; production would use PayPal's marketplace payments.

## REF Reference projects

- GigSmartPay — https://github.com/projects-hacks/smart-pay — GPS-tagged before/after photos compared by AI; AI-drafted spec/checklist from the request and media; pHash and EXIF-vs-geofence fraud checks.
- Arbiq — https://github.com/CodeWithShamim/Arbiq — 5-criteria LLM scoring rubric; manual override to pay; cancel-and-refund for untaken jobs.
- Mappers — https://github.com/mrphatom/mappers_contract/wiki/Architecture — parallel requests to different models, two-model agreement, no single point of failure.
- Colony — https://github.com/dyefymenko/Colony — job states open/assigned/in progress/submitted/completed with escrow; 30% kill fee if poster ignores submitted work > 2 h.
- Sharetribe — https://github.com/sharetribe/example-processes — main marketplace wireframe to replicate; card preauthorization (Stripe), adapted to PayPal.
- Audit artifact: https://claude.ai/artifact/SWLoxd1AxWZuiLFmimT7oo
