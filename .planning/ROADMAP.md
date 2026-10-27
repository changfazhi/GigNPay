# Roadmap: Pay-When-Done Marketplace

## Overview

Seven phases take this from an empty repo to a demo video where real PayPal sandbox money moves only when work is proven. Phase 1 puts the app on a public Render URL and turns every risky vendor assumption (PayPal reauthorization, iPhone photo metadata, Elastic, Zapier, SSE) into written facts. Phase 2 builds the money skeleton and ends with a human-click release (capture, then a 95% payout), so the PayPal story is real even if the AI work slips. Phases 3 and 4 add the job flow and trustworthy evidence capture. Phase 5 adds the dual-model verifier and router (AI can only say yes). Phase 6 adds the timers, disputes and one-screen judge console that the dispute moment needs. Phase 7 wires Zapier and Elastic and rehearses the three video moments on the deployed URL.

**Demo moments mapped to phases:**

- Moment 1, happy path (book, hold, proof, AI auto-release, capture and payout): Phases 2, 3, 4, 5
- Moment 2, fraud catch (reused photo flagged, routed to customer): Phases 4, 5
- Moment 3, dispute (reject, AI brief, judge split, partial capture): Phases 5, 6
- All three recorded end to end on the deployed URL: Phase 7

**Sequencing rule:** no new feature work after the dispute moment first works until the full video has been recorded once.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation, Deploy & Spikes** - Live Render deploy, accounts and roles, private media storage, and written spike results for every risky vendor behavior
- [ ] **Phase 2: Money Skeleton** - PayPal hold, cancel/void, and a human-click release that captures and pays the worker 95%, backed by an append-only ledger
- [ ] **Phase 3: Job Lifecycle** - Chat intake, checklist and price contract, job board, atomic accept, geofenced check-in, live status
- [ ] **Phase 4: Evidence Capture & Integrity Gate** - Untouched phone originals with server-observed signals, plus reuse, edit and stock-image detection
- [ ] **Phase 5: AI Verification & Routing** - Claude and Gemini score the same evidence; auto-release only when both agree, otherwise the customer decides
- [ ] **Phase 6: Timers, Disputes & Judge Console** - Sweeper and demo clock, reject-to-dispute flow, AI case brief, one-screen judge ruling carried out in PayPal
- [ ] **Phase 7: Sponsor Integrations, Hardening & Demo** - Zapier emails, Elastic mirror, demo reset, and the three video moments running end to end

## Phase Details

### Phase 1: Foundation, Deploy & Spikes

**Goal:** The app is live on a public HTTPS URL with working role-based accounts, private photo/video storage, and written proof of how each risky vendor behaves, so money and evidence code is built on verified ground.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: FND-01, FND-02, FND-03, AUTH-01, AUTH-02, AUTH-03, AUTH-04
**Success Criteria** (what must be TRUE):

  1. Opening the public Render HTTPS URL loads the app, which runs as a paid web service plus background worker plus Postgres, and a PayPal sandbox test webhook sent to that URL is received.
  2. A user can sign up as a customer, worker or judge with email and password (workers must give a PayPal email), stay logged in across a refresh, and an attempt to use another role's action is refused by the server.
  3. In demo mode the presenter can switch between the seeded customer, worker and judge accounts with one click, and every request after a switch is still authorized as that account.
  4. A photo and a short video taken on a phone upload directly to the private R2 bucket and display only through a signed URL, while the unsigned object URL is refused.
  5. Written spike results exist for PayPal reauthorize count and timing, partial capture then void, Payouts in sandbox, iPhone and Android photo metadata, Elastic bit-vector search, Claude and Gemini structured scoring, Zapier Catch Hook access, and SSE on Render, each stating what happened and what it changes in the design.

**Plans:** 6/19 plans executed

Plans:
**Wave 1**

- [ ] 01-01-PLAN.md — S-PAY aged authorizations: five sandbox AUTHORIZE orders approved and authorized in the first hour, honor-period reauth probe (D-01; owner-clock spike work beside the skeleton, not a code dependency) [W1]
- [x] 01-02-PLAN.md — Walking skeleton 1/7 (first code deliverable): package legitimacy gate, Next 16 scaffold, exact pins, Phase 1 scripts, .gitignore/.env.example [W1]

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-03-PLAN.md — Walking skeleton 2/7: Vitest unit/smoke harness, config test, env module, evidence redaction helpers, failing skeleton e2e smoke test [W2]
- [x] 01-04-PLAN.md — Walking skeleton 3/7: shadcn defaults UI kit (D-05) per the owner's package answer [W2]

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-05-PLAN.md — Walking skeleton 4/7: Better Auth roles, worker PayPal email, D-02 judge gate, Phase 1 Drizzle schema and migration [W3]
- [ ] 01-06-PLAN.md — S-LLM: Claude and Gemini structured scoring on the same JPEGs [W3]
- [ ] 01-07-PLAN.md — FND-02 storage core: private R2 bucket, presign module, live round-trip (unsigned/expired refused) [W3]

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 01-08-PLAN.md — Walking skeleton 5/7: pg-boss heartbeat worker and /api/health [W4]

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 01-09-PLAN.md — Walking skeleton 6/7: sign-up/login, role dashboard from Postgres with worker status, header/sign-out, proxy [W5]

**Wave 6** *(blocked on Wave 5 completion)*

- [ ] 01-10-PLAN.md — Walking skeleton 7/7: render.yaml (paid web + worker + Postgres), Render Blueprint, [BLOCKING] schema apply + verify, live skeleton smoke with named live-DB check [W6]

**Wave 7** *(blocked on Wave 6 completion)*

- [ ] 01-11-PLAN.md — AUTH-02: authorize helpers, withActor wrapper, role ping actions, live 403/401 and session smoke [W7]
- [ ] 01-12-PLAN.md — FND-01 webhook: fail-closed PayPal receiver, registration, simulator and forged deliveries received [W7]

**Wave 8** *(blocked on Wave 7 completion)*

- [ ] 01-13-PLAN.md — AUTH-04: seeded demo accounts, DEMO_MODE-gated one-click switch [W8]
- [ ] 01-14-PLAN.md — S-PAY capture/void and Payouts probes; real verified webhooks and resend dedupe [W8]

**Wave 9** *(blocked on Wave 8 completion)*

- [ ] 01-15-PLAN.md — S-ENV: token-gated diagnostics (ffmpeg, Postgres extensions, bit_count, sharp HEIF) on Render [W9]

**Wave 10** *(blocked on Wave 9 completion)*

- [ ] 01-16-PLAN.md — S-SSE: SSE route and page, worker notify producer, laptop + redeploy probes on Render [W10]

**Wave 11** *(blocked on Wave 10 completion)*

- [ ] 01-17-PLAN.md — S-CAM: phone camera page, iPhone + Android capture matrix (D-03), signed-URL display; S-SSE phone runs [W11]

**Wave 12** *(blocked on Wave 11 completion)*

- [ ] 01-18-PLAN.md — S-ES and S-ZAP last (D-04): bit-vector kNN, Catch Hook, trial expiry dates [W12]

**Wave 13** *(blocked on Wave 12 completion)*

- [ ] 01-19-PLAN.md — SPIKES.md assembly with doc lint, aged reauth result or PENDING (D-01), PROJECT/STATE outcomes [W13]

**UI hint**: yes

### Phase 2: Money Skeleton

**Goal:** A customer's PayPal sandbox funds are held on a job and, on a human click, captured and paid out 95% to the worker, with every money event recorded and safe to retry.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: LIFE-01, PAY-01, PAY-02, PAY-03, PAY-04, PAY-05, PAY-06, PAY-11, PAY-12, PAY-13, PAY-14, REV-02
**Success Criteria** (what must be TRUE):

  1. On a seeded job, the customer approves a PayPal AUTHORIZE order with the PayPal button; the screen says the money is held for up to 7 days and not charged, the job opens only after the server confirms the authorization for the right amount and currency, and the hold shows in the PayPal sandbox dashboard.
  2. The customer can cancel an open job before anyone accepts it and the hold is voided in the sandbox dashboard; the job history lists every status change with its timestamp and actor, and status can change no other way.
  3. On a delivered job, the customer clicks Approve: the hold is captured once as a final capture and, only after the capture shows COMPLETED, the worker's sandbox account receives 95% through Payouts while the platform keeps 5%. Double clicks, retries and replayed webhooks never capture or pay twice.
  4. The worker's earnings screen shows held, released and paid amounts with each job's split, and the customer gets a receipt; both are read from an append-only ledger with one integer-cents row for every hold, capture, void and payout.
  5. A denied capture is retried once and then the job is flagged and both parties are notified; a failed or unclaimed payout stays owed in the ledger and the worker is prompted to fix their PayPal email.

**Plans**: TBD
**UI hint**: yes

### Phase 3: Job Lifecycle

**Goal:** A customer can describe a job in chat, agree a checklist and price, and place the hold; a nearby worker can accept it and check in on site, and both sides watch the status update live.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: JOB-01, JOB-02, JOB-03, JOB-04, JOB-05, JOB-06, LIFE-03, LIFE-04, LIFE-05, LIFE-06
**Success Criteria** (what must be TRUE):

  1. A customer can start a job with a photo or video, a caption and a map pin, and an intake agent keeps asking follow-up questions until problem, system type, unit count, access notes, urgency and a date and time window are complete; if the AI intake fails, a plain form takes over.
  2. The customer sees an AI-drafted checklist of visually decidable items (a fixed aircon template if the AI fails) and an AI-suggested price range with the 5% fee shown, can edit and approve the checklist and set the price, and then pays the hold through the Phase 2 checkout.
  3. A worker sees open jobs sorted by distance and can accept one; if two workers accept the same job at once exactly one succeeds, an accept fails if the hold is not valid, and the checklist is frozen from the moment of acceptance.
  4. A worker can check in only when the device location is within 300 m of the job (allowing for reported accuracy) and is refused with a clear message otherwise; a labelled demo override exists for recording.
  5. Customer and worker see the job move through accepted, checked in, evidence arriving, verifying and result without refreshing, and the view keeps updating by polling if the live stream drops.

**Plans**: TBD
**UI hint**: yes

### Phase 4: Evidence Capture & Integrity Gate

**Goal:** A worker's on-site photos and video are captured as untouched originals with server-observed proof of time and place, and reuse, edited-before-photo and stock-image fraud is detected before any AI scoring.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: EVID-01, EVID-02, EVID-03, EVID-04, EVID-05, EVID-06, EVID-07, EVID-08, EVID-09
**Success Criteria** (what must be TRUE):

  1. At check-in the worker takes a nameplate photo and before photos with the phone camera, then uploads one after-photo per checklist item and a short working-proof video; originals are stored untouched, and each capture records a server-issued nonce, the server time window, and the device location with its accuracy.
  2. After upload, the server has read EXIF before any resize, computed a SHA-256 and a perceptual hash, normalised the image to JPEG (a HEIC that cannot be converted is flagged so the worker retakes it), and extracted keyframes from the video.
  3. The integrity gate grades each check as pass, fail or unverifiable, tested with real iPhone and Android photos: missing EXIF is neutral and does not block, while EXIF that contradicts the job time or place is a fail.
  4. A photo reused from a past job is flagged with the matched original shown side by side, an after-photo that is just an edited before-photo is flagged, and a photo that appears on the web or is a seeded stock image is flagged.
  5. Matching thresholds are calibrated on 20 or more real photo pairs and then frozen in configuration, with the calibration results recorded.

**Plans**: TBD
**UI hint**: yes

### Phase 5: AI Verification & Routing

**Goal:** Submitted proof is scored by two independent AI vendors, payment is released automatically only when both are confident and agree, and every other outcome goes to the customer, who sees the evidence and flags before deciding.
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: AI-01, AI-02, AI-03, AI-04, AI-05, AI-06, AI-07, AI-08, AI-09, AI-10, LIFE-02, REV-01, REV-04
**Success Criteria** (what must be TRUE):

  1. Happy path: when a worker submits a complete, clean evidence set, verification starts from the job id alone, confirms every required photo and video exists, marks each checklist item met with a reason and the photo used, and when Claude and Gemini score the same keyframes with both averages at least 8, no criterion under 6 and scores within 1.5 points, the job auto-releases and the capture and 95% payout happen with no customer click. The thresholds are configurable.
  2. Fraud catch: a job with a reused photo fails the integrity gate and goes to the customer with warnings shown first; the review panel shows before and after side by side, per-item AI verdicts, scores and fraud flags, including the matched original.
  3. From the review panel the customer can approve, "pay now" (skipping the AI), or "approve anyway" after a flagged result; every non-yes outcome (below bar, disagreement, outage, failed gate, unmet items) lands with the customer, and the AI has no path to refund or reject.
  4. The presenter can switch off one model vendor and the next submission routes to the customer instead of auto-releasing (timeouts, schema failures and refusals count as an outage); a photo containing text that tries to instruct the AI is flagged and forces the flag-and-ask route.
  5. Every AI and human decision appears in an append-only verdict log with the prompt, evidence hashes, model ids and raw output, and a job is locked while verifying and gets at most 3 attempts.

**Plans**: TBD
**UI hint**: yes

### Phase 6: Timers, Disputes & Judge Console

**Goal:** Every waiting state has a timer, and a rejected job moves through statements, an AI case brief and a one-screen judge ruling that is carried out as a real release, partial capture or void in PayPal.
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: TIME-01, TIME-02, REV-03, REV-05, DISP-01, DISP-02, DISP-03, DISP-04, DISP-05, PAY-07, PAY-08, PAY-09, PAY-10
**Success Criteria** (what must be TRUE):

  1. The customer can reject a result by choosing which checklist items failed and writing what is wrong; this opens a dispute, the worker can reply with a statement, and an AI case brief is produced covering the request, checklist, evidence pairs, AI scores, fraud flags, both statements and the timeline.
  2. The judge sees a dispute queue with an SLA countdown and, on one screen, can read the brief, view the evidence (before and after, video, EXIF time and place, hash matches) and propose a release, a split by percentage or a refund with a short reason.
  3. Customer and worker can each accept the proposal, and if the agreement window closes first the ruling stands and the outcome is logged; a split captures the agreed share as a final partial capture and releases the rest, and a refund voids the hold, both visible in the PayPal sandbox dashboard.
  4. The presenter can advance the app clock from an admin panel that lists pending timers and states it moves only app timers and not PayPal's clock; the sweeper then fires due timers exactly once, so a customer silent past 2 hours escalates to a dispute with the full hold kept, and an open job left 48 hours voids its hold.
  5. An authorization is reauthorized once its honor period ends (day 4 or later) and later captures use the latest authorization id; if a hold lapses or cannot be renewed, the customer is asked to re-confirm a new hold.

**Plans**: TBD
**UI hint**: yes

### Phase 7: Sponsor Integrations, Hardening & Demo

**Goal:** Zapier emails and the Elastic mirror work without ever blocking a job, and the presenter can reset to a known state and run all three video moments end to end on the deployed URL.
**Mode:** mvp
**Depends on**: Phase 6
**Requirements**: NOTF-01, NOTF-02, DEMO-01, DEMO-02
**Success Criteria** (what must be TRUE):

  1. The customer and the worker each receive an email, sent through Zapier, at every step where they need to act, and a job still moves forward when Zapier is unavailable.
  2. The photo-hash index and the verdict log are mirrored to Elastic, searching the verdict log in Elastic returns the decisions for a job, and a job still completes when Elastic is unavailable because Postgres remains the source of truth.
  3. One reset run restores the demo accounts, jobs and photo sets (known-good, reused and stock) and voids any leftover PayPal holds.
  4. Starting from the reset state on the deployed URL with real PayPal sandbox calls, the presenter completes the happy path with AI auto-release, the fraud catch with a reused photo routed to the customer, and the dispute with a judge split and partial capture.

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation, Deploy & Spikes | 6/19 | In Progress|  |
| 2. Money Skeleton | 0/TBD | Not started | - |
| 3. Job Lifecycle | 0/TBD | Not started | - |
| 4. Evidence Capture & Integrity Gate | 0/TBD | Not started | - |
| 5. AI Verification & Routing | 0/TBD | Not started | - |
| 6. Timers, Disputes & Judge Console | 0/TBD | Not started | - |
| 7. Sponsor Integrations, Hardening & Demo | 0/TBD | Not started | - |
