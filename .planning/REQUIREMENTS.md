# Requirements: Pay-When-Done Marketplace

**Defined:** 2026-10-27
**Core Value:** Money only moves when the work is proven: a PayPal authorization holds the customer's funds at booking, and it is captured and paid out only after AI-verified (or human-approved) proof. The AI can approve payment but can never take it away.

## v1 Requirements

Requirements for the hackathon release. Each maps to one roadmap phase.

### Foundation & Accounts

- [ ] **FND-01**: The app is deployed on Render on paid plans (web service, background worker, Postgres) with a public HTTPS URL that PayPal webhooks can reach
- [ ] **FND-02**: Photos and videos are stored in Cloudflare R2: a private bucket, uploaded via presigned URLs and viewed via signed URLs only
- [ ] **FND-03**: Spike results are written down before money and evidence code is built. They cover PayPal reauthorize count and timing, partial capture then void, Payouts in sandbox, iPhone/Android photo metadata, Elastic bit-vector search, Claude + Gemini structured scoring, Zapier Catch Hook access, and SSE on Render
- [ ] **AUTH-01**: User can sign up and log in with email and password, and stay logged in across refreshes
- [ ] **AUTH-02**: Each account has one role (customer, worker or judge), and the server checks role and job relationship on every decision
- [ ] **AUTH-03**: Worker provides a PayPal email for payouts at sign-up
- [ ] **AUTH-04**: In demo mode, a presenter can switch between seeded customer, worker and judge accounts with one click. Every switched request is still really authorized

### Job Posting & Checklist Contract

- [ ] **JOB-01**: Customer can start a job by uploading a photo or video of the problem with a caption and a map pin
- [ ] **JOB-02**: An intake agent chats with the customer and asks follow-up questions until the job fields are complete: problem, system type, unit count, access notes, urgency, and a date and time window
- [ ] **JOB-03**: Customer can always fall back to a plain form if the AI intake fails
- [ ] **JOB-04**: A spec agent drafts a per-task checklist of visually decidable items (e.g. filter, condenser coil, drain line, thermostat/cycle, supply/return temperature split, site clean), with a fixed aircon template as fallback
- [ ] **JOB-05**: Customer sees an AI-suggested price range and sets the price, with the 5% platform fee shown
- [ ] **JOB-06**: Customer can edit and approve the checklist before paying. It is stored as structured rows and frozen once a worker accepts

### Payments (PayPal sandbox)

- [ ] **PAY-01**: Customer approves an AUTHORIZE order with the PayPal button. The UI says the money is held for up to 7 days and not charged
- [ ] **PAY-02**: The server authorizes the order and checks the amount and currency. The job opens only once the hold is confirmed, and the hold is visible in the PayPal sandbox dashboard
- [ ] **PAY-03**: Customer can cancel an open job before anyone accepts it, which voids the hold
- [ ] **PAY-04**: Every PayPal call goes through one payment module, using a stored command row and a deterministic request id per job transition, so retries never double-charge or double-pay
- [ ] **PAY-05**: Webhooks are signature-verified against the raw body, deduplicated by event id, and reconciled by re-fetching the resource from PayPal
- [ ] **PAY-06**: On release, the platform captures the hold (final capture) and, only once the capture is COMPLETED, pays the worker 95% via Payouts
- [ ] **PAY-07**: A judge's split captures the agreed share as a final partial capture, and the rest of the hold is released
- [ ] **PAY-08**: A judge's refund voids the hold
- [ ] **PAY-09**: The authorization is reauthorized once the honor period ends (day 4 or later), and later captures always use the latest authorization id
- [ ] **PAY-10**: Jobs must finish within 7 days. If a hold lapses or can't be renewed, the customer is asked to re-confirm a new hold
- [ ] **PAY-11**: A denied capture is retried once, then the job is flagged and both parties are notified
- [ ] **PAY-12**: A failed or unclaimed payout stays owed in the ledger, and the worker is prompted to fix their PayPal email
- [ ] **PAY-13**: Every money event (hold, reauth, capture, void, payout, refund) is recorded in an append-only integer-cents ledger
- [ ] **PAY-14**: Worker sees earnings (held, released, paid) with each job's split, read from the ledger, and customer gets a receipt

### Job Lifecycle

- [ ] **LIFE-01**: A single state machine is the only code that changes job status, and every transition records a timestamp and actor
- [ ] **LIFE-02**: The AI actor can only trigger "release" or "ask customer", never refund or reject
- [ ] **LIFE-03**: Worker can browse open jobs sorted by distance
- [ ] **LIFE-04**: Worker can accept a job. Accept is atomic and succeeds only if the job is open and its hold is valid
- [ ] **LIFE-05**: Worker can check in only when the device location is within 300 m of the job (accuracy-aware), with a labelled demo override for recording
- [ ] **LIFE-06**: Customer and worker see job status update live (SSE, with polling fallback): accepted, checked in, evidence arriving, verifying, result

### Evidence Capture & Integrity

- [ ] **EVID-01**: At check-in, worker must take a nameplate photo and before photos using the phone's camera, uploaded as untouched original files
- [ ] **EVID-02**: Worker uploads one after-photo per checklist item, plus a short working-proof video (e.g. cold air at the vent)
- [ ] **EVID-03**: Each capture records a server-issued nonce, the server time window, and the device location with its accuracy
- [ ] **EVID-04**: The server reads EXIF before any resize, computes SHA-256 and a perceptual hash, normalises to JPEG (HEIC handled or flagged for a retake), and extracts video keyframes
- [ ] **EVID-05**: The integrity gate grades each check as pass, fail or unverifiable. Missing EXIF is neutral, and EXIF that contradicts the job time or place is a fail
- [ ] **EVID-06**: Photos reused from a past job are detected by perceptual-hash match, and the matched original is shown side by side
- [ ] **EVID-07**: An after-photo that is just an edited before-photo is detected by a near-identical hash match
- [ ] **EVID-08**: Photos that appear on the web or are stock images are flagged (Google Cloud Vision web detection, plus a seeded stock-hash set)
- [ ] **EVID-09**: Thresholds are calibrated on 20+ real photo pairs before they are frozen

### AI Verification & Routing

- [ ] **AI-01**: Verification is triggered by job id only and reads the checklist and evidence from the database, never from the request. It locks the job and allows at most 3 attempts
- [ ] **AI-02**: A completeness check confirms before and after photos exist for every required item, plus a video if required
- [ ] **AI-03**: A vision agent marks each checklist item met or unmet, with a reason and the photo it used
- [ ] **AI-04**: Claude and Gemini each score the same JPEG keyframes in parallel on 5 criteria (checklist met, visible change, workmanship, working proof, site clean), 0 to 10
- [ ] **AI-05**: Scores are compared numerically within a 1.5-point tolerance. Any timeout, schema failure or refusal counts as an outage
- [ ] **AI-06**: Auto-release happens only when the gate is clean, every item is met, both averages are at least 8, no criterion is under 6, and the models agree. The thresholds are configurable
- [ ] **AI-07**: Disagreement, outage or below-bar scores route to the customer. A failed gate, unmet items or an average under 6 route to the customer with warnings shown first
- [ ] **AI-08**: Text in photos that tries to instruct the AI is flagged and forces the flag-and-ask route
- [ ] **AI-09**: Every AI and human decision is written to an append-only verdict log, with the prompt, evidence hashes, model ids and raw output
- [ ] **AI-10**: Presenter can switch off one model vendor to demonstrate the degrade-to-customer path

### Customer Review

- [ ] **REV-01**: Customer sees a review panel: before and after side by side, per-item AI verdicts, scores and fraud flags
- [ ] **REV-02**: Customer can approve, which releases payment
- [ ] **REV-03**: Customer can reject by choosing which items failed and writing what's wrong, which opens a dispute
- [ ] **REV-04**: Customer can "pay now" (skip the AI) or "approve anyway" after a flagged result
- [ ] **REV-05**: If the customer doesn't respond within 2 hours, the job escalates to a dispute with the full hold kept

### Timers & Demo Clock

- [ ] **TIME-01**: A minute sweeper fires due timers idempotently: open-job expiry after 48 h (voids the hold), customer review window, dispute SLA, verifying timeout, and the reauth window
- [ ] **TIME-02**: Admin can advance the app clock and see pending timers. It is labelled as affecting only app timers, not PayPal's clock

### Disputes & Judge

- [ ] **DISP-01**: Worker can reply with a statement after the customer rejects
- [ ] **DISP-02**: AI writes a case brief: request, checklist, evidence pairs, AI scores, fraud flags, both statements and timeline
- [ ] **DISP-03**: Judge sees a dispute queue with an SLA countdown
- [ ] **DISP-04**: On one screen, the judge can view the brief and evidence (before/after, video, EXIF time and place, hash matches) and propose release, split by % or refund, with a short reason
- [ ] **DISP-05**: Customer and worker can each accept the judge's proposal. If the agreement window closes first, the ruling stands, and the outcome is logged

### Notifications & Sponsor Integrations

- [ ] **NOTF-01**: Customer and worker get an email (via Zapier) at each step where they need to act. Notifications never block a job transition
- [ ] **NOTF-02**: The photo-hash index and the verdict log are mirrored to Elastic, and the verdict log is searchable there. Postgres stays the source of truth

### Demo Readiness

- [ ] **DEMO-01**: Seed data and a reset script restore demo accounts, jobs and photo sets (known-good, reused and stock), and void leftover holds
- [ ] **DEMO-02**: The three video moments (happy path, fraud catch, dispute with split) run end to end on the deployed URL

## v2 Requirements

Deferred. Tracked but not in the current roadmap.

### Money

- **KILL-01**: 30% kill fee on customer silence, captured non-final with the payout held until the dispute resolves
- **REWK-01**: Judge can send a job back for rework with a deadline, if no capture has happened and the hold has time left
- **MILE-01**: Milestone holds for jobs longer than 7 days

### Reputation

- **REP-01**: Customer rates the worker with stars and a note after completion
- **REP-02**: Worker profile shows completion rate, auto-release rate and ratings

### Expansion

- **TRADE-01**: Support trades beyond aircon servicing
- **MKT-01**: Markets and currencies beyond US/USD
- **LIVE-01**: Live PayPal payments through a compliant marketplace (payee) setup

## Out of Scope

| Feature | Reason |
|---------|--------|
| Live reauthorization in the demo video | The app clock can't move PayPal's clock. The reauth logic is built (PAY-09) but not shown |
| In-app chat between customer and worker | Not needed for the demo moments; disputes use statements |
| WebSocket hub / live GPS en-route tracking | Next.js route handlers can't host WebSockets; SSE covers live status |
| Job-board filters beyond distance | Single trade, small demo dataset |
| AI-initiated refunds or penalties | Violates "AI can only say yes" |
| Refrigerant charge or electrical verification | A photo can't prove them |
| Crypto/on-chain escrow | This runs on real PayPal payments |
| Postman collection | Not a chosen sponsor tool |
| Free hosting tiers | Would sleep through webhooks and expire the database |

## Traceability

Filled in by roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|

**Coverage:**
- v1 requirements: 68 total
- Mapped to phases: 0 (pending roadmap)

---
*Requirements defined: 2026-10-27*
*Last updated: 2026-10-27 after initial definition*
