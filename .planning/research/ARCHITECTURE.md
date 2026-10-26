# Architecture Research

**Domain:** AI-verified, PayPal held-payment gig marketplace (escrow-style marketplace with an async AI verification pipeline)
**Researched:** 2026-10-27
**Confidence:** MEDIUM-HIGH. The structural patterns (state machine as sole writer, outbox, ledger, webhook inbox, pipeline-as-job) are well-established and HIGH. PayPal-specific behaviours that I could only partly confirm from docs are tagged **[VERIFY]** and collected in "Spikes to run" at the end. Do not treat a **[VERIFY]** item as settled.

---

## Standard Architecture

### The one-sentence shape

One Next.js repo, two deployables (web + worker) that share the same `src/server` domain code and the same Postgres. Postgres is the only integration bus: transitions, outbox rows, queue jobs, realtime fan-out (`NOTIFY`), and the injectable clock all live there. No Redis, no separate microservices.

### System Overview

```
 Browser (PWA, 3 roles)                         PayPal (sandbox)
   |  REST (fetch)   ^ SSE (+poll fallback)       ^        |
   v                 |                            |        | webhooks (signed)
┌──────────────────────────────────────────────────┼────────v─────────────────┐
│ RENDER WEB SERVICE: Next.js (route handlers = thin adapters)                  │
│  /api/jobs/*  /api/evidence/*  /api/disputes/*  /api/admin/*  /api/stream     │
│  /api/webhooks/paypal                                                         │
│        │ every mutation goes through ↓            ▲ LISTEN job_events (1 conn)│
│  ┌─────▼───────────────────────────────────────┐  │                           │
│  │ server/jobs/machine  (ONLY status writer)   │  │                           │
│  │  authorize(actor) → guard → UPDATE → append │  │                           │
│  │  job_events + enqueue effects, one tx       │  │                           │
│  └─────┬───────────────────────────────────────┘  │                           │
└────────┼──────────────────────────────────────────┼───────────────────────────┘
         │ SQL                                      │ pg_notify on commit
┌────────▼──────────────────────────────────────────┴───────────────────────────┐
│ POSTGRES (Render): domain tables + payment_commands (outbox) + webhook_events  │
│  + ledger + verification_* + job_timers + app_clock + pgboss schema            │
└────────▲──────────────────────────────────────────▲───────────────────────────┘
         │ SKIP LOCKED / pg-boss                    │ reads evidence by key
┌────────┴──────────────────────────────────────────┴───────────┐   ┌───────────┐
│ RENDER BACKGROUND WORKER: same codebase, `worker/index.ts`     │   │ Object    │
│  1 payment-command executor (poll 2s, concurrency 1 per job)   │──▶│ storage   │
│  2 sweeper (pg-boss cron * * * * * + admin trigger)            │   │ (S3/R2)   │
│  3 verification pipeline (pg-boss queue `verify`)              │   └───────────┘
│  4 evidence ingest (pg-boss queue `ingest`)                    │
│  5 notifier (Zapier/email outbox), elastic projector, reaper   │──▶ Anthropic, Gemini,
└────────────────────────────────────────────────────────────────┘    Zapier, Elastic
```

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| Route handlers (`app/api/**`) | Parse session into an `Actor`, zod-validate, call exactly one domain function, map errors to HTTP. No business logic, no direct `UPDATE jobs`. | Next.js route handlers, `runtime = 'nodejs'` |
| Job state machine (`server/jobs/machine`) | The only code that changes `jobs.status`. Takes `(jobId, event, actor, payload)`, locks the row, checks the transition table, actor relation and guards, writes the new status, appends `job_events`, schedules/cancels `job_timers`, inserts `payment_commands` and queue jobs, fires `pg_notify`. All in one transaction. | Plain TS table + one `dispatch()` function + DB trigger as backstop |
| Payment service (`server/payments`) | The only module that imports the PayPal client. Owns the `payment_commands` outbox, executor, deterministic request ids, settlement math, ledger posting. | Outbox table + polling executor in worker, inline attempt from web for user-waiting calls |
| Webhook inbox (`server/webhooks`) | Verify signature, persist raw event, dedupe on PayPal event id, ack fast, reconcile against our own rows by fetching the resource from PayPal. | Route handler + `webhook_events` table + reaper |
| Ledger (`server/ledger`) | Append-only balanced entries. Written only by the payment service on confirmed PayPal facts. Earnings screens read from it. | `ledger_transactions` + `ledger_entries`, deferred balance trigger |
| Sweeper (`server/sweeper`) | Fires due `job_timers` through the machine with `actor = system`. Takes `now` as a parameter, never reads the wall clock itself. | pg-boss cron + admin "advance clock" trigger |
| Clock (`server/clock`) | `clock.now()` = real time + `app_clock.offset_seconds`. Injected everywhere a deadline is computed or compared. | One-row table, 1 s in-process cache |
| Evidence ingest (`server/evidence`) | Signed-URL upload of immutable originals, then server-side sha256, EXIF, pHash, keyframes, derivatives. | pg-boss `ingest` queue, `sharp`, `exifr`, `ffmpeg-static` |
| Verification engine (`server/verify`) | Stages 0-5, takes a job id only, persists every stage, resumable. | pg-boss `verify` queue, stage functions, pure `route()` |
| Model gateway (`server/ai/models`) | Uniform call interface for Claude and Gemini with timeout, retry budget, schema-validated output. | Anthropic SDK + Google GenAI SDK behind one `scoreRubric()` interface |
| Realtime hub (`server/realtime`) | One `LISTEN` connection per web instance, fan-out to SSE subscribers, replay from `job_events` on reconnect. | `pg` client + in-memory map |
| Notifier (`server/notify`) | Reads `notifications` outbox, posts to Zapier catch-hook, marks delivered. | Worker loop |

## Recommended Project Structure

```
src/
├── app/                       # Next.js App Router
│   ├── (customer)/ (worker)/ (judge)/ (admin)/   # role UIs (one PWA)
│   └── api/
│       ├── jobs/[id]/{accept,checkin,submit,approve,reject,cancel}/route.ts
│       ├── evidence/{presign,[id]/finalize}/route.ts
│       ├── disputes/[id]/{propose,accept,resolve}/route.ts
│       ├── paypal/{create-order,authorize-order}/route.ts   # user-waiting calls
│       ├── webhooks/paypal/route.ts
│       ├── stream/route.ts                                    # SSE
│       └── admin/{clock,demo-reset,switch-role}/route.ts
├── server/                    # ALL domain code; imported by web AND worker
│   ├── db/                    # drizzle schema, migrations/*.sql, tx helper
│   ├── clock/
│   ├── auth/                  # session -> Actor, relation checks
│   ├── jobs/
│   │   ├── machine.ts         # dispatch()
│   │   ├── transitions.ts     # the table (data, not code)
│   │   └── guards.ts          # hold_valid, attempts_left, window_open...
│   ├── payments/
│   │   ├── paypal-client.ts   # ONLY file that talks HTTP to PayPal
│   │   ├── commands.ts        # enqueue + executor + result handlers
│   │   ├── settlement.ts      # pure integer-cents math (tested)
│   │   └── request-id.ts
│   ├── ledger/
│   ├── webhooks/
│   ├── sweeper/
│   ├── evidence/              # presign, ingest, fraud primitives (phash, exif)
│   ├── verify/                # stages/0..5.ts, route.ts (pure), pipeline.ts
│   ├── ai/                    # intake, spec, vision, rubric, case-summary, models/
│   ├── disputes/
│   ├── realtime/
│   └── notify/
├── worker/index.ts            # boots pg-boss, executor loop, sweeper, handlers
└── lib/                       # shared types, zod schemas, constants
```

### Structure Rationale

- **`server/` is the product; `app/api` and `worker/` are adapters.** The worker imports the same `machine.dispatch`, so a sweeper-fired transition and a customer-fired one take exactly the same path and the same guards.
- **`paypal-client.ts` is the single egress.** Enforce with an ESLint `no-restricted-imports` rule: nothing outside `server/payments` may import it. This is how "payment service is the only PayPal caller" stays true after week one.
- **`transitions.ts` is data.** The table drives the machine, the DB guard seed, the docs, and the exhaustive unit test. One source of truth.
- **Build the worker with the same tsconfig, bundle with `tsx`/`esbuild`** and run as a Render Background Worker with its own start command (`node dist/worker.js`). Both services use the same build.

## Architectural Patterns

### Pattern 1: State machine as sole status writer (three layers of defence)

**What:** A single `dispatch()` is the only path; a DB trigger makes bypass impossible; a lint rule makes bypass visible.

**When to use:** Always here. The blueprint's Colony lesson ("assigned status can be overwritten") is exactly this failure.

**Trade-offs:** A little ceremony per transition; in exchange every state change gets actor, timestamp, reason, and effects atomically.

**Transition table (data):**
```typescript
// server/jobs/transitions.ts
export const T = [
  { from: 'draft',     event: 'HOLD_CONFIRMED',   to: 'open',
    actors: ['system'],           guards: ['hold_valid'],
    timers: [{ set: 'open_expiry', after: '48h' }] },
  { from: 'open',      event: 'ACCEPT',           to: 'assigned',
    actors: ['worker'],           guards: ['hold_valid', 'not_expired', 'worker_payout_ready'],
    timers: [{ cancel: 'open_expiry' }, { set: 'checkin_by', after: 'slot' }] },
  { from: 'open',      event: 'CANCEL',           to: 'cancelled',
    actors: ['customer_owner'],   effects: [{ cmd: 'void' }] },
  { from: 'open',      event: 'EXPIRE',           to: 'expired',
    actors: ['system'],           effects: [{ cmd: 'void' }] },
  { from: 'submitted', event: 'BEGIN_VERIFY',     to: 'verifying',
    actors: ['system'],           guards: ['attempts_left'], effects: [{ job: 'verify' }] },
  { from: 'verifying', event: 'AI_AUTO_RELEASE',  to: 'released',
    actors: ['ai'],               guards: ['run_route_is_auto_and_pinned'],
    effects: [{ cmd: 'capture', amount: 'full', final: true }] },
  { from: 'verifying', event: 'AI_ASK_CUSTOMER',  to: 'awaiting_customer',
    actors: ['ai', 'system'],     timers: [{ set: 'review_window', after: '2h' }] },
  { from: 'awaiting_customer', event: 'REVIEW_WINDOW_ELAPSED', to: 'disputed',
    actors: ['system'],           effects: [{ cmd: 'capture', amount: '30%', final: false }] },
  // ... disputed -> released | settled | refunded | in_progress
] as const;
// AI actor can only appear on AI_AUTO_RELEASE and AI_ASK_CUSTOMER.
// "AI can only say yes" is a property of THIS TABLE, assertable in a unit test.
```

**dispatch() skeleton:**
```typescript
export async function dispatch(jobId: string, event: Event, actor: Actor, payload = {}) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.transition','on', true)`); // tx-local
    const [job] = await tx.select().from(jobs).where(eq(jobs.id, jobId)).for('update');
    const rule = lookup(job.status, event);                 // throws IllegalTransition
    assertActor(rule, actor, job);                          // role AND relation
    for (const g of rule.guards ?? []) await guards[g](tx, job, payload, clock.now());
    const [row] = await tx.update(jobs)
      .set({ status: rule.to, version: sql`${jobs.version}+1`, updatedAt: clock.now() })
      .where(and(eq(jobs.id, jobId), eq(jobs.status, job.status)))   // belt and braces
      .returning();
    const ev = await appendJobEvent(tx, job, rule, actor, payload);  // append-only
    await applyTimers(tx, job, rule, clock.now());
    await enqueueEffects(tx, job, rule, ev.id);                      // payment_commands / boss.send
    await tx.execute(sql`select pg_notify('job_events', ${job.id})`); // delivered on COMMIT
    return row;
  });
}
```

**DB backstop (trigger):**
```sql
create table job_allowed_transitions (from_status text, to_status text, primary key (from_status,to_status));
-- seeded from transitions.ts by migration script; a unit test asserts parity

create function jobs_status_guard() returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    if coalesce(current_setting('app.transition', true),'') <> 'on' then
      raise exception 'status may only change via the state machine';
    end if;
    if not exists (select 1 from job_allowed_transitions
                   where from_status = old.status and to_status = new.status) then
      raise exception 'illegal transition % -> %', old.status, new.status;
    end if;
  end if;
  return new;
end $$;
create trigger jobs_status_guard before update of status on jobs
  for each row execute function jobs_status_guard();
```
(`set_config(..., true)` is transaction-local, so it is safe with pooled connections.) Add a `CHECK` on `verification_attempts <= 3`, and `CHECK (status in (...))` or a Postgres enum.

**Atomic accept, no special code needed:** two workers calling `ACCEPT` serialise on `FOR UPDATE`; the second sees `assigned`, finds no rule `assigned --ACCEPT-->`, and gets a 409. Add a belt-and-braces unique partial index (`job_assignments(job_id) where active`) and write a concurrency test (`Promise.all` of two accepts, assert exactly one 200). The `hold_valid` guard checks, inside the same locked transaction, that an active `payment_authorizations` row exists, is not voided, and `valid_until > now`.

**Pessimistic vs optimistic:** use `FOR UPDATE` for transitions (rows are few, contention is tiny, correctness is simple). Use the `version` column for **user-visible edits and decisions**: checklist edits and customer "approve/reject" send `expectedVersion`; if the job moved on (e.g. the sweeper opened a dispute while the customer was staring at the screen) the call fails with 409 and the UI refreshes. This is what stops "customer approves a stale screen".

### Pattern 2: Hold-creating effects precede the transition; money-moving effects follow it

**What:** PayPal and Postgres cannot share a transaction, so order matters and is dictated by direction of risk.

| Direction | Order | Why |
|-----------|-------|-----|
| Creating a hold (authorize) | PayPal call first, then `HOLD_CONFIRMED` transition | A job must never be `open` without a hold |
| Releasing / capturing / voiding / refunding / paying | Transition first (commits intent + outbox row), then PayPal call | State is the source of truth for "what should happen"; no worker can accept a cancelled job while the void is in flight |

**Trade-offs:** After the transition, the job can briefly be `released` while the capture is not yet confirmed. Model that as a **separate settlement field**, not more job statuses: `jobs.settlement` in (`none`, `capture_pending`, `captured`, `payout_pending`, `paid_out`, `payment_failed`). `completed` is entered by a system event when the payout is confirmed. A capture denial sets `payment_failed` through a status-neutral machine event (still logged in `job_events`, still notified) rather than inventing a state.

### Pattern 3: Transactional outbox with deterministic PayPal-Request-Id (effectively-once PayPal calls)

**What:** Each money effect is a row in `payment_commands`, inserted in the same transaction as the transition that caused it. A unique constraint ties it to exactly one transition. The executor drains the table; retries reuse the same `PayPal-Request-Id`.

**Be honest about the guarantee:** exactly-once across two systems is impossible. The achievable guarantee is **at-least-once delivery + idempotent receiver + unique-per-transition command + reconciliation by GET**. That is what to claim and demo.

```sql
create table payment_commands (
  id               uuid primary key default gen_random_uuid(),
  job_id           uuid not null references jobs(id),
  kind             text not null check (kind in
                    ('create_order','authorize_order','reauthorize','void','capture','payout','refund')),
  seq              int  not null default 1,           -- bump only for a DELIBERATE new attempt
  caused_by_event  bigint references job_events(id),  -- the transition that produced it
  ordinal          int  not null default 0,           -- Nth effect of that transition
  request_id       uuid not null,                     -- deterministic, see below
  params           jsonb not null,                    -- amount_cents, final_capture, auth id...
  status           text not null default 'pending'
                    check (status in ('pending','in_flight','succeeded','retry','failed','unknown')),
  attempts         int  not null default 0,
  next_attempt_at  timestamptz not null default now(),
  response         jsonb, paypal_debug_id text, last_error text,
  created_at       timestamptz not null default now(), completed_at timestamptz,
  unique (job_id, kind, seq),
  unique (caused_by_event, kind, ordinal)             -- one command per transition effect
);
create index on payment_commands (status, next_attempt_at);
```

**Deterministic request id.** PayPal's doc (confirmed) says the header must differ per request and per call type, that replaying an id returns the latest status of the earlier request, that two concurrent requests with the same id can make the second fail, and that UUIDs fit the 38-single-byte-character limit. So derive a **UUIDv5** from the command identity; never `uuid4()` per attempt:
```typescript
import { v5 as uuidv5 } from 'uuid';
const NS = '...fixed namespace...';
export const requestId = (jobId: string, kind: string, seq: number) =>
  uuidv5(`${jobId}|${kind}|${seq}`, NS);        // 36 chars, stable across retries
// Payouts: sender_batch_id = the same uuid (PayPal rejects a repeated sender_batch_id for 30 days)
```

**Executor rules:**
1. Claim: `UPDATE payment_commands SET status='in_flight', attempts=attempts+1 WHERE id = (SELECT id ... WHERE status IN ('pending','retry') AND next_attempt_at <= $now ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`. Run **one worker instance with concurrency 1** for this queue (low volume; avoids the concurrent-same-id failure PayPal warns about).
2. Call PayPal outside any DB transaction, with `PayPal-Request-Id: command.request_id`. Always log `PayPal-Debug-Id` into `paypal_api_log`.
3. In a **new** transaction: store `response`, set `succeeded`, upsert the resource row (`payment_authorizations` / `payment_captures` / `payouts`), post the ledger transaction, and chain the next command (capture success inserts the `payout` command; this is a saga step expressed as a result handler, not a state).
4. 5xx / network error / timeout: set `retry` with backoff, **same request id**. 4xx business errors (e.g. `AUTHORIZATION_ALREADY_CAPTURED`): classify; an "already done" error triggers a GET reconcile that marks success if PayPal agrees. Anything else: `failed` plus a machine event that flags the job.
5. Reaper (inside the sweeper): `in_flight` older than 60 s becomes `unknown`; an `unknown` command is resolved by GET (authorization/capture/payout batch status) before ever re-sending, because the Request-Id retention window is not documented on the idempotency page **[VERIFY]**. If PayPal confirms the effect exists, adopt it; otherwise re-send with the same id.
6. **Inline-then-sweep:** user-waiting calls (authorize after the PayPal button, customer "pay now") are executed inline by the same `executeCommand(id)` function right after the insert commits. The worker poll is the safety net, not the primary path. This keeps the demo snappy while still crash-safe.

**Capture denied retry-once:** webhook/response `DENIED` creates a new command with `seq+1` (new request id; the old id would just replay the denial). A second denial raises `payment_failed` through the machine, notifies, and stops.

**Settlement math is a pure function** (integer cents, tested): fee and payout are computed on **cumulative** captured amount so a 30% kill fee followed by a judge split never drifts by a cent.
```typescript
export function settle(capturedTotal: number, alreadyPaid: number, feeBps = 500) {
  const fee = Math.round(capturedTotal * feeBps / 10_000);
  const workerNet = capturedTotal - fee;
  return { fee, workerNet, payoutNow: workerNet - alreadyPaid };
}
```
A judge split of X% after a 30% kill fee is `capture(X% of price − already captured, final=true)`; `final_capture=true` releases the rest of the hold. A refund after a kill fee is a **refund of that capture** (money already left to the worker via Payout, so the platform fronts it; record it as a `platform_loss`/receivable entry, do not pretend it is clawed back).

### Pattern 4: Webhook inbox + fetch-on-notify reconciliation

**What:** Persist first, ack fast, then reconcile against truth.

```sql
create table webhook_events (
  paypal_event_id text primary key,                  -- the dedupe key
  event_type text not null, resource_type text, resource_id text,
  job_id uuid,                                       -- resolved via custom_id / invoice_id / sender_batch_id
  verified boolean not null, raw jsonb not null,
  status text not null default 'received' check (status in ('received','processed','ignored','error')),
  attempts int not null default 0, error text,
  received_at timestamptz not null default now(), processed_at timestamptz
);
```
**Handler flow (`POST /api/webhooks/paypal`):**
1. `const raw = await req.text()` (never `req.json()` before verifying). Verify with PayPal's `POST /v1/notifications/verify-webhook-signature` (transmission id/time/sig/cert-url/auth-algo headers + your `webhook_id` + the event). Reject unverified with 401 (PayPal will retry up to 25 times over 3 days on non-2xx, confirmed in PayPal docs).
2. `INSERT ... ON CONFLICT (paypal_event_id) DO NOTHING`; if no row inserted it is a duplicate, return 200.
3. Process inline (fast path, wrapped in try/catch) and return 200. If processing throws, leave `received`; the reaper retries with backoff. The webhook ack never depends on our business logic succeeding.
4. **Reconcile, do not trust the payload.** Events arrive out of order and can duplicate. For the resource id in the event, `GET` the resource from PayPal (cheap in sandbox) and compare with our row:
   - already matches what the synchronous response recorded: mark `processed`, no-op (this is the normal case, and a good "reconciled" log line for the demo)
   - PayPal is ahead of us (`CAPTURE.DENIED`, `AUTHORIZATION.VOIDED` we did not initiate, payout `FAILED`/`UNCLAIMED`/`RETURNED`): apply through `dispatch()` as a status-neutral flag event plus a ledger entry
   - resource unknown to us: `ignored` + alert (sandbox noise or a bug)
5. Ledger idempotency key `"{kind}:{paypal_resource_id}"` is unique, so the synchronous path and the webhook path can race and exactly one writes.

**Events to subscribe to** (names from PayPal's event reference; **[VERIFY]** exact strings in the sandbox dashboard): `PAYMENT.AUTHORIZATION.CREATED`, `PAYMENT.AUTHORIZATION.VOIDED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.PENDING`, `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.PAYOUTSBATCH.SUCCESS`, `PAYMENT.PAYOUTS-ITEM.SUCCEEDED|FAILED|UNCLAIMED|RETURNED|BLOCKED`.

**Gotchas:** The sandbox webhook *simulator* produces mock events that cannot be verified via the verify API (PayPal docs, confirmed) and carry a placeholder webhook id. Provide a clearly-separated dev-only path (`PAYPAL_ALLOW_UNSIGNED=1`, refuses to start when `NODE_ENV=production` or on Render) rather than a "skip in sandbox" branch; real sandbox traffic from real API calls must verify normally. Set `custom_id = job_id` (and `invoice_id` where allowed) on the order's purchase unit so every downstream resource can be mapped back to a job.

### Pattern 5: Double-entry-ish ledger

**What:** Every money event is a balanced transaction of signed entries across a small fixed set of accounts. It is "ish" because we do not model PayPal's own fees or float; we model *who is owed what*.

```sql
create table ledger_transactions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id),
  kind text not null check (kind in ('hold','reauth','void','capture','payout','payout_failed','refund','adjustment')),
  idem_key text not null unique,           -- 'capture:{paypal_capture_id}'
  paypal_ref text, is_memo boolean not null default false,   -- holds/voids are memo (no cash moved)
  effective_at timestamptz not null, created_at timestamptz not null default now()
);
create table ledger_entries (
  id bigserial primary key,
  txn_id uuid not null references ledger_transactions(id),
  account text not null check (account in
    ('customer_hold','hold_offset',         -- memo pair for authorizations
     'platform_cash',                       -- captured funds sitting at PayPal
     'worker_payable',                      -- owed to worker (95%)
     'platform_fee',                        -- 5% revenue
     'worker_paid',                         -- paid out confirmed
     'customer_refunded','platform_loss')),
  party_id uuid references users(id),
  amount_cents bigint not null,            -- signed; no floats anywhere
  currency char(3) not null default 'USD'
);
-- deferred constraint trigger: sum(amount_cents) per txn_id = 0, per currency
-- BEFORE UPDATE/DELETE trigger on both tables: raise exception (append-only)
```
**Example postings:**

| Event | Entries (sum = 0) |
|-------|-------------------|
| hold $100 (memo) | `customer_hold +100`, `hold_offset -100` |
| void (memo) | `customer_hold -100`, `hold_offset +100` |
| capture $100 | `platform_cash +100`, `worker_payable -95`, `platform_fee -5` |
| payout $95 confirmed | `worker_payable +95`, `platform_cash -95` |

Keep the sign convention simple and documented in one file: **debit-positive on assets, credit-negative on liabilities/revenue**. Paid-to-date for the earnings screen is the sum of confirmed `payouts` rows (or a `worker_paid` mirror entry). Refund of capture $30: `customer_refunded +30`, `platform_cash -30`, and `platform_loss` / reversal of `worker_payable` depending on whether payout already happened.
**Earnings screen** (worker): held = sum of `customer_hold` memo balances for the worker's assigned, uncaptured jobs times 95%; released (owed) = `-balance(worker_payable)`; paid = payouts with `succeeded`. All are `SUM(...) GROUP BY` queries; no denormalised balances.
**Writer rule:** only `server/payments` result handlers and the webhook reconciler call `postLedger()`, always with an `idem_key`.

### Pattern 6: Injectable clock + timers table + minute sweeper

```sql
create table app_clock (id int primary key default 1 check (id = 1), offset_seconds bigint not null default 0);
create table job_timers (
  id bigserial primary key, job_id uuid not null references jobs(id),
  kind text not null,                -- open_expiry | checkin_by | reauth | review_window | dispute_sla | agreement_window | rework_deadline
  due_at timestamptz not null, fired_at timestamptz, cancelled_at timestamptz,
  payload jsonb
);
create unique index on job_timers (job_id, kind) where fired_at is null and cancelled_at is null;
create index on job_timers (due_at) where fired_at is null and cancelled_at is null;
```
- **Clock rules:** `clock.now()` is the only source of "now" for domain logic. Domain deadlines (`due_at`, `expires_at`, `valid_until`) are computed in TS from `clock.now()` and stored. Sweeper SQL uses `due_at <= $1` with a bound parameter, never SQL `now()`. `created_at default now()` is fine for audit-only columns. Add a lint rule banning `new Date()`/`Date.now()` under `src/server` except in `clock/`.
- **Sweeper:** `sweep(now)` selects due timers `FOR UPDATE SKIP LOCKED`, and for each calls `dispatch(job, EVENT_FOR[kind], SYSTEM)` in its **own** transaction. A guard failure or `IllegalTransition` (the job moved on) is a no-op that marks the timer cancelled, never an error. Because every timer firing goes through the machine, the sweeper has no special powers.
- **Scheduling:** pg-boss `schedule('sweep', '* * * * *')` (one execution across instances), plus the same handler callable directly. **Admin "advance clock":** `POST /api/admin/clock/advance {hours}` (role `admin` and `DEMO_MODE=1`) increments `offset_seconds`, writes an `admin_actions` row, then calls `sweep(clock.now())` inline guarded by `pg_try_advisory_lock`. The demo shows the timer firing immediately, no waiting for the minute tick.
- **Demo affordance:** an admin "timers" panel listing `job_timers` (kind, due in, fire now) is cheap and makes the "nothing stalls" ground rule visible to judges.
- **Reauth is not only for open jobs.** The honor period is a property of the *authorization*, not the job status. Timer `reauth` is set on every authorization at `honor_until - margin` and rescheduled on each reauth until `valid_until` (29 days from the original authorization); it applies to open, assigned, in-progress, awaiting-customer and disputed jobs. This is also what makes the rework path work.
- **Critical caveat, advancing the app clock does not advance PayPal's clock.** A real `reauthorize` call made "on day 3" in the video will hit PayPal inside its real 3-day honor period and may be rejected (`REAUTHORIZATION_NOT_ALLOWED` is a documented error code **[VERIFY]** when exactly it fires). See Spikes. Plan: (a) create the demo-hold job >= 3 real days before recording so the real reauth succeeds on advance-clock; (b) keep a `PAYPAL_REAUTH_MODE=simulate` fallback that records a clearly-labelled simulated authorization generation so the demo cannot be blocked.

### Pattern 7: AI verification as a persisted, resumable pipeline job

**What:** The engine accepts only `{ jobId, runId }`. Every stage reads from the DB and writes its output before the next starts.

```sql
create table verification_runs (
  id uuid primary key, job_id uuid not null references jobs(id),
  attempt int not null check (attempt between 1 and 3),
  status text not null check (status in ('running','completed','failed','degraded')),
  route text check (route in ('auto_release','ask_customer','flag_and_ask')),
  route_reason jsonb,                       -- e.g. {"model_outage":"gemini"} or {"gate":["phash_reuse"]}
  pinned jsonb not null,                    -- evidence ids + sha256s, checklist item ids+text, prompt_version, rubric_version, thresholds
  pinned_hash text not null,                -- sha256(pinned) stored on the verdict too
  started_at timestamptz not null, finished_at timestamptz,
  unique (job_id, attempt)
);
create unique index on verification_runs (job_id) where status = 'running';
create table verification_stage_results (
  run_id uuid references verification_runs(id), stage smallint not null,   -- 0..5
  status text not null, output jsonb not null, started_at timestamptz, finished_at timestamptz,
  primary key (run_id, stage)
);
create table model_scores (
  run_id uuid references verification_runs(id), provider text not null, model_id text not null,
  status text not null check (status in ('ok','timeout','error','invalid')),
  scores jsonb, rationale jsonb, latency_ms int, raw_ref text,
  primary key (run_id, provider)
);
```
**Flow:**
1. Submit endpoint calls `dispatch(job, 'SUBMIT')` then `BEGIN_VERIFY`; the machine's guard enforces `attempts_left` (<= 3), increments `verification_attempts`, and its effect enqueues pg-boss job `verify` with `{ jobId, runId }` and `singletonKey = runId` (dedupes double-submit).
2. Handler: stage 0 builds `pinned` by reading checklist + evidence **from Postgres by job id**, hashes it, inserts the run. Stages 1-5 each `INSERT ... ON CONFLICT DO NOTHING` their result and **skip stages already complete on re-run** (a worker crash or pg-boss retry resumes, never repeats a paid model call).
3. Stages 2-5 re-read evidence by the **pinned ids**, not "latest evidence for job". Evidence rows are immutable so pinning is by id + sha256.
4. Stage 5 is a pure function over persisted stage outputs, then calls `dispatch(job, 'AI_AUTO_RELEASE' | 'AI_ASK_CUSTOMER', AI_ACTOR)` and appends a `verdicts` row.
5. **Degrade-to-customer is the universal failure mode:** on any unhandled error after the retry limit, the `onFail` handler dispatches `AI_ASK_CUSTOMER` with `route_reason = {"engine_failure": ...}`. Plus a sweeper rule: `status = verifying` for more than ~10 min goes to `awaiting_customer`. Nothing stalls even if the worker is down.

**Queue choice: pg-boss** (current 12.x per pgboss.io; requires Node 22.12+ and Postgres 13+; README lists cron scheduling, retries with backoff, dead-letter queues, singleton/debounce policies, and sending jobs inside an existing transaction through adapters). Preferred over graphile-worker here because cron + retry + DLQ + singleton are built in; it creates its own `pgboss` schema in the same database, so no extra infra. Do **not** put the money-critical executor on it; keep that on the explicit `payment_commands` table where state is queryable and unique-constrained.

**Dual-model fan-out with timeouts:**
```typescript
const budget = AbortSignal.timeout(90_000);                // whole-stage budget
const call = (p: Provider) => withRetry(                    // 1 retry on 429/5xx only, inside budget
  () => scoreRubric(p, pinnedPrompt, { signal: AbortSignal.any([budget, AbortSignal.timeout(45_000)]) }),
  { max: 1 });
const [a, b] = await Promise.allSettled([call('anthropic'), call('google')]);
// each result -> model_scores row (ok | timeout | error | invalid-schema)
// route(): if either is not 'ok' -> ask_customer(reason: model_outage). NEVER auto_release on one model.
```
- Both providers get byte-identical pinned prompt and evidence; structured output validated with zod (`invalid` counts as outage). Scores are numbers; compare with the 1.5 tolerance on the same criterion, per criterion, and on averages.
- `route()` is a **pure function** `(gate, items, scoresA, scoresB, thresholds) -> {route, reason}` with an exhaustive table test (including every outage combination). This is the most valuable test in the repo.
- Gemini gets video natively; Claude gets keyframes. Pin the keyframe ids in `pinned`, so a rerun scores the same frames.

### Pattern 8: Evidence as immutable originals + server-side analysis

```sql
create table evidence (                    -- immutable facts; UPDATE/DELETE blocked by trigger
  id uuid primary key, job_id uuid not null references jobs(id), uploader_id uuid not null references users(id),
  slot text not null check (slot in ('customer_problem','before','after','video')),
  checklist_item_id uuid references checklist_items(id),
  storage_key text not null unique,        -- originals/{job}/{id}.{ext}, write-once
  sha256 text not null, bytes bigint not null, mime text not null,
  device_lat double precision, device_lng double precision, device_accuracy_m real, client_captured_at timestamptz,
  uploaded_at timestamptz not null
);
create table evidence_analysis (           -- written exactly once by ingest, from the ORIGINAL bytes
  evidence_id uuid primary key references evidence(id),
  exif jsonb, exif_taken_at timestamptz, exif_lat double precision, exif_lng double precision,
  phash bigint, width int, height int, duration_ms int,
  ingest_version text not null, analysed_at timestamptz not null
);
create table evidence_derivatives (        -- thumbnails, model-size images, video keyframes
  id uuid primary key, evidence_id uuid not null references evidence(id),
  kind text not null check (kind in ('thumb','model_1024','keyframe')), t_ms int, storage_key text not null
);
```
- **Upload path:** client asks `/api/evidence/presign` (server checks actor + job state + slot), gets a one-time signed PUT URL to `originals/…`, uploads straight to object storage (never through the Next.js body limit), then calls `/finalize`, which inserts `evidence`, then enqueues `ingest`. Never overwrite a key; `storage_key` is unique and derived server-side. Turn on bucket versioning/object-lock where the provider supports it **[VERIFY]**.
- **Ingest order is the rule:** read the original into a buffer, then (1) sha256, (2) EXIF from the original buffer (`exifr`), (3) pHash, (4) only then resize/transcode into `derivatives/`. Resizing first strips EXIF; that is the GigSmartPay bug. Run it in the ingest worker, never in the request path.
- **pHash:** 64-bit via `sharp` (grayscale, resize 32x32, DCT, median bit) stored as `bigint`. Hamming distance in SQL: `bit_count((a # b)::bit(64))` (Postgres 14+; **[VERIFY]** on Render's PG version). Full scan is fine at hackathon scale (thousands of rows), so reuse detection is deterministic and in-transaction. **Elastic is a projection**, fed by an async `index` job after ingest and after each verdict, used for the judge's "similar photos" and verdict-log search panels. Never make the money decision depend on Elastic being up.
- **Video:** keyframes via `ffmpeg-static` (bundles the binary; no Docker needed on Render's native Node runtime **[VERIFY]**).
- **Storage provider:** Render has no object store; use S3 or Cloudflare R2 through the S3 API (`@aws-sdk/client-s3` + presigner), private bucket, signed GET URLs with a 5-minute TTL minted only after a relation check.
- **Mobile EXIF reality:** an in-app `getUserMedia` + canvas capture produces a JPEG with **no EXIF at all**, contradicting "original with EXIF intact". Use `<input type="file" accept="image/*" capture="environment">` (native camera app) to keep EXIF time. Mobile browsers (notably iOS Safari) frequently strip EXIF GPS from web uploads **[VERIFY]**, so the gate must treat missing EXIF GPS as "unverifiable" (soft flag) and rely on device Geolocation captured at the same moment (`evidence.device_lat/lng`) plus the check-in geofence. Design the integrity gate with three outcomes per check: `pass`, `fail`, `unverifiable`.

### Pattern 9: Realtime on Render, `NOTIFY` into SSE with replay

- **Producer:** `pg_notify('job_events', job_id)` inside `dispatch()` (delivered only on commit, so clients never see rolled-back state). Payload is the id only (8 kB cap).
- **Consumer:** a singleton `RealtimeHub` in each web instance opens one dedicated `pg.Client` (direct connection, not a transaction-pooled one) and `LISTEN job_events`. It looks up which connected users may see that job (customer owner, assigned worker, judges) and writes an SSE message.
- **Endpoint:** `GET /api/stream` route handler returning a `ReadableStream` with `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`, a `: ping` comment every ~20 s, `id:` = `job_events.id`, and cleanup on `request.signal.abort`. On reconnect, the browser's `Last-Event-ID` is replayed from `job_events` so nothing is missed across deploys.
- **Client:** `EventSource` + on any message, refetch the job via REST (messages are hints, REST is truth). **Always** include a 5-10 s polling fallback when the stream is not open; that is demo insurance.
- **Why SSE not WebSocket:** traffic is server-to-client only; SSE works in a plain Next.js route handler, while WebSocket forces a custom server and a separate port story. Render's docs confirm WebSocket support, no max connection duration, graceful-close on deploy (SIGTERM, 30 s), random instance on reconnect; they say nothing about SSE and old community threads report buffering **[VERIFY by deploying a heartbeat route on day 1]**. If SSE buffers, switch the hub's transport to `ws` on a custom server or lean on polling.
- Multiple web instances each LISTEN independently, so no Redis is needed. Worker-originated transitions (sweeper, AI) reach clients because the notify goes through Postgres.

### Pattern 10: Authorization = Actor + relation, enforced in the machine and in queries

- **Auth library:** Better Auth with the Postgres adapter, email+password and seeded users (Auth.js is in maintenance as the team merged into Better Auth; **[VERIFY]** current status before installing). Sessions are cookies; `getActor(req)` returns `{ id, role, ... }` or throws 401.
- **`users.role` in (`customer`, `worker`, `judge`, `admin`)**; the machine's `actors` list names a role *and* a relation: `customer_owner` means `actor.id === job.customer_id`; `assigned_worker` means `actor.id === job.worker_id`; `judge` also requires `disputes.status` open; `system`/`ai` are not reachable from HTTP (no route constructs those actors; they are created only inside worker code).
- **Read authorization** lives in `server/queries/*`, each taking an `Actor` and scoping by relation. A worker sees open jobs with coarse location only; the exact address is released at `ACCEPT`. Signed evidence URLs are minted by one function `signEvidenceUrl(actor, evidenceId)` which re-checks relation.
- **Demo role switcher:** `POST /api/admin/switch-role {role}` is allowed only when `DEMO_MODE=1` and the session belongs to the flagged demo operator; it swaps the session to the seeded account for that role. It is session impersonation, not a bypass: every subsequent request is authorized as the real seeded user, so the video still shows real role auth.
- **API style:** route handlers uniformly (not Server Actions) for anything that mutates, so the same endpoints can be driven from tests and from a demo script.

## Data Flow

### Request flow

```
Browser -> route handler -> getActor -> zod -> dispatch(job, EVENT, actor)
              │                                   │ one tx: lock row, guard, UPDATE status,
              │                                   │ append job_events, timers, payment_commands,
              │                                   │ boss.send, pg_notify
              ▼                                   ▼ COMMIT
         HTTP 200/409                  worker: executor | verify | ingest | sweeper
                                                  │ result handler (new tx): resource rows,
                                                  │ ledger, follow-up command, status-neutral events
                                                  ▼ pg_notify -> web hub -> SSE -> browser refetch
```

### Key data flows

1. **Booking (hold first):** customer approves checklist + price → `POST /api/paypal/create-order` (`create_order` command executed inline, `intent: AUTHORIZE`, `custom_id = job_id`) → PayPal JS button approval in PayPal's window → `POST /api/paypal/authorize-order` → inline `authorize_order` command → on success one tx: `payment_authorizations` row (`authorization_id`, `honor_until`, `valid_until`), ledger `hold` memo, `dispatch(HOLD_CONFIRMED)` → job `open`, timers `open_expiry` and `reauth` set. `PAYMENT.AUTHORIZATION.CREATED` webhook later reconciles as a no-op.
2. **Accept → check-in → submit:** `ACCEPT` (atomic, hold-checked) → `CHECK_IN` (geofence guard on device GPS, requires the `before` evidence id) → evidence uploads + ingest → `SUBMIT` guard requires completeness (one `after` per required item, video if required) → `BEGIN_VERIFY`.
3. **Verification:** pg-boss `verify` → stages 0-5 persisted → `AI_AUTO_RELEASE` | `AI_ASK_CUSTOMER` → verdict row (append-only, `pinned_hash`).
4. **Release & payout:** transition `released` inserts `capture` command (full, `final_capture=true`) → executor captures → result handler writes `payment_captures`, ledger `capture`, inserts `payout` command (sender_batch_id = request id) → executor pays → ledger `payout`, `settlement = payout_pending`; webhook `PAYOUTS-ITEM.SUCCEEDED` reconciles → `PAYOUT_CONFIRMED` event → `completed`. `UNCLAIMED/FAILED` → settlement flag, `worker_payable` stays owed, worker notified to fix email.
5. **Silent customer (kill fee):** timer `review_window` due → sweeper `REVIEW_WINDOW_ELAPSED` → `disputed` + `capture 30% final=false` → payout of the settled net → dispute SLA timer starts.
6. **Dispute:** reject creates `disputes` + statements → case-summary job (pg-boss) writes `disputes.brief` → judge proposes → both accept or `agreement_window` timer fires and the ruling stands → `RESOLVE_*` event with its capture/void/refund commands computed by `settlement.ts` from `payment_captures` totals.
7. **Notifications:** `dispatch()` inserts `notifications` rows (kind, recipient, payload) in-tx; the notifier posts to a Zapier catch-hook and marks delivered; the in-app tracker uses flow (9) above.

## Postgres Table List

| Group | Table | Notes |
|-------|-------|-------|
| Identity | `users` (id, email, role, display_name, is_demo_operator) | + auth library tables (`sessions`, `accounts`, ...) |
| | `worker_profiles` (user_id, paypal_email, payout_email_verified_at, home_lat/lng, radius_km, trade) | payout email at sign-up |
| Intake | `intake_conversations`, `intake_messages` | chat transcript + extracted fields jsonb |
| Jobs | `jobs` | id, customer_id, worker_id, status, version, settlement, payment_flag, trade, title, description, address, lat, lng, geofence_m (default 300), price_cents, currency, booked_slot, verification_attempts, created_at, updated_at |
| | `job_events` | append-only: id bigserial, job_id, from, to, event, actor_type, actor_id, payload jsonb, at |
| | `job_allowed_transitions` | seed table for the DB trigger |
| | `job_timers` | see Pattern 6 |
| | `checklist_items` | id, job_id, position, text, requires_photo, requires_video, source (ai/customer), locked_at (set on HOLD_CONFIRMED; update blocked after) |
| | `check_ins` | job_id, worker_id, lat, lng, accuracy_m, distance_m, within_geofence, before_evidence_id, at |
| Evidence | `evidence`, `evidence_analysis`, `evidence_derivatives` | Pattern 8 |
| AI | `verification_runs`, `verification_stage_results`, `model_scores` | Pattern 7 |
| | `verdicts` | append-only: id, job_id, run_id nullable, actor_type (ai_engine/customer/judge/system), decision, reason, pinned_hash, at |
| | `ai_calls` | provider, model, prompt_version, tokens, cost, latency, request_hash (cost and debug; optional) |
| Disputes | `disputes` | job_id, opened_by, failed_item_ids, status, sla_due_at, brief jsonb, outcome |
| | `dispute_statements`, `dispute_proposals`, `dispute_acceptances` | judge proposal, per-party accept, window |
| Payments | `payment_authorizations` | id, job_id, paypal_authorization_id, generation, parent_id, amount_cents, status, honor_until, valid_until |
| | `payment_orders` | paypal_order_id, job_id, status, approved_at |
| | `payment_captures` | paypal_capture_id, authorization_id, amount_cents, final, status |
| | `payouts` | job_id, command_id, sender_batch_id, payee_email, amount_cents, batch_status, item_status |
| | `payment_commands` | outbox, Pattern 3 |
| | `paypal_api_log` | request_id, endpoint, http_status, paypal_debug_id, req/resp jsonb |
| | `webhook_events` | inbox, Pattern 4 |
| Ledger | `ledger_transactions`, `ledger_entries` | Pattern 5 |
| Platform | `app_clock`, `admin_actions`, `notifications` | clock, audit of admin controls, notifier outbox |
| Queue | `pgboss.*` | created by pg-boss in its own schema |

Conventions: `timestamptz` everywhere, `bigint` cents (never floats), UUID PKs except append-only logs, `ON DELETE RESTRICT`. Append-only (`UPDATE/DELETE` raise): `job_events`, `verdicts`, `ledger_*`, `evidence`, `evidence_analysis` (after first write), `paypal_api_log`.

## Suggested Build Order (money skeleton first)

Each step ends in something demonstrable. This deliberately pulls the sweeper, clock and a minimal dispute path forward from blueprint phase 4, because video moments 2 and 3 need them.

| # | Build | Depends on | Demo-able at end |
|---|-------|------------|------------------|
| 0 | Repo, Drizzle migrations, Render deploy of web + worker + Postgres, **deploy a hello route and an SSE heartbeat route immediately**, register the PayPal sandbox webhook on the Render URL, Better Auth + seeded users + role switcher | none | public URL, webhooks reach us, SSE verdict known |
| 1 | Kernel: `clock`, `jobs`/`job_events`/`job_timers`/`ledger_*` migrations, `transitions.ts`, `dispatch()`, DB trigger, append-only triggers, table-driven unit tests, concurrent-accept test | 0 | state machine tested without any UI |
| 2 | Payment service v1: `payment_commands` + executor, `paypal-client`, create/authorize order via JS button, hold row + ledger memo, `HOLD_CONFIRMED`, cancel -> void, webhook inbox + verify + dedupe + reconcile, seeded job with hard-coded checklist | 1 | **Customer books, hold shows in PayPal sandbox, cancel voids it** |
| 3 | Release path: customer "pay now" -> capture -> payout, settlement math, ledger postings, worker earnings screen, payout webhooks | 2 | **Full money loop end to end (moment 1 minus AI)** |
| 4 | Worker side + realtime: job board, atomic accept, check-in with geofence, live tracker over SSE, polling fallback | 1, 2 | two browsers update live |
| 5 | Evidence: presign/finalize, ingest (sha256, EXIF, pHash, keyframes), checklist runner, submit completeness guard | 4 | real uploads with fraud-grade metadata |
| 6 | Sweeper + `job_timers` + admin advance-clock + timers panel: open expiry (void), review window -> kill fee (partial capture), reauth chain | 1, 2, 3 | **timer-driven moments demonstrable on demand** |
| 7 | AI pipeline: pg-boss, stages 0-3 with a **stub** model first, then real Claude + Gemini fan-out, pure `route()`, review panel, approve/reject, auto-release | 3, 5 | **happy path + fraud catch (moments 1 and 2)** |
| 8 | Disputes + judge console: reject flow, case summariser, resolution builder (release/split/refund/rework), agreement window, verdict log | 6, 7 | **moment 3** (partial capture visible in sandbox) |
| 9 | Customer intake chat + spec agent + price suggestion (writes `checklist_items`; before this, a plain form seeds them) | 1 | polished entry point |
| 10 | Sponsor integrations and polish: Zapier notifier, Elastic projector, demo-reset script, seeded fraud fixture photo, empty/error states | 7, 8 | video-ready |

Notes on ordering:
- **Do not let the AI block money:** step 3 delivers capture + payout with a human click, so even if the AI work slips, the PayPal story and moment 1 still work.
- Steps 4 and 6 can be done in either order; step 6 should land before 8.
- Step 9 only depends on the `checklist_items` table, so it can be swapped earlier if design polish is judged more at risk than AI depth; the seeded job form is the stand-in.
- Write the three scripted demo scenarios as seed/reset scripts as you go (step 3 onward), not at the end.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Hackathon (tens of jobs) | Exactly this design. Single web instance, single worker, `FOR UPDATE` and full-scan pHash are all fine. |
| ~1-10k jobs/day | Add a second web instance (hub already per-instance), pHash prefilter by band (multi-index on 4 x 16-bit chunks) or move reuse search to Elastic/pgvector, run executor concurrency per job rather than global. |
| 100k+ | Split worker queues across processes, partition `job_events`/`ledger_entries` by month, replace polling executor with LISTEN-driven wake-ups, move to PayPal's marketplace/multiparty product. |

**First bottleneck:** model latency and cost per verification (not the database). **Second:** PayPal API rate limits on reconcile GETs.

## Anti-Patterns

### Anti-Pattern 1: Generating a fresh PayPal-Request-Id per attempt

**What people do:** `uuid4()` inside the retry loop.
**Why it's wrong:** A retry after a timeout becomes a second capture/payout; idempotency is defeated.
**Do this instead:** UUIDv5 of `(job, kind, seq)`, persisted on the command row before the first call.

### Anti-Pattern 2: Making the PayPal call inside the DB transaction (or the DB write after, with no record of intent)

**What people do:** `await paypal.capture()` mid-transaction, or capture and then try to update the job.
**Why it's wrong:** Holds a lock across the network; a crash between the two loses the fact that money moved.
**Do this instead:** Outbox row committed with the transition; call after commit; result handler in a second tx; reconcile by GET.

### Anti-Pattern 3: Trusting the webhook payload / treating webhooks as the primary path

**What people do:** Mutate state from the payload; assume ordering; no dedupe.
**Why it's wrong:** Events duplicate, arrive late and out of order; the simulator's events are unsigned.
**Do this instead:** Persist, dedupe on event id, fetch the resource, compare with our row, apply only the delta through the machine.

### Anti-Pattern 4: Status as a free-form column updated from many places

**What people do:** `UPDATE jobs SET status = ...` in a route handler, in the sweeper, in the AI worker.
**Why it's wrong:** Colony's overwritten `assigned`. Loses actor and timestamp.
**Do this instead:** `dispatch()` only, trigger backstop, lint rule.

### Anti-Pattern 5: AI engine receives criteria or evidence in the request

**What people do:** Pass the checklist and photo URLs to the verify endpoint.
**Why it's wrong:** Mappers' oracle trust bug; also makes reruns unreproducible.
**Do this instead:** `{ jobId, runId }` only; pinned ids + hash persisted per run; evidence immutable.

### Anti-Pattern 6: Reading `now()` from SQL or `Date.now()` in domain code

**What people do:** `WHERE expires_at < now()`.
**Why it's wrong:** The demo "advance clock" silently does nothing for those paths; tests become time-dependent.
**Do this instead:** `clock.now()` in TS, pass as a bound parameter.

### Anti-Pattern 7: Resize or re-encode before reading metadata, or let the browser canvas "re-capture"

**What people do:** Resize on upload for bandwidth, or capture via canvas.
**Why it's wrong:** EXIF gone; the fraud gate becomes theatre.
**Do this instead:** Native-camera file input, direct upload of the original, server-side analysis on the original buffer, derivatives separately.

### Anti-Pattern 8: One-model fast path

**What people do:** "If Gemini times out just use Claude's score."
**Why it's wrong:** Violates "two models must agree"; a single vendor could decide a payment.
**Do this instead:** Any non-`ok` provider means `ask_customer`. The router has no branch that releases on one score.

### Anti-Pattern 9: Floats for money, per-capture rounding of the fee

**Do this instead:** integer cents, fee on cumulative captured, payout = net minus already paid.

### Anti-Pattern 10: Letting the reauthorize timer exist only for "open" jobs

**Why it's wrong:** The authorization, not the job, ages; an in-progress or disputed job would lose its hold on day 3.
**Do this instead:** Timer per authorization generation until `valid_until`; jobs longer than 29 days stay out of scope.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| PayPal Orders v2 + Payments v2 | `paypal-client.ts` via `payment_commands`; `intent: AUTHORIZE`; `custom_id = job_id` | Request-Id per call type per attempt; capture with `final_capture` flag; log `PayPal-Debug-Id` |
| PayPal Payouts | `payout` command; `sender_batch_id` = request uuid | Duplicate `sender_batch_id` rejected for 30 days (docs confirmed), returns link to original batch |
| PayPal Webhooks | Inbox pattern (Pattern 4) | Public Render URL; verify API; simulator events unverifiable |
| Anthropic / Google Gemini | `ai/models` gateway; parallel `allSettled`; zod-validated JSON | Per-call and per-stage timeouts; record `model_id` and `prompt_version` in `pinned` |
| Object storage (S3/R2) | Presigned PUT for originals, presigned GET short TTL | Private bucket; write-once keys |
| Zapier | `notifications` outbox -> catch hook | Never on the critical path |
| Elastic | Async projector job from `evidence_analysis` and `verdicts` | Postgres remains the decision source |
| Render | Web service + Background Worker + Postgres | SIGTERM handling: close SSE, drain pg-boss, finish in-flight command |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Route handler -> domain | Direct function call with `Actor` | No SQL in handlers |
| Domain -> machine | `dispatch()` only for status | Lint + trigger |
| Machine -> payments / verify / ingest | Rows (`payment_commands`) and pg-boss jobs written in the transition tx | Effects are data, not callbacks |
| Payments -> machine | Result handlers call `dispatch()` with status-neutral or settlement events | Never mutate `jobs.status` directly |
| Web <-> worker | Postgres only (rows, pg-boss, NOTIFY) | No HTTP between them, no shared memory |
| Verify engine -> machine | `AI` actor, two events only | Property asserted by test |
| Webhook inbox -> payments | Reconcile function | Writes ledger idempotently |

## Spikes to Run (resolve before the dependent phase)

| # | Question | Why it matters | Found so far |
|---|----------|----------------|--------------|
| S1 | Reauthorize rules: how many times, when exactly rejected inside the honor period, what the new `authorization_id` looks like, sandbox behaviour | Drives Pattern 6 caveat and the rework path | PayPal's authorization guide says an authorization is valid 29 days, reauthorize **after the 3-day honor period**, **multiple reauthorizations allowed**, each gets a **new authorization id** and a restarted honor period. This **contradicts** the "reauthorize only once" note in PROJECT.md (a third-party mirror of an older reference said "once"). Treat "multiple" as likely but confirm in sandbox. Model authorizations as a chain either way. |
| S2 | SSE through Render's proxy without buffering | Realtime tracker | Docs confirm WebSocket only; old community reports of SSE buffering. Deploy heartbeat route on day 1. |
| S3 | Partial capture (`final_capture=false`) followed by a second capture / void of the remainder in sandbox; does capture sit `PENDING` before `COMPLETED` | Kill-fee and split math, payout trigger timing | Not verified. |
| S4 | Request-Id retention window per endpoint | Whether GET-reconcile is mandatory | PayPal says it differs per API reference; idempotency page gives no number. |
| S5 | Payouts funded from sandbox business balance after captures; exact webhook names for item events | Money loop step 3 | Docs confirm `sender_batch_id` dedupe and batch status values; event names unverified. |
| S6 | pg-boss in-transaction send with the Drizzle/pg driver | Whether to enqueue `verify` in the transition tx or via post-commit send + reaper | pg-boss lists adapters for Drizzle/Knex/Kysely/Prisma; exact API not read. Fallback: post-commit send plus a reaper that re-enqueues `verifying` runs with no live job. |
| S7 | iOS Safari EXIF GPS on `capture` file input | Integrity gate wording | Known to be unreliable; three-state checks cover it. |
| S8 | Better Auth current API and Next.js integration | Auth choice | Not verified in this research. |

## Sources

- PayPal REST idempotency (PayPal-Request-Id semantics, 38-char limit, replay returns prior status, concurrent duplicate fails): https://developer.paypal.com/api/rest/reference/idempotency/ (HIGH for the behaviours quoted)
- PayPal Payments v2 reference (authorization capture/reauthorize/void endpoints, `final_capture`, `invoice_id`, error codes named): https://developer.paypal.com/docs/api/payments/v2/ (HIGH for endpoint set; per-endpoint details not read)
- PayPal authorize-and-capture guide (29-day validity, 3-day honor period, multiple reauthorizations, new id per reauth): https://developer.paypal.com/platforms/checkout/standard/customize/auth-capture.md (MEDIUM-HIGH; conflicts with PROJECT.md note, see S1)
- PayPal Payouts customize guide (`sender_batch_id` 30-day duplicate rejection, `PayPal-Request-Id` on payouts, batch statuses): https://developer.paypal.com/docs/payouts/standard/integrate-api/customize (MEDIUM, via search summary)
- PayPal webhooks (retry up to 25 times over 3 days; simulator mock events not verifiable; verify-webhook-signature endpoint): https://developer.paypal.com/api/rest/webhooks/rest and https://docs.paypal.ai/webhook-integration (MEDIUM, via search summary)
- pg-boss (v12.x, Node 22.12+, PG 13+, cron/RRULE scheduling, retries, DLQ, in-transaction send adapters): https://pgboss.io/ and https://github.com/timgit/pg-boss (HIGH for those facts)
- Render WebSocket docs (no max connection duration, ping/pong keepalive, random instance on reconnect, SIGTERM 30 s): https://render.com/docs/websocket (HIGH; SSE not covered)
- Render community SSE buffering thread: https://community.render.com/t/sse-continually-buffering/3840 (LOW, old)
- Patterns (transactional outbox, inbox/idempotent receiver, append-only ledger, saga-by-result-handler, `FOR UPDATE SKIP LOCKED` work queues): established practice; no single citation (HIGH as pattern knowledge, my own synthesis for the specifics here)

---
*Architecture research for: AI-verified PayPal held-payment gig marketplace*
*Researched: 2026-10-27*
