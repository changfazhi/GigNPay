# Feature Research

**Domain:** Held-payment gig marketplace for physical home-service jobs (aircon servicing, US) with AI-verified proof of work
**Researched:** 2026-10-27
**Confidence:** MEDIUM (competitor payment-hold behavior and PayPal timing rules checked against official docs and help centers via search; HVAC checklist content cross-checked against utility and trade sources; photo-evidence feasibility and iOS/PWA EXIF behavior are reasoned from experience and flagged LOW where unverified)

## Feature Landscape

### Table Stakes (Users Expect These)

Judged against TaskRabbit, Airtasker, Thumbtack, Angi, Upwork (fixed-price escrow) and Sharetribe's default booking process. A reviewer who has used any of them will notice these missing. "Demo-critical" means one of the three video moments fails without it.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Auth + role accounts (customer, worker, judge) | Every marketplace has it | LOW | Seeded accounts + demo role switcher (already decided). Demo-critical. |
| Job posting with photo, address, and time window | TaskRabbit/Thumbtack both collect problem details, location, and a preferred date/time | MEDIUM | **Gap in PROJECT.md:** the intake spec has photo, caption, map pin but no scheduling field, yet blueprint says "worker must check in by the booked slot". Add a date + window picker (no calendar integration). Add aircon fields: system type (central / split / window), unit count, access notes. |
| Price shown up front, fee transparent | Airtasker/TaskRabbit show total before booking | LOW | AI-suggested range, customer picks a price, 5% platform fee shown on worker side. |
| Payment held at booking, charged on completion | TaskRabbit (no charge until task done, may show a temporary hold), Airtasker Pay (escrow until release), Upwork (funded milestone), Sharetribe (preauthorization then capture) | MEDIUM | This is table stakes in the category; the novelty is who releases it. PayPal AUTHORIZE order + JS button. Copy must say "held, not charged". Demo-critical. |
| Worker job board + accept | Airtasker offers, Thumbtack leads, Sharetribe provider accept | LOW | Seed 4-6 jobs; sort by distance only. Atomic accept (row lock + hold valid check). Demo-critical. |
| Status tracking visible to both parties | Every competitor shows task state | LOW | Polling every 3-5 s or SSE is enough. A WebSocket hub is not table stakes. Demo-critical. |
| Customer approval/release control | Airtasker "Release payment" button; Upwork "release milestone"; Sharetribe complete transaction | LOW | Review panel approve button. Demo-critical (moments 2 and 3). |
| Cancel before work starts, hold returns | Airtasker/Sharetribe all allow it | LOW | `void` on the authorization. Same code path as open-job expiry. Cheap proof of PayPal API breadth. |
| Dispute path with a human decision | Airtasker free Dispute Resolution Service (payment stays in escrow during dispute), Upwork dispute assistance, TaskRabbit Happiness Pledge (claims window reported as 14 days) | MEDIUM | The judge console is the equivalent. Demo-critical (moment 3). |
| Notifications on each step needing action | Email/push on every competitor | LOW | Zapier email on "Awaiting your review" and "Released" is enough. |
| Receipt / payment history | Every competitor | LOW | Ledger-backed earnings table (worker) and receipt card (customer). |
| Worker payout setup | Stripe Connect / PayPal / bank onboarding on all | LOW | PayPal email at sign-up. Payouts API needs to be enabled on the sandbox business account (check early). |
| Worker trust signals (reviews, badges, license) | TaskRabbit ratings and badges, Thumbtack verified reviews, Angi Approved/background-check language, Upwork JSS | MEDIUM | **Deliberately not built** (ratings are out of scope). Mitigate cheaply: seeded read-only worker card with "EPA 608 certified" badge text and "jobs verified: N". HVAC refrigerant handling in the US requires EPA 608 certification and many states require contractor licensing (MEDIUM, background knowledge). Show a badge, do not build verification. |
| In-app messaging | TaskRabbit, Airtasker, Thumbtack, Sharetribe all have it | MEDIUM | **Cut and replace:** job notes field + status timeline + Zapier emails + dispute statements. Judges will notice, but it is a poor use of days 1-10. |

### Differentiators (Competitive Advantage)

Aligned with Core Value: "money only moves when the work is proven; AI can approve but never take away."

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Checklist as a priced contract, agreed before payment | Competitors have free-text task descriptions; none ties payment release to a structured, customer-approved list | MEDIUM | Spec agent drafts 5-7 items from the intake photo and form; customer edits and approves; stored as rows. The single biggest "fit" feature because the verifier needs it. Demo-critical. |
| AI auto-release of payment on verified proof | Competitors need a human click (Airtasker, Upwork) or a timer (Upwork auto-release after silence). Here the evidence itself triggers release | HIGH | Pipeline stages 0-5. Demo-critical (moment 1). |
| Two independent model vendors must agree (numeric rubric, 1.5 tolerance, outage routes to customer) | "No single AI decides money"; answers the obvious judge question "what if the AI is wrong or down" | MEDIUM | Claude + Gemini in parallel with structured JSON output. Show both score columns and an "agree" chip in the review panel. A "disable Gemini" demo toggle gives a free fourth beat showing graceful degradation. |
| Fraud gate before AI scoring (pHash reuse, edited-before, EXIF time window, geofence) | Directly addresses the trust gap in physical proof; none of the competitors verify proof | MEDIUM-HIGH | Demo-critical for moment 2. See evidence-feasibility notes below: pHash reuse is robust; GPS/EXIF is fragile on web. |
| "AI can only say yes" asymmetry, surfaced in UI | Clear, defensible framing for the "can photos really prove it?" judge question | LOW | Copy and verdict-log design, not code. Put a one-line "AI never refunds or penalizes" in the review panel and the pitch. |
| Before/after side-by-side review panel with per-item verdicts | Turns a black box into something a customer can audit in 20 seconds | MEDIUM | Primary design surface. Spend polish budget here. Demo-critical. |
| AI-written dispute brief for the judge | Cuts judge time; competitor disputes are manual reading of chat | LOW-MEDIUM | One LLM call over the pinned record. Demo-critical (moment 3). |
| Judge resolution builder with partial capture (split %) | Real PayPal partial capture + remainder released is a strong "tech implementation" proof | MEDIUM | Capture X% with `final_capture: true`; verify in sandbox that the remainder is released (the docs I fetched do not state this explicitly). Demo-critical. |
| Append-only verdict log with pinned inputs | Auditability; fixes Mappers' gap | LOW-MEDIUM | Insert-only table (no update/delete grants) + hash of inputs. Show as a timeline in the judge view. Searchable log in Elastic is optional. |
| Numeric working-proof from instrument readings | Turns the vague "does it look cold" into a computable check (supply vs return temperature delta) | MEDIUM | Worker photographs a dual-probe thermometer or one reading each at return and supply. A vision call extracts numbers; code computes delta and compares to a band. Deterministic, hard for a worker to bluff, and a strong C4 evidence source. |
| Worker-protection kill fee (30% on customer silence) | Upwork instead auto-releases everything after 14 days of silence (reported by a community moderator reply; Upwork's own docs not checked); Colony's partial fee is a more balanced middle | MEDIUM | Not required for any demo moment. See MVP section: defer. |
| Day-3 reauthorization sweeper | Shows deep knowledge of the PayPal authorization lifecycle | MEDIUM | See reauth warning below. Likely not demonstrable on real sandbox calls. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| AI-initiated refund, penalty, or worker ban on fraud flag | Seems like the logical end of fraud detection | Violates ground rule; one false positive on a pHash match harms a real worker; legal exposure | Flags only change the route to "customer sees warnings first" and appear in the judge brief |
| AI judging whether refrigerant charge is "correct" from a photo | Refrigerant check is a headline checklist item | A gauge photo cannot establish correct charge (needs ambient temp, line temp, superheat/subcool, equipment spec). Over-claiming will be exposed by any HVAC-literate judge | Verify "readings recorded and legible" with an OCR plausibility range; label the item "Refrigerant pressures recorded", not "charge correct" |
| Real-time worker GPS tracking ("en route" map) | Uber-style tracker looks impressive | Background location on a PWA is unreliable; large build cost for no payoff in the 3 moments | A worker "On my way" button producing a status event |
| Free-form multi-turn chat intake | Matches blueprint wording | Hard to polish, hard to test, long demo footage | Single-shot: photo + caption, AI prefills a form, asks follow-ups only for missing required fields |
| In-app chat between parties | Table stakes elsewhere | Large surface (storage, notifications, moderation) | Job notes + dispute statements + Zapier email |
| Ratings/reputation system | Standard on all competitors | Already out of scope; adds a whole review lifecycle (blind reviews, 7-day publish in Sharetribe) | Seeded read-only trust badges |
| Multi-trade support or "handyman" jobs | Bigger market claim | Breaks the uniform verification story; checklist templates multiply | One trade, one checklist template family |
| Reverse-image/stock-photo web search | In blueprint stage 2 | Needs an external API, adds latency and false positives; pHash reuse across your own index covers the demo | Defer; mention as roadmap in pitch |
| Detecting photos of screens / re-photographed prints | Natural next fraud vector | Unsolved-ish problem; time sink | Name it as a known limit: "uncertain cases route to a person" |
| Production-grade marketplace payments (multiparty / payee splits) | Looks "real" | Compliance-heavy and not sandbox-demonstrable | Payouts from platform balance, said explicitly in the pitch |
| Milestone / multi-visit jobs | Long jobs exist | Fights the 29-day authorization cap and multiplies state machine paths | Single-visit jobs only |
| Community judges, judge reputation | Decentralized feel | Not needed; extra auth and queue logic | Admin accounts as judges |

## Aircon Servicing: Realistic Checklist and Evidence

A standard residential tune-up (split or central) runs roughly 45-90 minutes. Utility rebate checklists and trade guides converge on the same core: filter, outdoor coil and fan, condensate drain, temperature split, refrigerant pressures, and electrical checks (amp draw, capacitor). HVACR School's 22-step maintenance process records temperature split, static pressure, amp draws, superheat and temperature differential, and notes that some items are visually verifiable (drain pan water, filter condition, condenser dirtiness, wiring). One guide notes some split systems have sealed service ports so pressure readings are not possible, so every instrument-dependent item needs an "N/A with reason" path.

The principle: evidence must be either (a) a visible state change, or (b) a legible numeric reading. Items that need neither (e.g., "tightened electrical connections") are not verifiable by photo and should not be on the contract.

| # | Checklist item | Required evidence | AI-verifiable? | Fraud resistance | In demo template? |
|---|---------------|-------------------|----------------|------------------|-------------------|
| 0 | Unit identity (anchor, taken at check-in) | Nameplate/data plate photo (model, serial) plus a wide shot of the outdoor unit and indoor unit | HIGH: OCR of model/serial; same unit appears in every later photo | Good; ties all photos to one physical unit and one job; reused-photo check hits here first | YES, as the "before" photo set |
| 1 | Replace or clean air filter | Before: dirty filter in the slot. After: clean filter seated, same camera angle, showing the arrow/size label | HIGH: dirty-to-clean change is obvious | Medium: stock filter photos exist; pHash vs past jobs and EXIF help | YES |
| 2 | Clean outdoor condenser coil | Before: fins with debris/dirt. After: same angle, visibly clean fins; optional wet/hose-in-use frame | HIGH: strongest visible change; best C2 "visible change" evidence | Medium-good: same-angle requirement defeats lazy reuse | YES |
| 3 | Flush/clear condensate drain line | After photo of drain pan clear (or before/after of pan), plus 5-10 s clip of water flowing at the drain termination | MEDIUM: flow is visible in video; "clear" is not provable from a still | Medium | YES, video clip doubles as the required video |
| 4 | Thermostat/system cycle test | Photo of thermostat showing set point below room temp and cooling active, plus a short clip of the outdoor fan/compressor starting | MEDIUM-HIGH: thermostat UI readable by vision; fan motion visible in keyframes | Medium | YES (merge with item 6 to keep list short) |
| 5 | Refrigerant pressures recorded | Photo of manifold gauges or meter screen with readings and ambient temperature; or "N/A: sealed system" with a photo of the unit | MEDIUM-LOW: OCR can read digits; judging correctness is not possible. Treat as "recorded and plausible range" | Medium; screens are easy to fake | OPTIONAL. Include as the "weakest" item to show honest limits, or omit from the demo template to keep the list tight |
| 6 | Temperature split (delta-T) | Photo of return-air and supply-air temperature readings after the unit has run several minutes (dual-probe display in one frame, or two timestamped photos). Typical healthy split is in the mid-teens °F (commonly cited ~14-22 °F, depends on humidity); MEDIUM confidence on the band, make it configurable | HIGH: OCR the two numbers, compute in code, compare to band | Good: numeric, plus timestamp inside the job window | YES; the best "working proof" item and a visible code-computed check |
| 7 | Evaporator coil/blower inspection | Photo of open access panel | LOW: often inaccessible or needs disassembly | Low | NO. Make it optional/"if accessible" in the real product |
| 8 | Electrical check (capacitor, contactor, amp draw) | Meter photo of amp draw / capacitor reading | MEDIUM via OCR | Medium | NO for demo; mention as roadmap |
| 9 | Site left clean | Final wide shot of work area (outdoor pad and indoor access area) with no tools/debris | MEDIUM: "no debris" is a judgement call, good for C5 | Medium | YES |

**Recommended demo template (6 items, ~13 uploads):** at check-in: nameplate + wide before photos; then filter, condenser coil, drain line (clip), thermostat/cycle (clip or photo), temperature split (numeric), site clean (one after-photo each). Plus one short "AC running, cold air at vent" clip required for C4. Keep the real-product item list for the pitch slide, with refrigerant and electrical items marked "worker certified, reading recorded".

### Evidence feasibility risks worth planning around (these affect features, not just pitfalls)

- **EXIF and GPS from a web PWA are unreliable (LOW confidence, verify on a real phone in week 1).** An in-app `getUserMedia` camera produces canvas/blob frames with no EXIF at all. Native-camera hand-off via `<input type="file" capture>` may keep EXIF time but is inconsistent on location across iOS and Android browsers. The blueprint's "original file uploaded with EXIF intact" may not hold. Recommended rule: capture device GPS and timestamp through the browser Geolocation API at the moment of capture, bound to a server-issued job nonce; treat EXIF as a bonus signal. Missing EXIF is "unknown", never a failure; present-and-contradicting EXIF is a failure.
- **Geofence in a demo.** The video will be recorded at a desk, not at a house. Seed the job address to where the builder is recording (or provide a demo-mode location override clearly labeled), otherwise check-in blocks the happy path.
- **pHash false positives.** Two genuinely different dirty-coil photos from the same angle can sit close in Hamming space. Use a threshold tuned on your seeded images, and compare against the seed photo you intend to "reuse" for moment 2. For the fraud demo, the worker upload must accept gallery images (the in-app-only camera would make reuse impossible to stage).
- **Video and model parity.** Gemini accepts video natively; Claude does not. "Same pinned evidence" means passing the same extracted keyframes to both (4-8 frames) and optionally the clip only to Gemini as a bonus. Note this in the verdict log so the evidence set is identical.
- **PayPal authorization timing conflict (verify in sandbox before designing the rework path).** PayPal's auth-capture guide says an authorization is valid 29 days with a 3-day honor period, that you can reauthorize after the honor period, "multiple times" within the 29 days, with a new authorization ID each time; capture can be less than or up to 115% / +$75 more than the original. PROJECT.md's note says reauthorization is allowed only once. The docs conflict between pages. Also: a reauthorize call before the honor period ends will not be accepted, so an admin "advance clock" button can only trigger *your* sweeper, not PayPal's clock. A day-3 reauth cannot be demonstrated live on a fresh sandbox authorization.

## Feature Dependencies

```
Auth + roles + seeded accounts
    └──requires──> everything below

Job posting (photo, address, window, aircon fields)
    └──requires──> Spec agent (checklist + price range)
                       └──requires──> Checklist review/approve UI
                                          └──requires──> PayPal AUTHORIZE checkout (hold)
                                                             └──requires──> Job state machine + ledger
                                                                                └──requires──> Webhook receiver (confirm hold/capture)

Job board + atomic accept ──requires──> hold confirmed (state: Open)
    └──requires──> Check-in (geofence + before photos + nameplate)
        └──requires──> Evidence ingest (original storage, EXIF read, keyframes, pHash)
            └──requires──> Checklist runner (per-item after photos + clip)
                └──requires──> Verification pipeline stage 0-1 (pin inputs, completeness)
                    ├──requires──> Integrity gate (pHash index, EXIF/GPS, time window)   [moment 2]
                    ├──requires──> Vision checklist check ──requires──> Dual-model rubric ──requires──> Router
                    └──Router ──requires──> Payment service: capture + Payout   [moment 1]

Review panel (approve / reject) ──requires──> pipeline outputs (verdicts, flags) + Router "ask customer" route
    └──requires──> Dispute open (items failed + statement)  [moment 3]
        └──requires──> Case summariser ──requires──> Judge console (one screen)
            └──requires──> Resolution builder ──requires──> Payment service: partial capture (final) + Payout

Verdict log ──enhances──> Judge console, review panel (auditable AI)
Elastic pHash index ──enhances──> integrity gate (Postgres bit-distance is the fallback)
Zapier ──enhances──> notifications (not a dependency)
Advance-clock ──requires──> Sweeper ──requires──> timers in state machine

Kill fee (30% non-final capture) ──conflicts-with──> simple judge split (remaining-balance math, two-capture ledger)
Day-3 reauth ──conflicts-with──> live demo (PayPal honor period cannot be advanced)
```

### Dependency Notes

- **Checklist before payment:** the hold amount and the checklist are agreed together, so spec agent + checklist UI must land before checkout. Checklist rows are also what stage 0 loads, so schema first.
- **State machine + ledger before anything PayPal:** every PayPal call needs an idempotency key tied to a transition, so build the transition table once and route all calls through it.
- **Evidence ingest before pipeline:** pHash and keyframes must be computed on upload, not at verification time, so the integrity gate and the reuse index (including seeded "past job" photos for the fraud demo) are ready.
- **Router "ask customer" is shared infrastructure:** moment 2 (fraud), outages, and below-bar scores all use the same review panel. Build it once and the fraud catch is mostly data (a reused photo) rather than new UI.
- **Judge split depends on a clean capture model:** keep judge outcomes to release / split / refund. Adding the kill fee means two captures per job and ambiguity about whether X% is of the total or of the remainder.

## MVP Definition

### Launch With (v1): what makes the three video moments convincing

**Moment 1, Happy path (book, hold visible in PayPal sandbox, proof, AI auto-release, capture and payout)**
- [ ] Auth, seeded customer/worker/judge, role switcher
- [ ] Job post: photo + caption + address + time window; AI prefilled form (single-shot)
- [ ] Spec agent: 6-item checklist + suggested price; customer edit/approve
- [ ] PayPal AUTHORIZE checkout, hold confirmed by webhook, visible in sandbox dashboard; "held, not charged" copy
- [ ] Job board (seeded), atomic accept
- [ ] Check-in with geofence (seeded location or labeled demo override) + nameplate + before photos
- [ ] Checklist runner: per-item after-photo + short working clip
- [ ] Pipeline stages 0-5 with both vendors in parallel; auto-release route; 3-attempt cap
- [ ] Capture full -> Payouts 95/5 -> ledger rows -> earnings screen showing the split
- [ ] Live status (polling/SSE) on both sides; Zapier email on release

**Moment 2, Fraud catch (reused photo flagged, routed to customer)**
- [ ] pHash on every upload; reuse check against a seeded index of past-job photos; Hamming threshold tuned
- [ ] Integrity gate result as structured flags (reused / edited-before / EXIF time out of window / GPS mismatch)
- [ ] Router "flag and ask" route: review panel with warnings first, AI scores still shown
- [ ] Gallery-upload path in worker app so the reuse can be staged
- [ ] Show matched original photo side by side with the new one ("matches job #12, 97% similar")

**Moment 3, Dispute (customer rejects, AI brief, judge splits, partial capture visible in sandbox)**
- [ ] Reject flow: select failed checklist items + statement
- [ ] Optional worker reply (single textbox; skip if tight)
- [ ] Case summariser brief
- [ ] Judge console, one screen: queue, brief, evidence pairs with EXIF/pHash info, resolution builder (release / split % / refund), verdict-log timeline
- [ ] Partial capture (final) -> payout of 95% of captured; remainder released; ledger; judge ruling is final and logged
- [ ] Refund = void

**Cross-cutting (cheap, high credibility)**
- [ ] Webhook signature verification + dedupe; idempotency keys; ledger rows for every money event
- [ ] Verdict log insert-only, with input hashes
- [ ] Cancel open job (void) and open-job expiry using the same code path
- [ ] "Customer approves anyway" override after a flagged result (needed for the case where the customer disagrees with the AI flag)

### Add After Validation (v1.x), only with spare days

- [ ] Customer-silence review window -> dispute escalation (without kill fee) and advance-clock admin button to show it
- [ ] Gemini-off toggle in admin to show outage fallback on camera
- [ ] Elastic pHash index + verdict search (keep Postgres as fallback; do not place Elastic on the critical path)
- [ ] SLA countdown badge in judge queue (visual only)
- [ ] Temperature-split numeric check as a deterministic guard on C4 (if not already in v1)
- [ ] Worker reply to dispute, agreement step ("both parties accept" button)

### Future Consideration (v2+)

- [ ] 30% kill fee on customer silence (two-capture accounting)
- [ ] Day-3 reauthorization and rework path (after confirming real PayPal behavior)
- [ ] Ratings and worker reputation
- [ ] Stock-image web check
- [ ] Refrigerant/electrical reading verification beyond OCR plausibility
- [ ] Multi-trade expansion, milestone holds, live marketplace payments

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| State machine + ledger + idempotent payment service | HIGH | MEDIUM | P1 |
| PayPal authorize / capture / void / Payouts + webhooks | HIGH | HIGH | P1 |
| Spec agent + checklist approval | HIGH | MEDIUM | P1 |
| Check-in + evidence capture (before/after/clip) | HIGH | MEDIUM-HIGH | P1 |
| Evidence ingest (EXIF, keyframes, pHash) | HIGH | MEDIUM | P1 |
| Integrity gate (pHash reuse, time window) | HIGH | MEDIUM | P1 |
| Dual-model rubric + router (numeric tolerance, outage fallback) | HIGH | MEDIUM | P1 |
| Review panel (before/after, verdicts, flags) | HIGH | MEDIUM | P1 |
| Judge console (brief, evidence, split) | HIGH | MEDIUM | P1 |
| Partial capture (judge split) | HIGH | MEDIUM | P1 |
| Verdict log (append-only) | MEDIUM | LOW | P1 |
| Seeded accounts + role switcher | HIGH | LOW | P1 |
| Cancel/expire -> void | MEDIUM | LOW | P2 |
| Zapier notifications (1-2 zaps) | MEDIUM | LOW | P2 |
| Earnings screen | MEDIUM | LOW | P2 |
| Temperature-split numeric check | MEDIUM | MEDIUM | P2 |
| Advance-clock + review-window escalation | MEDIUM | MEDIUM | P2 |
| Elastic pHash index / verdict search | LOW (for users), MEDIUM (sponsor) | MEDIUM | P2 |
| Gemini-off demo toggle | MEDIUM | LOW | P2 |
| Judge agreement step, worker dispute reply | LOW | MEDIUM | P3 |
| Kill fee (30%) | MEDIUM | MEDIUM-HIGH | P3 |
| Day-3 reauth | LOW (demo) | MEDIUM | P3 |
| Ratings/reputation | MEDIUM | HIGH | P3 |
| Stock-image check | LOW | MEDIUM | P3 |
| WebSocket hub, en-route tracking | LOW | MEDIUM-HIGH | Cut |
| In-app chat | MEDIUM | HIGH | Cut |

**Priority key:**
- P1: Needed for one of the three demo moments or for core integrity
- P2: Adds credibility or polish, build if days remain
- P3: Defer; mention in pitch roadmap

## Safe to Cut vs. Do Not Cut (blueprint review)

**Safe to cut or simplify now (no demo moment depends on them):**
- Ratings and reputation (already out)
- Stock/web image check (stage 2)
- Day-3 reauthorize and rework outcome (cannot be shown live; the rework path cannot reliably extend beyond the single authorization window; state "Rework" as out of scope and keep the judge to release/split/refund)
- 30% kill fee (two-capture accounting; not in any moment)
- Judge agreement step (judge ruling executes and is logged; avoids a third waiting state)
- WebSocket hub (use polling or SSE), live "worker en route" map
- Multi-turn chat intake (single-shot with follow-ups only for missing fields)
- Worker job-board filters beyond distance sort
- Elastic as a critical-path dependency (Postgres bit-distance works at demo scale; use Elastic as a write-through index for sponsor value)
- Mobile push; email via Zapier is enough
- Refrigerant/electrical readings as blocking checklist items

**Do not cut (the three moments break without them):**
- Webhook-confirmed hold and visible sandbox evidence (the PayPal proof the judges look for)
- Per-item checklist stored as rows and shown in the review panel
- Second model vendor and the numeric agreement logic (core innovation claim)
- pHash reuse detection with a seeded photo index and visual match display
- Partial capture on judge split and the sandbox view of it
- Insert-only verdict log (cheap and answers "who decided what")
- Role auth enforcement server-side (security question likely in Q&A)

## Competitor Feature Analysis

| Feature | TaskRabbit | Airtasker | Upwork (fixed-price) | Thumbtack / Angi | Sharetribe default | Our Approach |
|---------|-----------|-----------|----------------------|------------------|--------------------|--------------|
| Payment timing | Enter payment to book; not charged until task is done; may show temporary hold | Funds held in Airtasker Pay until released | Milestone funded into escrow | Mostly quote-and-pay off-platform or lead-fee model (MEDIUM; Angi supports booked-and-paid projects) | Stripe preauth at request, capture on completion; preauth valid 7 days, 90-day max hold | PayPal AUTHORIZE at booking, capture only after proof; 29-day cap |
| Who releases | Auto after task | Poster clicks "Release payment" after worker requests it | Client releases; auto-release after review period (reported 14 days, unconfirmed against Upwork docs) | N/A or platform-managed | Provider/operator completes; auto-complete timers | AI when highly confident; otherwise customer; otherwise judge |
| Proof of work | None (reviews) | None (messages, photos optional) | Work submissions, no machine verification | Reviews | None | Structured checklist + before/after + video + fraud gate |
| Dispute | Happiness Pledge, claim window reported as 14 days, exclusions noted by press | Free Dispute Resolution Service; funds remain in escrow during dispute | Dispute assistance | Guarantees with caps (reported; unverified) | Operator-defined | Judge console with AI brief, hold stays in place, split/refund/release |
| Trust signals | Ratings, badges, background checks | Ratings, badges, ID checks | JSS, reviews | Verified reviews, Approved badges | Blind reviews published after both review or 7 days | Evidence-based verdict log; seeded badges, no reviews |
| Messaging | Yes | Yes | Yes | Yes | Yes | Cut |
| Worker discovery | Browse Taskers | Offers on posted tasks | Proposals | Quotes from matched pros | Listings | Job board with accept (simpler, matches the held-payment flow) |

## Sources

- TaskRabbit support, Payment Policy and Payment Best Practices: https://support.taskrabbit.com/hc/articles/30621785849613 , https://support.taskrabbit.com/hc/en-ca/articles/30621881732749-Payment-Best-Practices (MEDIUM; Happiness Pledge claim window of 14 days and exclusions come from an NBC4 report, not TaskRabbit's own terms: https://www.nbclosangeles.com/news/local/taskrabbits-happiness-pledge-may-not-make-you-so-happy-attorney-says/3178625/?amp=1)
- Airtasker support, "When will I get paid" and dispute/escrow articles: https://support.airtasker.com/hc/en-us/articles/205276334-When-will-I-get-paid (MEDIUM; help pages disagree on who holds the escrow)
- Upwork fixed-price escrow and 14-day auto-release: https://community.upwork.com/t5/Freelancers/Client-is-delaying-payment-release-by-milestone-loophole/m-p/966700 (LOW-MEDIUM; community reply, not official docs)
- Thumbtack/Angi comparison coverage: https://www.toplinepro.com/blog/thumbtack-vs-angi , https://clark.com/save-money/thumbtack-review/ (LOW-MEDIUM; third-party blogs, guarantee figures unverified)
- Sharetribe transaction process and preauthorization docs: https://www.sharetribe.com/docs/concepts/transaction-process/ , https://www.sharetribe.com/docs/concepts/payment-methods-overview/ (MEDIUM-HIGH; official docs via search summary)
- PayPal authorize and capture guide (29-day validity, 3-day honor period, reauthorization, capture limits of 115% or +$75): https://developer.paypal.com/platforms/checkout/standard/customize/auth-capture.md (HIGH for stated facts; does not state `final_capture` semantics or a reauthorization count)
- HVACR School, residential AC maintenance process (22 steps, measurements, visually verifiable items): https://hvacrschool.com/residential-ac-maintenance-process (MEDIUM-HIGH; trade source)
- Utility and contractor tune-up checklists (filter, coil, drain, temperature split, refrigerant pressures, amp draw, sealed-port caveat): https://www.nipsco.com/docs/librariesprovider11/energy-efficiency/available-rebates/ac-tune-up-checklist.pdf , https://docs.idahopower.com/pdfs/EnergyEfficiency/business/retrofits/ACTuneUpChecklist.pdf , https://ecmservice.com/air-conditioning-tune-up-checklist/amp (MEDIUM)
- HVAC photo documentation practices (before/after same angle, nameplate, timestamped and geotagged): https://www.mangoapps.com/templates/forms/site-condition-before-and-after-documentation-form , https://oxmaint.com/industries/hvac/hvac-work-order-photo-documentation-for-hvac-service-teams (LOW; vendor marketing, statistics not relied on)
- Project documents: `.planning/PROJECT.md`, `.planning/BLUEPRINT.md`

---
*Feature research for: AI-verified held-payment gig marketplace (aircon servicing, US)*
*Researched: 2026-10-27*
