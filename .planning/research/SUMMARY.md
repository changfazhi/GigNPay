# Project Research Summary

**Project:** Pay-When-Done Marketplace
**Domain:** AI-verified, PayPal-authorization-held gig marketplace (aircon servicing, US, PayPal sandbox) — solo 1–2 week hackathon build
**Researched:** 2026-10-27
**Confidence:** MEDIUM-HIGH (package versions/API shapes HIGH; PayPal sandbox behavior, iOS camera metadata, Elastic bit-vector kNN, Zapier tier, SSE-on-Render MEDIUM/LOW — must be spiked)

Detail lives in STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md in this folder.

## Executive Summary

This is a held-payment marketplace with an AI proof-of-work verifier bolted onto the release decision. Held payments are table stakes (TaskRabbit, Airtasker, Upwork, Sharetribe all do it); the novelty is that photo/video evidence — not a human click — triggers release, and that AI can only say yes. Experts build this money-first: a single state machine as the sole status writer, a transactional outbox for every PayPal call with deterministic request ids, a webhook inbox that reconciles by re-fetching PayPal state, an append-only integer-cents ledger, and an async, resumable, pinned-input AI verifier that degrades to "ask the customer" on any failure. All on one Postgres, one Next.js 16 repo, two Render deployables (web + pg-boss background worker) — no Redis, no microservices.

Recommended approach: build the money skeleton first ending in a human-click release (so demo moment 1 works even if AI slips), then worker proof capture + evidence ingest, then the dual-model verifier + router, then sweeper + one-screen judge console for the dispute moment. Zapier and Elastic are write-behind projections done last; Postgres is the decision source. Scope = the three scripted video moments; cut in-app chat, ratings, WebSockets, en-route tracking, stock-image search, rework; recommend cutting the kill fee and the live day-3 reauth demo.

Key risks are places where PROJECT.md assumes vendor behavior that does not exist: PayPal reauthorization cannot happen at day 3 and may be once-only; iOS strips EXIF GPS from camera uploads so the integrity gate cannot hard-require it; Claude 5.5 models reject `temperature` and forced `tool_choice`; Render free tier would sleep through webhooks and delete the DB in 30 days. Six half-day spikes in Phase 1 convert the remaining unknowns into facts.

## Corrections to PROJECT.md

Research contradicts or refines these PROJECT.md assumptions. Roadmap and requirements must use the corrected form.

| PROJECT.md says | Research finding | Corrected design |
|---|---|---|
| "Reauthorize at day 3" | PayPal allows reauthorization only AFTER the 3-day honor period — earliest day 4; earlier calls fail `REAUTHORIZE_NOT_ALLOWED`. | Sweeper rule: auth age ≥ 3d 2h, retry hourly for a day on failure. Timer named "reauth window opens day 4". |
| Reauth "only once" (to verify) | PayPal pages conflict: Payments v2 operation text says multiple; `reauthorize_request` schema and "Extend an authorization" guide say once. LOW–MEDIUM. | Design for exactly ONE reauth as the guarantee. Model an `authorization_chain` (auth_id, parent_auth_id, honor_expires_at, reauth_count); always capture against the latest id. Reauth returns a new id; amount cap 115% / +$75 US. |
| "Jobs must complete within 29 days" | 29 days is the outer cap; guaranteed hold ≈ 3 days + one reauth (~7 days). Post-honor capture is "subject to risk and money availability". | Promise a 7-day job lifetime. Build a "Re-confirm your hold" fallback (void old auth, new order with new `invoice_id`). Rework cannot extend the hold → cut rework from v1. |
| "EXIF + device GPS within 300 m" gate; "in-app camera, original file with EXIF intact" | `getUserMedia`+canvas yields zero EXIF; iOS WebKit strips GPS (sometimes time) on camera-path file inputs (WebKit 257534/263192, MEDIUM). Strict gate blocks every iPhone worker and makes auto-release unreachable. | Three-state checks (pass / fail / unverifiable). Primary signals server-observed: server-issued capture nonce, presign→complete time window, `navigator.geolocation` fix with accuracy, accuracy-aware 300 m geofence at check-in. EXIF corroborates only when present; missing = neutral, present-and-contradicting = hard flag. |
| Kill fee: 30% non-final capture on 2 h silence, worker paid, rest to judge | Payouts to claimed items cannot be clawed back → a later refund means platform eats the loss; split X<30% needs a refund; max captures/auth undocumented; no demo moment needs it. | Defer kill fee from v1. If built: capture 30% `final_capture=false` but HOLD the payout until resolution; delta algorithm at resolution (`target − captured_total`: capture delta final / void if zero / refund if negative); cap 2 captures; no rework after any capture. v1: review-window expiry escalates to dispute with hold intact. |
| Admin "advance clock" demos day-3 reauth | Moves only the app clock, never PayPal's; a real reauth on a fresh auth will be refused. | Clock offset affects only app timers. Show reauth only with a seeded auth aged ≥5 real days, labelled "real PayPal clock", else drop the beat. `PAYPAL_REAUTH_MODE=simulate` only as a clearly labelled last resort. |
| Live tracker over "WebSocket/live updates" | Next route handlers cannot upgrade to WebSocket. | SSE route handler fed by Postgres LISTEN/NOTIFY, `Last-Event-ID` replay, 5 s polling fallback. |
| Stock/web image check in Stage 2 | No provider in stack; Claude explicitly cannot detect AI/stock images. | Defer. Pitch exact-reuse + near-dup hash + challenge capture. Optionally seed Elastic with ~12 `source: stock` hashes for a deterministic demo. |
| Thresholds avg ≥ 8 / none < 6 / within 1.5 with "pinned prompt" | Two vendors calibrate differently → pass rate may be ~0. Claude 5.5 returns 400 on `temperature`/`top_p`/`top_k` since 2026-10-21. | Thresholds are config defaults tuned on a 10–20 pair calibration set (target ≥80% auto-release on demo-quality photos over 3 runs). Reproducibility = stored prompt + evidence hashes + model ids + raw output, verdict keyed by pinned-input hash. |
| Hosting on Render (app, worker/sweeper, Postgres) | Free web sleeps after 15 min; free Postgres expires at 30 days (+14 grace); workers/cron have no free tier; Render has no object store. | Paid Starter web + Starter background worker + smallest paid Postgres from day 1 (~$15–30/mo). Cloudflare R2 for objects. |

Smaller flags: "after vs before too similar" pHash will false-positive on honest cleaning — use a very tight threshold (≤2, byte-level dup) for that check and a calibrated one (~≤5, store rotations/mirror) for cross-job reuse. "Held, not charged" copy is slightly off — PayPal shows a pending authorization; say "held for up to N days".

## Key Findings

### Recommended Stack

Next.js 16.4.3 (React 19.3.1, App Router, Node runtime on all money/webhook/SSE routes; `proxy.ts` replaces middleware; do not enable Cache Components) + TypeScript pinned ~5.9.3 (7.x breaks typescript-eslint) + Drizzle 0.45.4 on Postgres 18 (Render) via `pg` + Better Auth 1.7.14 + Zod 4 + pg-boss 12 in a separate Render Background Worker run with `tsx`. Node 22.12+ required. Pin exact versions.

**Core technologies:**
- **Drizzle + pg** — SQL-shaped, no codegen; suits conditional-UPDATE state machine, `FOR UPDATE`, append-only triggers. Avoid Prisma 8 RC.
- **Better Auth (admin plugin)** — roles customer/worker/judge (+ hidden admin); demo role switcher = `DEMO_MODE`-gated server action signing into seeded accounts.
- **pg-boss** — queues (ingest, verify, sweeper, notify) in the same Postgres; money executor stays on the explicit `payment_commands` table.
- **`@paypal/paypal-server-sdk` 2.5.0** (Orders + Payments) + ~100 lines raw fetch for **Payouts** and **verify-webhook-signature** (not in SDK) — all in one module. **`@paypal/react-paypal-js` 10.6.1** via `sdk-v6` subpath; legacy `PayPalScriptProvider` (`intent: "authorize"`) as fallback.
- **Cloudflare R2 via AWS S3 SDK** — presigned PUT/GET (CORS required), private bucket, SHA-256 at ingest.
- **`@anthropic-ai/sdk` 1.3.0** (`claude-opus-5-5` judge, `claude-sonnet-5-5` intake/spec; structured outputs via `output_config.format`; no temperature, no forced tool_choice, no server-side fallbacks) + **`@google/genai` ~2.31.0** (stay <3.0) with `gemini-3.8-flash` (verify id via `models.list()` at startup). Model ids in env, written to every verdict row.
- **Evidence:** `sharp` 0.35.5 (always `.rotate()`), `sharp-phash` 2.2.0 → `bit(64)` with Hamming via `bit_count(a # b)`, `exifr` 7.1.3 read before any resize, `ffmpeg-static` + `execFile` (not `fluent-ffmpeg`), one job at a time on 512 MB.
- **Maps/UI:** Leaflet 1.9.4 + react-leaflet 5, `earthdistance` for the job board, 10-line haversine geofence shared client/server; Tailwind 4 + shadcn; TanStack Query with SSE invalidation.
- **Sponsors:** Elastic 9.x client as write-behind projection (pHash bit index + verdict search); Zapier Catch Hook from a notification outbox (premium app — trial/paid plan).

Critical constraints: Claude and Gemini get the same extracted JPEG keyframes (Claude has no video, no HEIC). Prebuilt `sharp` cannot decode HEVC HEIC — mark `needs_conversion`, ask retake.

### Expected Features

**Must have (table stakes — all demo-critical):**
- Auth + roles + seeded customer/worker/judge + role switcher
- Job post: photo, caption, address pin, date + time window, aircon fields (system type, unit count, access notes); single-shot AI-prefilled intake; suggested price range with 5% fee shown
- Checklist-as-priced-contract: spec agent drafts 6 items → customer edits/approves → frozen on worker accept, stored as rows
- PayPal AUTHORIZE checkout with webhook-confirmed hold visible in sandbox
- Job board by distance, atomic accept, check-in with geofence (seeded location or labelled demo override) + nameplate + before photos
- Checklist runner: per-item after-photos + short working-proof clip
- Status tracking both sides; review panel (before/after, per-item verdicts, flags) with approve / reject / approve-anyway; cancel / expire → void
- Dispute: reject with failed items + statement, AI brief, one-screen judge console, resolution builder (release / split % / refund) with partial capture visible in sandbox
- Earnings + receipts from ledger; Zapier email on key events; seeded read-only trust badges

**Should have (differentiators):**
- AI auto-release on verified proof; two-vendor agreement (1.5 tolerance, outage → customer); "disable Gemini" demo toggle
- Fraud gate before scoring: pHash reuse against seeded index with side-by-side match; EXIF/GPS as three-state signals
- "AI can only say yes" as a property of the transition table
- Append-only verdict log with pinned input hashes; AI dispute brief
- Numeric working proof: dual-probe delta-T OCR, computed in code against a configurable band; checklist items must be visually decidable (never "refrigerant charge correct")

**Defer (v2+) / cut:** Kill fee, reauth demo + rework, ratings, stock-image check, multi-trade, milestone holds, live payments, refrigerant/electrical verification. Cut outright: in-app chat, WebSocket hub, en-route GPS tracking, multi-turn chat intake (single-shot with 3-follow-up cap), job-board filters beyond distance, judge agreement step, Elastic on the critical path.

Demo template: 6 checklist items (filter, condenser coil, drain line clip, thermostat/cycle, delta-T numeric, site clean) + nameplate anchor + short "cold air at vent" clip ≈ 13 uploads.

### Architecture Approach

One repo, two deployables, one Postgres as the only integration bus. Route handlers are thin adapters; `dispatch(jobId, event, actor)` is the only writer of `jobs.status` (single function + DB trigger + lint rule). Hold-creating effects (authorize) precede the transition; money-moving effects (capture/void/refund/payout) follow it via a committed outbox row with a UUIDv5 request id derived from (job, kind, seq), with results posted to the ledger in a second transaction. Webhooks are persisted, deduped on event id and reconciled by GET. Time comes from an injectable clock + `job_timers` table fired by an idempotent minute sweeper through the same `dispatch`. Verification is a persisted, resumable pipeline keyed by `{jobId, runId}` with pinned evidence ids + hash, both vendors via `Promise.allSettled`, a pure exhaustively tested `route()`, and degrade-to-ask-customer on any failure.

**Major components:**
1. **Job state machine + transition table (data)** — actor/relation authz, timers and effects in one tx, `pg_notify` on commit
2. **Payment service** (`paypal-client.ts` sole egress) — `payment_commands` outbox, executor (concurrency 1, inline-then-sweep), integer-cent settlement on cumulative captures, ledger writer
3. **Webhook inbox** — raw-body verify, dedupe, fetch-and-compare reconcile, quarantine impossible events
4. **Evidence ingest** — presigned direct upload of immutable originals → worker: SHA-256 → EXIF → pHash → derivatives/keyframes
5. **Verification engine** — stages 0–5 persisted, model gateway, pure router, append-only `verdicts`
6. **Sweeper + clock** — idempotent timers (open expiry, review window, dispute SLA, verifying timeout, reauth window), admin clock offset + timers panel
7. **Realtime hub** (one LISTEN connection, SSE with replay) + notifier outbox (Zapier) + Elastic projector

### Critical Pitfalls

1. **Reauth timing/count** — earliest day 4, maybe once only; advance-clock cannot move PayPal's clock. Avoid with authorization chain, 7-day job promise, re-confirm-hold fallback, Phase 1 spike.
2. **Non-crash-safe money step** — PayPal idempotency returns current status, not the original response; retention unpublished. Outbox with intent rows, deterministic ids, reconcile-by-GET before any retry; resolve stale `in_flight` on startup/sweep; handle `ORDER_ALREADY_AUTHORIZED`; pay only on capture `COMPLETED`; single money function under `FOR UPDATE`.
3. **Webhook receiver** — parse-then-verify breaks signatures; simulator events can't verify; sandbox needs public HTTPS. `request.text()` first, never disable verification in deployed app, dedupe on event id, advance UI from synchronous responses not webhooks, deploy to Render in Phase 1.
4. **EXIF-built integrity gate** — fails every iPhone and kills auto-release. Server-observed signals first, three-state results, real iPhone + Android test, calibrate pHash on real pairs, normalise HEIC/video server-side.
5. **Judge never auto-releases or is fooled** — strict two-vendor conjunction rarely passes; both injectable via text in photos. Calibration set before freezing thresholds; schema validation with one repair retry (failure = outage); identical JPEG keyframes; `instructional_text_in_media` flag forcing flag-and-ask; captions excluded from scoring prompt; injection regression fixture; short undo window before capture.
6. **Hosting traps** — free tier, no object store, DB expiry, ffmpeg presence, SSE buffering. Paid services from day 1 + R2; `which ffmpeg` and SSE heartbeat smoke test on the deployed box in Phase 1.

Also: kill-fee/split/refund math (integer cents, delta algorithm, cap 2 captures); Payouts sandbox enablement (Merchant app with Payouts, funded business balance, sandbox personal accounts for workers or items go `UNCLAIMED`, deterministic `sender_batch_id`); checklist drift (freeze on accept); Zapier/Elastic must never block a transition.

## Implications for Roadmap

Suggested structure: **7 phases.** Merges ARCHITECTURE's steps 0–10 and pulls the sweeper, clock, judge console and partial-capture split forward from the blueprint's stretch Phase 4, because video moments 2 and 3 need them. PITFALLS labels map: P1 = phases 1–2, P2 = phase 4, P3 = phase 5, P4 = phases 6–7.

### Phase 1: Foundation, Deploy & Spikes
**Rationale:** Downstream work is blocked by vendor facts and a public URL (webhooks need Render; SSE/ffmpeg on Render unknown; reauth/capture semantics shape the ledger).
**Delivers:** repo, Drizzle migrations (extensions, append-only triggers), paid Render web + worker + Postgres, R2 bucket with CORS, Better Auth with seeded users + `DEMO_MODE` role switcher, hello + SSE heartbeat route + ffmpeg smoke test; PayPal sandbox accounts (platform business with Payouts, buyers, worker personal accounts, topped-up balance), webhook registered on the Render URL. Written spike results: S-PAY (immediate reauth, second reauth, partial capture → second capture → void remainder, Payout), S-CAM (iPhone/Android EXIF survival on file-input capture; presign round trip), S-ES (Elastic bit kNN from Render), S-LLM (both vendors return schema-valid scores on the same 4 JPEGs; timing), S-ZAP (Catch Hook allowed), S-SSE (stream survives >60 s with heartbeats).
**Avoids:** Pitfalls 14, 18, 1/2 (spike), 21.

### Phase 2: Money Skeleton (kernel, payments, webhooks, human-click release)
**Rationale:** The PayPal story must be real before anything else; ending with a human-click release means moment 1 survives an AI slip.
**Delivers:** clock, `jobs`/`job_events`/`job_timers`/ledger tables, `transitions.ts` + `dispatch()` with DB trigger and concurrent-accept test; `payment_commands` outbox + executor + `paypal-client`; server-side order create (`intent: AUTHORIZE`, `custom_id`, per-attempt `invoice_id`) → authorize with amount/currency check → `HOLD_CONFIRMED`; cancel/expire → void; webhook inbox (verify, dedupe, reconcile); capture (`final_capture=true`) → Payout 95/5 only on `COMPLETED`; settlement math tests; worker earnings from ledger; authorization chain model; seeded job with hard-coded checklist.
**Avoids:** Pitfalls 1, 3 (ledger shape), 4, 5, 6, 7, 15, 16, 20.

### Phase 3: Job Lifecycle (intake, checklist contract, board, accept, check-in, live tracker)
**Rationale:** Needs the machine and a confirmed hold; checklist rows must exist before the verifier and before checkout copy is final.
**Delivers:** job posting with scheduling + aircon fields; single-shot intake agent with form fallback; spec agent → 6-item visually decidable checklist + price range (fixed-template fallback); customer edit/approve, version frozen on accept; job board by distance; atomic accept with hold check; accuracy-aware geofence check-in with demo override; SSE tracker with polling fallback; seeded demo jobs; polished customer/worker screens.
**Avoids:** Pitfalls 15, 19, 12 (decidable items), 8 (geofence accuracy).

### Phase 4: Evidence Capture & Integrity Gate
**Rationale:** The fraud moment and the verifier both depend on trustworthy, pre-computed evidence facts.
**Delivers:** presign/finalize endpoints, native-camera file input + gallery path (to stage reuse), server capture nonce + device GPS recording; ingest worker (SHA-256, EXIF before resize, pHash `bit(64)`, derivatives, ffprobe, keyframes, 720p proxy); checklist runner + completeness guard; integrity gate with a documented pass/fail/unverifiable truth table; pHash reuse vs seeded index with side-by-side match; thresholds calibrated on 20+ pairs; HEIC handling; non-blocking Elastic write-through projector.
**Avoids:** Pitfalls 8, 9, 12.

### Phase 5: AI Verification & Routing (moments 1 and 2)
**Rationale:** Depends on evidence and the payment loop; happy path and fraud catch share the review panel and router.
**Delivers:** pg-boss `verify` queue, stages 0–5 persisted/resumable; model gateway (Opus 5.5 judge + Gemini 3.8 flash, timeouts, one retry, schema validation, repair retry) with identical keyframe sets; pure `route()` with exhaustive table test; delta-T OCR check; prompt-injection defenses + fixture; review panel (side-by-side, per-item verdicts) with approve / reject / approve-anyway; short undo window before capture → auto-release capture + payout; 3-attempt cap; verifying-timeout rule; Gemini-off toggle; calibration run before freezing thresholds; append-only verdict log.
**Avoids:** Pitfalls 10, 11, 13.

### Phase 6: Timers, Disputes & Judge Console (moment 3)
**Rationale:** Needs machine, payments and review panel; sweeper must land before disputes.
**Delivers:** idempotent sweeper, admin clock offset + timers panel (reauth labelled "real PayPal clock"); open-expiry void; review-window escalation to dispute (no kill fee in v1); reject flow with failed items + statement; AI case brief; one-screen judge console + resolution builder (release / split via delta algorithm / refund via void); partial capture visible in sandbox; ledger consistency scenario tests; payout-failed/unclaimed worker prompt; re-confirm-hold fallback screen.
**Avoids:** Pitfalls 1, 2, 3, 16.

### Phase 7: Sponsors, Hardening & Demo
**Rationale:** Zapier and Elastic are sponsor requirements but must stay off the critical path; demo fragility is the final risk.
**Delivers:** Zapier notifier (1–2 zaps) from the outbox; Elastic verdict search panel; demo-reset script (restore seeds, void open auths); aged-auth seed if the reauth beat is kept; known-good/known-bad photo sets; empty/error states; two full dress rehearsals on the deployed URL; spare takes and fallback clips.
**Avoids:** Pitfalls 17, 18, hackathon scope creep and demo fragility.

### Phase Ordering Rationale

- Dependency chain: auth/deploy → kernel/payments → job lifecycle → evidence → AI → disputes. Checklist and hold must exist before verification; evidence facts before the integrity gate; review panel and router shared by moments 1 and 2.
- A human-click capture + payout lands in Phase 2, so the PayPal proof is real even if AI slips.
- Sweeper and judge are pulled into Phase 6 (before polish) rather than left as stretch.
- No new feature after the dispute moment works until the full video has been recorded end to end once.
- Schedule-protecting cuts: chat, ratings, WebSockets, en-route map, stock check, kill fee, rework, live reauth demo (unless an aged seed is available).

### Research Flags

Phases needing deeper research (`/gsd-plan-phase --research-phase <N>`):
- **Phase 1:** live spikes rather than reading — PayPal reauth/partial-capture/Payouts sandbox behavior, iPhone/Android EXIF, Elastic bit kNN, SSE on Render, Zapier eligibility.
- **Phase 2:** v6 JS button in sandbox, request-id retention, capture `PENDING` handling, max captures per authorization (informed by Phase 1 spikes).
- **Phase 4:** current iOS GPS-stripping status, HEIC/HEVC handling, pHash calibration.
- **Phase 5:** current Gemini/Claude rate limits and structured-output specifics for the exact model ids; calibration methodology.

Phases with standard patterns (skip research-phase):
- **Phase 3:** CRUD, maps, atomic accept via the machine, SSE (once Phase 1 confirms it).
- **Phase 6:** logic defined by Phases 1–2 (delta algorithm, timers); no new vendor surface beyond partial capture/refund already spiked.
- **Phase 7:** thin Zapier/Elastic projections, given Phase 1 spike results.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH | Versions read from npm registry 2026-10-27 (HIGH); vendor behavior MEDIUM; Gemini model ids, Elastic bit kNN on serverless, Zapier tier, Render limits/prices LOW until spiked |
| Features | MEDIUM | Competitor behavior via help centers/search summaries; HVAC checklist cross-checked against trade sources; photo/iOS/PWA feasibility reasoned (LOW) |
| Architecture | MEDIUM-HIGH | Patterns (state machine, outbox, inbox, ledger, resumable pipeline) are established practice (HIGH); PayPal-specific details tagged [VERIFY], collected in spikes S1–S8 |
| Pitfalls | MEDIUM-HIGH | PayPal facts checked against current docs, but docs contradict each other on reauth count; sandbox honor-period enforcement, max captures and Payouts UNCLAIMED rules undocumented |

**Overall confidence:** MEDIUM-HIGH — the design is sound and well sourced; remaining risk sits in PayPal sandbox behavior and mobile camera metadata, both resolved by Phase 1 spikes.

### Gaps to Address

- **Reauth count / sandbox enforcement:** run S-PAY first; design for once even if sandbox allows more, and document actual behavior.
- **Max captures and final-capture-releases-remainder:** unverified; cap 2 in code; verify `final_capture=true` releases the remainder and void after a non-final partial capture ends further captures.
- **Camera capture approach conflict:** STACK/ARCHITECTURE recommend native-camera file input; PITFALLS leans to in-app `getUserMedia` + server signals. Recommendation: `<input capture="environment">` as primary (EXIF survives on Android/desktop; gallery path needed to stage reuse) with nonce + device GPS as primary signals. Settle with S-CAM; don't mix.
- **pHash thresholds:** sources give ≤2, ≤5, ≤10 for different purposes — set from the calibration distribution, store in config.
- **Payout timing vs capture state:** pay only on capture `COMPLETED`; confirm sandbox capture latency in Phase 2.
- **Elastic and Zapier eligibility/cost:** confirm sponsor rules and plan tier early; if unavailable, keep outbox/projector and swap the sink.
- **Render pricing and SSE duration limits:** budget ~$15–30/mo; 15 s SSE heartbeat and reconnect-safe client.
- **Payouts fee drag:** per-item payout fee may exceed the 5% margin — don't claim 5% as profit in the pitch.
- **Legal framing:** don't claim licensed escrow; answer as in blueprint section 10.

## Sources

### Primary (HIGH confidence)
- npm registry (2026-10-27): versions, dist-tags, peers, engines; unpacked tarballs of `@paypal/paypal-server-sdk`, `@paypal/react-paypal-js`, `@google/genai`, `sharp-phash`, `exifr`, `pg-boss`
- PayPal Payments v2 and Payouts v1 OpenAPI schemas and webhook event-names page (fetched 2026-10-27), including the reauthorize contradiction
- PayPal Orders v2 create, Payments v2 reauthorize/capture/void, REST idempotency, webhooks integration + simulator
- Claude API model/API-drift tables; Anthropic vision docs; Gemini video/files/image-understanding docs
- Render WebSocket docs; pg-boss docs

### Secondary (MEDIUM confidence)
- Next.js 16 release post and route handler reference; Better Auth admin + Next.js docs; Cloudflare R2 presigned URL/pricing/CORS; Elastic `dense_vector` 9.0; Render free tier, Postgres, extensions, cron docs
- PayPal authorization guide and "Extend an authorization" guide (conflict on reauth count); Payouts guides
- TaskRabbit, Airtasker, Sharetribe docs; HVACR School and utility tune-up checklists; WebKit bugs 257534/263192; W3C Image Capture privacy note

### Tertiary (LOW confidence — needs validation)
- Render SSE community threads; Google Cloud Vision pricing summaries; Zapier premium-app tier; Upwork auto-release and TaskRabbit claims window; HVAC vendor photo guides; Bing/TinEye status
- Not directly verified: sandbox honor-period enforcement, max captures per authorization, Elastic bit kNN on serverless, `sharp` HEIC decoding, `gemini-3.8-flash` availability for the user's key

---
*Research completed: 2026-10-27*
*Ready for roadmap: yes*
