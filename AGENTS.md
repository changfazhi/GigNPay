<!-- GSD:project-start source:PROJECT.md -->

## Project

**Pay-When-Done Marketplace**

A marketplace for physical gig jobs (starting with aircon servicing in the US) where the customer's payment is **held** by PayPal when the job is booked, AI checks photo and video proof that the work was done well, and the worker is paid automatically. When the AI isn't sure, the customer decides. When they disagree, a human judge does. Built for the PayPal + AI Hackathon 2026.

Full source blueprint: `.planning/BLUEPRINT.md` (copy of the owner's Google Doc "AI PayPal Hackathon", rev 1, 2026-10-23).

**Core Value:** Money only moves when the work is proven: a PayPal authorization holds the customer's funds at booking, and it is captured and paid out only after AI-verified (or human-approved) proof — the AI can approve payment but can never take it away.

### Constraints

- **Tech stack**: Next.js full-stack TypeScript (PWA + API route handlers), Postgres, object storage with signed URLs, separate worker process for the minute sweeper — one codebase, solo builder
- **AI providers**: Anthropic (Codex) + Google (Gemini) as the two independent model vendors — so one outage can't decide a payment; Gemini also handles video natively
- **Payments**: PayPal sandbox only — Orders v2 (AUTHORIZE → capture), Authorizations (capture/reauthorize/void), Payouts, Captures/refunds, Webhooks
- **Timeline**: Solo build, ~1–2 weeks — blueprint phases 1–3 are must-haves; phase 4 trimmed to what the demo video needs
- **Market**: Aircon servicing, United States, USD
- **Hosting**: Render, deployed early so PayPal webhooks reach a public URL
- **Security**: Verification engine accepts only a job id and reads all inputs from the DB; role auth enforced server-side on every decision; PayPal webhook signatures verified
- **Job length**: Jobs must complete within 29 days (one authorization lifetime)

<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->

## Technology Stack

## How confidence is tagged in this file

- **HIGH** = version or fact read directly from the npm registry, a package tarball, or a vendor API schema file fetched on 2026-10-27.
- **MEDIUM** = read on the vendor's official docs page, or two agreeing sources.
- **LOW** = search-result summary only, a single weak source, or the sources conflict. Nothing marked LOW should be treated as settled. Every LOW item is also listed under "Spikes required".
- The `classify-confidence` seam returns LOW for the `websearch` and `webfetch` providers whatever they fetched. I kept it as the floor for search-only claims. I raised a claim only where I opened the vendor's own page or schema file, and I say so in the row.
- No MCP research providers are enabled in `.planning/config.json` (Context7, Exa, Brave and the rest are all false), so I used npm registry inspection, tarball reads, the Codex API skill's cached model table, WebFetch and WebSearch.

## Recommended Stack

### Core Technologies

| Technology | Version (pin exact) | Purpose | Why Recommended | Conf. |
|------------|---------------------|---------|-----------------|-------|
| Node.js | 22.12+ LTS (set `NODE_VERSION` on Render) | Runtime for web and worker | `pg-boss@12` requires `>=22.12`; Next 16 needs `>=20.9`; `sharp`, `@aws-sdk` and `@google/genai` accept 20 or later. 22 satisfies all of them. Local machine is on 24, which also works. | HIGH |
| Next.js | 16.4.3 (`latest`) | App Router full-stack app, API route handlers, PWA shell | Next 16 is stable (Oct 2025) and Turbopack is the default bundler. Peer deps accept React 19. Route handlers are dynamic by default (no caching surprises for webhooks). | HIGH |
| React / React DOM | 19.3.1 | UI | Required by `react-leaflet@5`; 19.2 features (View Transitions, `useEffectEvent`) come with Next 16. | HIGH |
| TypeScript | **~5.9.3** (do NOT take `latest` 7.0.2) | Types | `latest` is the 7.0 native port. `typescript-eslint@8.72.1` peer range is `<6.1.0`, so 7.x breaks the lint toolchain. Next 16 only needs 5.1+. Pin 5.9.3. | HIGH |
| Postgres | 18 on Render Postgres (13 to 18 selectable) | System of record: users, jobs, ledger, events, verdicts | Render's CLI defaults to 18. `cube`, `earthdistance`, `pgcrypto`, `pg_trgm` and `btree_gist` are available; `pg_cron` is NOT. Postgres 14+ has `bit_count()`, so Hamming distance runs in SQL (see pHash). | HIGH (version), MEDIUM (extension list, read from Render docs) |
| Drizzle ORM + drizzle-kit | `drizzle-orm@0.45.4`, `drizzle-kit@0.31.11` (dev) | Schema, migrations, typed queries | Chosen over Prisma 7 because there is no codegen step and no generated-client output path. The Next app and the `tsx` worker import the same plain-TS schema with no bundling fuss. It is SQL-shaped, which suits the conditional-UPDATE state machine (`UPDATE jobs SET status='assigned' WHERE id=$1 AND status='open' RETURNING *`) and `SELECT ... FOR UPDATE`. `better-auth@1.7.14` lists `drizzle-orm ^0.45.2` as a peer. Stay on the 0.45 line; v1 is still beta. | MEDIUM-HIGH |
| node-postgres (`pg`) | 8.23.1 | Driver for Drizzle, pg-boss and the LISTEN connection | pg-boss depends on `pg ^8.23.1`, so one driver serves everything. | HIGH |
| Better Auth | 1.7.14 | Real auth, roles, seeded demo accounts | See the auth decision below. | HIGH (version), MEDIUM (fit) |
| Zod | 4.6.7 | Validation, state-machine inputs, LLM output schemas | Both `@anthropic-ai/sdk` (`zod ^3.25 or ^4`) and Better Auth accept Zod 4. Shared between API and the AI verdict schema. | HIGH |
| pg-boss | 12.38.0 | Job queue and minute sweeper on Postgres | See the worker decision below. Needs Node 22.12+. | HIGH (version), MEDIUM (fit) |

### Payments (PayPal sandbox)

| Technology | Version | Purpose | Why Recommended | Conf. |
|------------|---------|---------|-----------------|-------|
| `@paypal/paypal-server-sdk` | 2.5.0 | Orders v2 create/authorize, Payments v2 capture/reauthorize/void/refund | The SDK exposes only Orders, Payments, Vault, Subscriptions, Transaction Search and OAuth. I confirmed this by unpacking the 2.5.0 tarball: there are no Payouts or Webhooks controllers. Typed, handles the OAuth token for you, and takes `paypalRequestId` for idempotency. | HIGH |
| Raw `fetch` module (`lib/paypal/rest.ts`, about 100 lines) | n/a | Payouts (`POST /v1/payments/payouts`), `verify-webhook-signature`, payout item lookup | These two are not in the SDK, so use REST with a cached client-credentials token. Keep ALL PayPal calls, SDK and raw, in this one payment-service module (blueprint rule: payment service is the only PayPal caller). | HIGH |
| `@paypal/react-paypal-js` | 10.6.1 | Customer checkout button | **Breaking change from what you may remember.** v10 ships the PayPal JS SDK **v6** under the subpath `@paypal/react-paypal-js/sdk-v6` (`PayPalProvider`, `PayPalOneTimePaymentButton`). The package root `.` still exports the legacy v5 API (`PayPalScriptProvider` with `intent: "authorize"`, `PayPalButtons`). Use the v6 subpath. `createOrder` returns `{ orderId }`; `onApprove` must return the Promise of your server call that authorizes the order. | HIGH (read the shipped README), MEDIUM (v6 behaves as documented in sandbox) |

### Storage, search, notifications

| Technology | Version | Purpose | Why Recommended | Conf. |
|------------|---------|---------|-----------------|-------|
| Cloudflare R2 via `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` | 3.1157.0 (both, keep in lockstep) | Object storage for originals, keyframes and proxies, with signed URLs | Render has no object store. R2 speaks S3, has a 10 GB-month, 1M Class A and 10M Class B operations monthly free tier, and **zero egress charge**. Presigned GET, PUT, HEAD and DELETE work, with expiry from 1 second to 7 days. POST form uploads and custom domains with presigned URLs do not. | MEDIUM-HIGH (Cloudflare docs read) |
| `@elastic/elasticsearch` | 9.5.1 | pHash reuse index and searchable verdict log | Official client. Elastic Cloud trial (hosted deployment or serverless project) with an API key. Keep the client major equal to the server major (9.x). | MEDIUM (server and client compatibility not confirmed; see Spikes) |
| Zapier "Webhooks by Zapier" Catch Hook | n/a | Email/push notifications | Plain `fetch` POST of JSON to the Catch Hook URL; no SDK. **Webhooks by Zapier is a premium app**: not on the Free plan, so you need a paid plan or the 14-day trial. Sources disagree on the cheapest paid tier. | LOW-MEDIUM |

### AI SDKs and models

| Technology | Version | Purpose | Why Recommended | Conf. |
|------------|---------|---------|-----------------|-------|
| `@anthropic-ai/sdk` | 1.3.0 | Codex judge, intake agent, spec agent | The SDK is at 1.x. Use `client.messages.parse()` with `zodOutputFormat()` from `@anthropic-ai/sdk/helpers/zod` and `output_config.format` for schema-valid JSON. | HIGH (version and API read from the Codex API skill's TS docs) |
| Codex models | `Codex-opus-5-5` for the rubric judge; `Codex-sonnet-5-5` for intake and spec chat agents | Vision scoring and chat agents | Opus 5.5 is the current Opus ($4/$20 per MTok). Sonnet 5.5 ($2/$10) is the current Sonnet. For a decision that moves money, pay for the stronger model on the judge; use Sonnet for conversational agents. Keep model IDs in env vars and write the exact ID into every verdict-log row. | HIGH (ID table cached 2026-10-06 in the Codex API skill) |
| `@google/genai` | `~2.31.0` (stay below 3.0.0) | Gemini judge, native video input | The README warns that 3.0.0 changes behaviour and requires Node 22+. `ai.models.generateContent` with `config.responseMimeType: 'application/json'` and `responseJsonSchema` is still present in 2.31.0 (I grepped the shipped typings). Google's docs now also show a newer `interactions` surface; ignore it and stay on `generateContent`. | HIGH (SDK), MEDIUM (docs drift) |
| Gemini models | `gemini-3.8-flash` (stable) as the default judge; `gemini-4-argon` (stable flagship) as an optional upgrade | Rubric scoring, video understanding | Google's models page lists both as stable. The 2.x and 3.0-preview IDs are legacy or shut down (`gemini-3-pro-preview` and `gemini-2.0-flash` are listed as shut down). Verify the exact ID at startup with `ai.models.list()` and fail loudly. | MEDIUM (one docs page; IDs could not be smoke-tested without a key) |

### Evidence processing (worker side)

| Library | Version | Purpose | Why | Conf. |
|---------|---------|---------|-----|-------|
| `sharp` | 0.35.5 | Decode, auto-orient, resize to model-sized JPEG derivatives, feed pHash | Native libvips, fast, Node 20.9+. Always call `.rotate()` (no args) so EXIF orientation is honoured. | HIGH |
| `sharp-phash` | 2.2.0 | 64-bit perceptual hash (32x32 DCT, returns a 64-char binary string) | I read its `index.js`: it is a small DCT implementation on top of sharp, with `sharp >= 0.32` as peer. Use it as is. It ships a `distance` helper for Hamming. Last published 2024; if it misbehaves the algorithm is about 40 lines to vendor. | MEDIUM-HIGH |
| `exifr` | 7.1.3 | Read EXIF (DateTimeOriginal, GPS, Make/Model, Orientation) from the stored original | Handles JPEG, HEIC, TIFF and PNG; reads from a Buffer; converts GPS to decimal degrees. Last release May 2022 but stable, no replacement needed. It only READS, never rewrites, so the stored original stays byte-identical. | HIGH |
| `ffmpeg-static` + `ffprobe-static` | 5.3.0 / 3.1.0 | Keyframe extraction, video proxy transcode | Bundled binaries downloaded at `npm install`, so there is nothing to apt-install on Render's native Node runtime. Call with `child_process.execFile` directly. Import only in the worker, never in Next code. | MEDIUM-HIGH |
| `tsx` | 4.23.15 | Run the TypeScript worker (`tsx worker/index.ts`) | No separate build step for the second process. | HIGH |

### Map, UI, client state

| Library | Version | Purpose | Why | Conf. |
|---------|---------|---------|-----|-------|
| `leaflet` + `react-leaflet` + `@types/leaflet` | 1.9.4 / 5.0.0 / latest | Job pin picker, geofence circle, worker map | `react-leaflet@5` peers on React 19 and `leaflet ^1.9`. Leaflet 2.0 is still alpha (`2.0.0-alpha.1`), so stay on 1.9.4. OSM tiles need no key. Load the map with `next/dynamic` and `ssr: false`. | HIGH |
| Tailwind CSS + shadcn/ui CLI | `tailwindcss@4.3.3`, `shadcn@4.22.1` | Design system | Design is the biggest judging risk (blueprint section 10). A prebuilt, accessible component kit gets polished customer and worker screens fastest for one builder. | MEDIUM |
| `@tanstack/react-query` | 5.105.0 | Server-state cache, live tracker fallback polling | Pairs with the SSE stream: events invalidate queries; `refetchInterval` is the fallback when SSE drops. | HIGH |

### Development tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `vitest@5.0.5` | Unit tests for the state machine, router thresholds, geofence and ledger maths | Highest-value tests: transition table, routing thresholds (avg 8, no criterion under 6, 1.5 tolerance), idempotency. |
| `playwright@1.64.1` | One end-to-end smoke of the happy path against PayPal sandbox | Optional. |
| ESLint flat config (direct) | Lint | `next lint` was removed in Next 16; `next build` no longer lints. Run `eslint .` yourself. |
| A tunnel (cloudflared or ngrok) | Receive PayPal webhooks locally | Deploy to Render early anyway; webhooks need a public URL. |

## Decisions in detail

### 1. Next.js 16 and App Router conventions (HIGH, official Next 16 blog and route docs)

- `middleware.ts` is now `proxy.ts` with an exported function `proxy`; it runs on the Node.js runtime. Use it only for an optimistic redirect when no session cookie is present. Do the real role check inside every route handler and server action (Better Auth docs say the same).
- `params`, `searchParams`, `cookies()` and `headers()` are async only. Always `await` them. Route handler context is `{ params: Promise<...> }`.
- Route handlers are not cached unless you opt in. Set `export const runtime = 'nodejs'` on the webhook, SSE and anything using `pg`, `sharp` or the PayPal SDK. Do not use the edge runtime.
- Webhooks: read the body with `await request.text()` (no body-parser config needed) and verify before parsing.
- Turbopack is the default for `next dev` and `next build`. Do not add a custom `webpack()` config, because that is what breaks the build.
- Do NOT enable `cacheComponents` (Cache Components, `"use cache"`). The app is almost entirely per-user and live. Skipping it avoids a new mental model in a one-week build.
- Dev and build now use separate output directories, so you can run `next dev` and `next build` together.
- Server Actions are fine for form mutations (intake answers, checklist edits), but keep money and state transitions behind route handlers or a single `transition(jobId, event, actor)` service function so they are callable from the worker too.

### 2. ORM and Postgres hosting: Drizzle on Render Postgres (MEDIUM-HIGH)

- **Prisma status today:** `@prisma/client` `latest` is 7.10.1, but the `prisma` CLI's `latest` dist-tag points at `8.0.0-rc.27` (a release candidate). `npm i prisma` without a pin would pull an RC. Prisma 7 also needs `prisma.config.ts`, an explicit generator `output`, and a driver adapter (`@prisma/adapter-pg`). None of that is hard, but it is all churn, and the generated client has to be imported by both the Next app and the worker.
- **Drizzle:** nothing to generate; types come straight from the schema file. Atomic accept and the append-only ledger are plain SQL. Raw SQL migration steps for triggers fit in a migration file.
- **Decision:** Drizzle 0.45.4. Prisma 7.10.1 is an acceptable alternative if the builder already knows it well. Do not use Prisma 8 RC.
- **Render Postgres facts (MEDIUM, Render docs):** use the **internal** URL from services in the same region, with `sslmode=require`. External connections need TLS 1.2+. Free Postgres **expires after 30 days** (plus a 14-day grace period). It is usable only if the demo video is recorded inside that window, so use the cheapest paid instance instead (see Infrastructure). Use the same `DATABASE_URL` for web and worker.
- **Required extensions (run in the first migration):** `CREATE EXTENSION cube; CREATE EXTENSION earthdistance;` (job board distance), `pgcrypto` (UUIDs, optional).
- **Append-only enforcement:** add a trigger in the first migration that raises on `UPDATE` or `DELETE` for `verdicts`, `ledger_entries` and `job_events`. This is what makes "append-only verdict log" real rather than a convention.

### 3. Auth: Better Auth 1.7.14 (HIGH on status, MEDIUM on fit)

- Auth.js (NextAuth v5) joined Better Auth in September 2025 and is in security-patch mode. The npm `latest` tag for `next-auth` is still **4.24.15**; v5 exists only as `5.0.0-beta.32`. Lucia (3.2.2) is the legacy library. Better Auth is the recommended choice for new projects.
- Use the email and password built-in (no email provider needed; skip magic links, since sending mail is more setup).
- Use the `admin` plugin with custom access-control roles: `customer`, `worker`, `judge`, plus `admin` as a hidden demo operator. Wire the same `ac` and `roles` into both server and client plugins.
- **Demo role switcher:** the plugin offers `impersonateUser` and `stopImpersonating` (sessions last 1 hour by default), but admins cannot impersonate other admins unless granted the `impersonate-admins` permission. Because the blueprint says admins act as judges, keep `judge` a separate non-admin role. Simplest robust switcher: a server action, enabled only when `DEMO_MODE=true`, that signs into one of three seeded accounts with `auth.api.signInEmail`. Keep real passwords for the real login screen.
- Next integration: mount `toNextJsHandler(auth)` at `app/api/auth/[...all]/route.ts`; add the `nextCookies()` plugin **last** in the plugins array so server actions can set cookies; get the session with `auth.api.getSession({ headers: await headers() })`.
- Schema: generate the Drizzle tables with the Better Auth CLI (`npx auth generate`), then migrate with drizzle-kit. Add `paypal_email` to the user's additional fields for worker payouts.

### 4. Real-time job status: SSE over a route handler, polling fallback (MEDIUM)

- **Pick SSE, not WebSocket.** Next.js route handlers cannot upgrade to WebSockets, so a WebSocket would need a second server (Socket.IO or `ws`) beside Next. The blueprint's "WebSocket" wording is satisfied by "live updates" in PROJECT.md. Traffic is one-way (server to browser), so SSE fits exactly.
- **Render facts:** web services support WebSockets and streaming, and bind to `0.0.0.0:$PORT`. I could not find a documented idle or maximum request duration in Render's docs. A community thread reported SSE connections dropping at about 60 seconds, unresolved (LOW). So: send an SSE comment heartbeat every 15 seconds, and make the client reconnect-safe.
- **Pattern:**
- This also lets the separate worker process push updates to the browser without any extra service, since NOTIFY crosses process boundaries.

### 5. Background worker and minute sweeper: pg-boss on a Render Background Worker (MEDIUM)

- **Decision:** a second Render service of type **Background Worker** running `tsx worker/index.ts`, using `pg-boss@12.38.0`. No Redis needed, and the queue lives in the same Postgres as everything else, so a job and its state change can commit together.
- **Queues:** `ingest-evidence` (EXIF, pHash, keyframes, Elastic index), `verify-job` (stages 0-5), `sweeper` (scheduled `* * * * *` via `boss.schedule`), `paypal-retry`, `notify-zapier`.
- **Why not Render Cron Job:** a cron service is a fresh container per run, at least $1 per month, with cold-start cost each minute. It does guarantee at most one run is active at a time, but the sweeper needs the same DB pool, code and clock-offset logic as the worker. One long-lived worker is simpler and cheaper to reason about.
- **Why not BullMQ (6.5.0) / Redis:** adds Render Key Value as a third data store for no gain here.
- **Why not `graphile-worker` (0.18.0):** also viable and Postgres-based, but needs Node 22.18+. pg-boss has built-in cron scheduling and singleton keys.
- **Sweeper rules:** make every sweep idempotent (a conditional `UPDATE ... WHERE status=... AND deadline <= now_effective()`), and read "now" from one function that adds a DB-stored `clock_offset`. The admin "advance clock" button then only edits that offset.
- **Verification attempt cap:** keep the "max 3 tries" in the jobs table, not in pg-boss retry settings, so the cap is visible in the verdict log.
- **Render facts (MEDIUM):** background workers and cron jobs have **no free tier** (only web services, Postgres and Key Value do). A free web service **spins down after 15 minutes idle** and takes about a minute to wake. So the web service must be a paid instance, or the PayPal webhooks and the demo will be flaky.

### 6. Object storage and signed URLs: Cloudflare R2 (MEDIUM-HIGH)

- S3 client settings: `region: 'auto'`, `endpoint: https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, access keys from an R2 API token scoped to the one bucket.
- **Upload path:** browser asks `POST /api/evidence/presign` (server checks the worker is assigned to that job and the job is in the right state), receives a presigned **PUT** URL (expiry 10 minutes, `ContentType` included in the signature), PUTs the File directly to R2, then calls `POST /api/evidence/:id/complete`. The server HEADs the object, records size and ETag, and enqueues ingest. Uploads never pass through Render, which avoids request-size and memory limits.
- **CORS (required):** set on the bucket (dashboard, or `wrangler r2 bucket cors set`). Allow origin = the Render URL (and `http://localhost:3000` for dev), method `PUT`, headers `Content-Type`, expose `ETag`.
- **Reads:** short-lived presigned GET (5 to 15 minutes) minted per page load. The R2 docs say presigned URLs do not work with custom domains, so use the S3 endpoint. Never make the bucket public; originals are evidence.
- **Keys:** `jobs/{jobId}/{evidenceId}/original`, `.../derived/model.jpg`, `.../frames/{n}.jpg`, `.../proxy.mp4`. Store SHA-256 of the original in Postgres at ingest to prove it was not altered.
- Alternatives rejected: AWS S3 (egress and an extra account), Supabase Storage (an extra vendor and auth model), Render Disk (single instance, not shareable between web and worker).

### 7. PayPal integration (HIGH on shapes, MEDIUM on sandbox behaviour)

- Server `createOrder` builds `intent: AUTHORIZE`, `purchase_units[0].amount` in USD, and `custom_id` set to your `jobId`. Send the SDK's `paypalRequestId` set to a stable key like `job:{id}:create`.
- Client uses `PayPalProvider` (`clientId`, `environment="sandbox"`, `components={["paypal-payments"]}`, `pageType="checkout"`) and `PayPalOneTimePaymentButton` with `createOrder` returning `{ orderId }`. `onApprove` must **return** the Promise from your server call (`POST /api/jobs/:id/authorize`), which runs `ordersController.authorize` and stores the `authorization.id`.
- Fallback if v6 misbehaves: import the legacy `PayPalScriptProvider` and `PayPalButtons` from the package root with `options={{ intent: "authorize", currency: "USD" }}`.
- The `reauthorize` operation description says: honor period 3 days, valid 29 days, "you can issue multiple re-authorizations after the honor period expires", a reauthorized payment gets a new 3-day honor period, and you can reauthorize "from 4 to 29 days".
- The `reauthorize_request` schema says: "You can reauthorize a payment only once from days four to 29" and "an authorized payment once".
- A reauthorization returns a **new authorization ID**; later captures must use it. Only the `amount` field is accepted. The US amount may go up to 115% of the original, at most $75 more. After 30 days you must create a new authorization.
- Sandbox: a search summary said sandbox authorizations do not expire at 29 days (LOW).
- **Plan for the strict reading:** at most ONE reauthorization, then the 29-day cap. This matches PROJECT.md's concern. The rework path must therefore either finish within the 29-day cap or force a fresh order. Record every authorization ID in the ledger with `parent_authorization_id`.
- Capture body has `amount`, `final_capture` (default `false`), `invoice_id`, `note_to_payer`. Use `final_capture: true` for full releases and judge splits; `false` for the 30% kill fee so the remainder stays authorized for the judge to resolve.
- `void` fails on a fully captured authorization. Refund is needed after capture.
- One search result said partial captures on PayPal-account authorizations may need enabling on the merchant account (LOW, from a legacy doc). Test it in the first PayPal spike.
- Use `PayPal-Request-Id` (the SDK's `paypalRequestId`) as `job:{id}:{transition}:{n}` on every mutating call.
- `PAYMENT.AUTHORIZATION.CREATED`, `PAYMENT.AUTHORIZATION.VOIDED`
- `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.PENDING`, `PAYMENT.CAPTURE.DECLINED` (the v2 event), `PAYMENT.CAPTURE.DENIED` (the v1 event; handle both for "capture denied"), `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED`
- `CHECKOUT.ORDER.APPROVED`
- `PAYMENT.PAYOUTSBATCH.SUCCESS`, `PAYMENT.PAYOUTSBATCH.DENIED`, `PAYMENT.PAYOUTSBATCH.PROCESSING`
- `PAYMENT.PAYOUTS-ITEM.SUCCEEDED`, `.FAILED`, `.UNCLAIMED`, `.BLOCKED`, `.HELD`, `.RETURNED`, `.REFUNDED`, `.CANCELED`

### 8. LLM integration (HIGH on SDK shape, MEDIUM on cross-vendor parity)

- Use `client.messages.parse({ model, max_tokens, messages, output_config: { effort: 'medium', format: zodOutputFormat(RubricSchema) } })`. `output_format` is deprecated.
- Image input is a base64 `image` block (or a `file_id` from the Files API). Supported formats are **JPEG, PNG, GIF, WebP only. No HEIC, and no video.** Max 10 MB base64 per image; 8000x8000 px max; above 20 images per request a stricter 2000 px per-side limit applies. Standard tier resizes at a 1568 px long edge, Codex 4.7 and later at 2576 px. Put images before the text and label each ("Image 3: after photo for checklist item 2").
- Codex does **not** read image metadata, so the EXIF facts must be passed as text only if you want them considered; the blueprint's integrity gate runs in code, not in the model, which is correct.
- **Breaking changes to design around (HIGH, from the Codex API skill):** on Opus 5.5 and Sonnet 5.5, thinking cannot be disabled (omit `thinking`, set `output_config.effort` explicitly; Opus 5.5 defaults to `medium`); forced `tool_choice` returns 400, so use structured outputs instead of "tool as JSON mode"; `temperature`, `top_p` and `top_k` return 400 on every model from 2026-10-21. So "pinned prompt" reproducibility must come from storing the exact prompt, evidence hashes, model ID and raw response, **not from temperature 0**.
- Refusals: `stop_reason: "refusal"` comes back as HTTP 200. Treat it as an outage for that vendor, route to the customer, and log it. Do NOT enable server-side `fallbacks`: a silent switch to another Codex model would change what the verdict log says was used.
- Set a client timeout of about 60 seconds and `maxRetries: 1`; run both vendors with `Promise.allSettled`.
- `ai.models.generateContent({ model, contents, config: { responseMimeType: 'application/json', responseJsonSchema } })`. Build the JSON Schema from the same Zod schema (`z.toJSONSchema` in Zod 4). The server ignores `minLength`, `maxLength`, `minProperties`, `uniqueItems` and a few more constraints, so always re-validate the parsed result with Zod. `minimum` and `maximum` on numbers are supported.
- Video: inline data is for requests under 20 MB total; larger files go through `ai.files.upload` and you must wait until the file state is `ACTIVE` before use. At the default resolution a video costs about 100 tokens per second.
- **Parity rule:** send BOTH vendors the same pinned JPEG evidence set (before/after pairs plus the same extracted keyframes) so the 1.5-point agreement test compares like with like. Optionally also give Gemini the proxy video for criterion C4 (working proof), and record that asymmetry in the verdict log. This is the one place the "same pinned prompt" rule is intentionally relaxed.

### 9. EXIF, camera capture, and the iOS GPS problem (HIGH that it is a risk, MEDIUM on exact behaviour)

- **Use `<input type="file" accept="image/*" capture="environment">`** for photos and `accept="video/*" capture="environment"` for video. The browser hands you the camera app's original file with its EXIF. Upload that `File` object unchanged straight to the presigned PUT URL. Never draw it to a `<canvas>`, call `toBlob`, or re-encode it. Preview with `URL.createObjectURL`.
- **`getUserMedia` plus canvas strips EXIF and GPS entirely**, so do not use it for evidence. The only reason to use it is a live guided viewfinder, and then you accept zero EXIF.
- `capture` is ignored on desktop browsers (a plain file picker opens). That helps: demo footage shot on a laptop with prepared photos that still carry EXIF will work.
- **Critical finding:** WebKit bugs 257534 and 263192 and Apple forum threads report that **iOS Safari strips GPS metadata from photos taken through a file input's camera path** (since iOS 16.4), while library picks can keep it. One Apple forum thread says date and GPS were both missing for a camera-path Live Photo. iOS video through the browser also lacked GPS. Android behaviour was not confirmed (LOW). Search summaries, so MEDIUM at best.
- **Consequence for the integrity gate (blueprint stage 2):** "EXIF GPS within 300 m" cannot be a hard requirement. Design it as:
- **HEIC:** iOS usually transcodes HEIC to JPEG on upload from Safari, but do not rely on it. `exifr` reads HEIC. **`sharp`'s prebuilt binaries decode AVIF-style HEIF but not HEVC-coded HEIC** (patent licensing; LOW-MEDIUM, from memory of sharp's docs). If a HEIC arrives, mark `needs_conversion` and fall back to asking the worker to retake with "Most Compatible" format, or add `heic-convert` later.
- **Read EXIF before any resize:** in the ingest job, download the original from R2, run `exifr.parse(buffer, { tiff: true, exif: true, gps: true })` first, store the result as JSONB, then produce derivatives.
- **EXIF is not tamper-proof.** It can be edited. That is why it is one input among several (pHash, device GPS, server times).

### 10. Perceptual hashing, reuse index, and Elastic (MEDIUM)

- Compute `sharp-phash` on the oriented original, which gives a 64-bit hash. Store it in Postgres as `bit(64)` on the `evidence` row. Postgres is the source of truth.
- **After vs before (edited-before check):** compare the two hashes in process: Hamming distance is `bit_count(a # b)` in SQL or the library's `distance` helper in JS. Very small distance means near-duplicate (suspicious).
- **Reuse across all past photos:** index into Elastic as a `dense_vector` with `element_type: "bit"`, `dims: 64`. Per Elastic's 9.0 docs bit vectors use `l2_norm` as the only similarity, which is Hamming distance, and the score is `(numBits - hamming) / numBits`. So "Hamming 10 or less" equals "score 0.84375 or more". Query with `knn` (`k: 10`, `num_candidates: 100`) and a `bool` filter excluding the current job. The docs show query vectors as signed byte arrays (8 bytes for 64 bits); the hex-string form appears only for indexed document values, so use the byte array in queries. Re-check each hit's Hamming distance in code instead of trusting only the score threshold.
- **Fallback if kNN-on-bits misbehaves:** split the 64 bits into four 16-bit `keyword` band tokens, query by any band match, then compute Hamming in code. Or run a Postgres scan with `bit_count(phash # $1) <= 10` (fine at demo scale). Fail open: if Elastic is down, use Postgres, and never block verification on Elastic.
- **Verdict log:** write each verdict to Postgres first (append-only table), then index a copy into Elastic `verdicts` (fields: `job_id`, `model_ids`, `route`, `scores`, `flags`, `reasons` as text, `created_at`). A judge-console search box is a single `multi_match`.
- **Client and hosting:** `@elastic/elasticsearch@9.5.1` with `node` URL plus `auth.apiKey`. Elastic Cloud trial (14 days; hosted or serverless project). Create a restricted API key limited to the two indices. Sources conflicted on whether the 9.x client works with serverless (LOW), so test on day 1.

### 11. Video keyframes (MEDIUM-HIGH)

- **Do not use `fluent-ffmpeg`.** It is flagged deprecated on npm ("Package no longer supported", last release May 2025). Call the binary yourself.
- In the worker: write the R2 object to a temp file, `ffprobe` for duration and codec, then `ffmpeg -i in -vf "fps=1/2,scale='min(1280,iw)':-2" -frames:v 6 -q:v 3 f_%02d.jpg` (about 6 frames evenly spaced; swap to a scene filter if needed). Also transcode a 720p H.264/AAC `proxy.mp4` with `-movflags +faststart -crf 28`.
- The proxy matters twice: iPhone clips are HEVC `.mov`, which Chrome and Firefox cannot play (so the judge viewer needs the proxy), and a 720p proxy usually fits under Gemini's 20 MB inline limit.
- Resource: a Render Starter worker has 512 MB RAM. Keep ffmpeg to one job at a time (pg-boss `batchSize: 1` or worker concurrency 1) and stream to disk, not memory.

### 12. Reverse and stock image check (LOW-MEDIUM; the weakest area)

- **Primary: Google Cloud Vision API Web Detection** (`images:annotate`, feature `WEB_DETECTION`) over plain `fetch` with an API key, so no SDK. It returns pages and images on the web that match. Pricing from Google's table: first 1,000 units per month free, then $3.50 per 1,000 (LOW: localized pricing pages via search). Needs a Google Cloud project with billing enabled.
- The check is a signal, not proof. Stock-photo matches go into the flags; a miss means nothing. Run it on after photos only (cheap), after the pHash gate.
- **Demo-safe layer:** seed Elastic with a small `source: "stock"` set (a dozen well-known aircon stock images) so the fraud-catch demo works deterministically and offline from Vision.
- **Not recommended:** Bing Visual Search (I believe Microsoft retired the Bing Search APIs in August 2025; not re-verified here, so LOW) and TinEye (paid API, not worth it for a hackathon). Do not ask an LLM whether an image is stock: Anthropic's vision docs say Codex cannot tell if an image is AI-generated and may be wrong.

### 13. Maps and geofence (HIGH)

- Customer drops a pin with `react-leaflet` + OSM tiles; store `lat`/`lng` as `double precision` plus an `earth` index: `CREATE INDEX ON jobs USING gist (ll_to_earth(lat, lng))`. Job board query: `WHERE earth_box(ll_to_earth($lat,$lng), $meters) @> ll_to_earth(lat,lng) AND earth_distance(...) <= $meters`. Both `cube` and `earthdistance` are available on Render Postgres.
- Geofence check is a 10-line `haversine(a, b)` function in `lib/geo.ts`, shared by server (authoritative, 300 m) and client (UX hint). No library needed. If you want one, `geolib@4.0.0` exists, but it is not worth a dependency.
- Address search: use Nominatim only on an explicit "Search" button press (its policy is 1 request per second and needs a User-Agent; no autocomplete). The pin is the source of truth anyway. OSM's public tile servers are for light use; fine for a demo, attribution required. If tiles look slow, MapTiler's free tier is the escape hatch.
- Not recommended: Mapbox GL (tokens and billing for no demo gain), `maplibre-gl@6.16.0` (good, but needs a tile style source).

### 14. Zapier notifications (LOW-MEDIUM)

- Pattern: a `notification_outbox` table written in the same transaction as the state change; the worker's `notify-zapier` queue POSTs JSON `{ event, jobId, to, subject, body, deepLink }` to a Catch Hook URL kept in env, with exponential-backoff retries. Zapier then runs "Email by Zapier" or Gmail for the email action.
- One Zap with a Catch Hook plus a Paths or Filter step on `event` is enough. Webhooks by Zapier is a **premium app**; use the 14-day trial or a paid plan, and confirm sponsor-rules eligibility. A Catch Hook URL is a bearer secret, so keep it in env and never in the repo.
- Live in-app status is the SSE stream, not Zapier.

### 15. PWA shell (MEDIUM)

- Keep it minimal: `app/manifest.ts` (name, icons 192 and 512, `display: "standalone"`, `start_url`), apple-touch icon, and `viewport` meta. This gives an installable app and full-screen camera flows.
- Skip offline caching. `@serwist/next@9.5.13` relies on webpack hooks while Next 16 builds with Turbopack by default; `@serwist/turbopack@9.5.13` exists but I found no verified guide (LOW). `next-pwa@5.6.0` is unmaintained. If installability needs a service worker on some Android versions, add a tiny hand-written `public/sw.js` with an empty `fetch` handler instead of Serwist.
- Service workers must never cache presigned R2 URLs or `/api` responses.

## Infrastructure on Render

| Service | Type | Plan | Notes |
|---------|------|------|-------|
| `pwd-web` | Web Service (Node) | Starter (paid; not Free) | Build: `npm ci && npm run build`; start: `npm run start` (`next start`, binds `$PORT`). Free tier sleeps after 15 minutes and would miss or delay webhooks. Add a health-check path. |
| `pwd-worker` | Background Worker | Starter (paid; no free tier) | Start: `tsx worker/index.ts`. Same repo, same env group. |
| `pwd-db` | Postgres 18 | Smallest paid Basic | Free expires after 30 days. Use the internal URL from both services, `sslmode=require`. |

## Installation

# Scaffold (Next 16, TS, Tailwind, App Router)

# Core

# Payments

# AI

# Storage, search

# Evidence processing (worker; sharp also used by web if you resize there)

# Map

# Dev

# UI kit (CLI, then add components as needed)

## Alternatives Considered

| Category | Recommended | Alternative | Why Not (or when to switch) |
|----------|-------------|-------------|-----------------------------|
| ORM | Drizzle 0.45.4 | Prisma 7.10.1 | Fine if already fluent; needs `prisma.config.ts`, a generator `output`, and `@prisma/adapter-pg`. Never Prisma 8 RC (the CLI's `latest` tag points to it). |
| Auth | Better Auth 1.7.14 | Auth.js v5 | Still `beta` on npm and in security-patch mode since joining Better Auth. |
| Auth | Better Auth | Lucia 3.2.2 | Legacy library; no new features. |
| Realtime | SSE + LISTEN/NOTIFY | WebSocket (`ws`, Socket.IO) | Route handlers cannot upgrade; would need a second server for one-way data. |
| Queue | pg-boss 12 | BullMQ 6.5.0 | Needs Redis (Render Key Value) as a third store. |
| Queue | pg-boss 12 | Render Cron Job | Container per run, at least $1 per month, no shared clock offset or retries. |
| Storage | Cloudflare R2 | AWS S3 / Supabase Storage | Egress cost / extra vendor and auth. R2 free tier is enough. |
| Checkout button | `react-paypal-js/sdk-v6` | Legacy `PayPalScriptProvider` | Legacy is the documented fallback if v6 misbehaves in sandbox. |
| PayPal client | Server SDK 2.5.0 + raw fetch | Raw REST for everything | SDK gives types and request-id support for Orders/Payments; REST only where the SDK has no coverage. |
| pHash | `sharp-phash` | `imghash@1.1.5` | Pulls `jpeg-js`, `@canvas/image`, `blockhash-core`; slower and no benefit over sharp. |
| Video | `ffmpeg-static` + `execFile` | `fluent-ffmpeg` | npm-deprecated. |
| Map | Leaflet 1.9.4 + react-leaflet 5 | Mapbox GL / MapLibre 6 | Token and billing, or a tile-style setup, for no demo gain. |
| PWA | `manifest.ts` + optional stub SW | Serwist / `next-pwa` | Webpack-based; Next 16 defaults to Turbopack; `next-pwa` unmaintained. |
| Gemini API | `generateContent` | Newer `interactions` surface | Docs show it, but `generateContent` + `responseJsonSchema` is stable in 2.31.0. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `typescript@latest` (7.0.2) | Native-port 7.x is outside `typescript-eslint@8.72.1`'s peer range (`<6.1.0`) | `typescript@~5.9.3` |
| `prisma@latest` | Dist-tag is `8.0.0-rc.27` | Drizzle, or pin `prisma@7.10.1` |
| `next-auth` v4 or v5 beta, `lucia` | Maintenance mode / legacy / beta | `better-auth@1.7.14` |
| `@paypal/checkout-server-sdk`, `paypal-rest-sdk`, `paypal-node-sdk` | Legacy PayPal SDKs (superseded by `@paypal/paypal-server-sdk`) | `@paypal/paypal-server-sdk@2.5.0` |
| The `/v1/payments/payment` API | Deprecated per PayPal's Payments v1 page | Orders v2 and Payments v2 |
| `getUserMedia` + canvas for evidence photos | Strips EXIF and GPS | `<input type="file" capture>` and upload the File untouched |
| Trusting EXIF GPS as a hard gate | iOS camera path strips it; EXIF is editable | Device GPS plus server times, EXIF as corroboration |
| `temperature` / `top_p` / `top_k` on Codex calls | 400 on every model since 2026-10-21 | Store prompt, hashes, model ID, raw output for reproducibility |
| Forced `tool_choice` or `thinking: {type:"disabled"}` on Opus 5.5 / Sonnet 5.5 | 400 | `output_config.format` structured outputs; control effort instead |
| Codex server-side `fallbacks` on the judge | Hidden model switch corrupts the pinned verdict record | Treat refusal or error as outage, route to the customer |
| `fluent-ffmpeg` | npm-deprecated | `ffmpeg-static` + `child_process.execFile` |
| Free Render web service or free Postgres for the demo | Sleeps in 15 minutes; Postgres deleted after 30 days + 14 | Paid Starter web, worker and DB |
| Edge runtime for webhook, SSE or `pg` routes | No Node APIs, no sockets | `export const runtime = 'nodejs'` |
| In-process `node-cron` inside the Next server | Dies with web restarts, duplicates across instances | pg-boss in a separate worker |
| Webhook Simulator for signature testing | Mock events fail verification | Real sandbox transactions plus a tunnel or Render URL |

## Stack Patterns by Variant

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `next@16.4.3` | `react@19.3.1`, Node `>=20.9` | Peer deps accept `^19`. TypeScript minimum 5.1. |
| `react-leaflet@5.0.0` | `react@^19`, `leaflet@^1.9` | Will not install against React 18. Leaflet 2.0 is alpha. |
| `better-auth@1.7.14` | `next ^14 or 15 or 16`, `drizzle-orm ^0.45.2`, `drizzle-kit >=0.31.4`, `pg ^8` | Add `nextCookies()` as the last plugin. |
| `drizzle-orm@0.45.4` | `pg >=8`, `postgres >=3` | Use `pg` for pg-boss sharing. |
| `pg-boss@12.38.0` | Node `>=22.12`, `pg ^8.23.1` | Set `NODE_VERSION` on Render accordingly. |
| `@anthropic-ai/sdk@1.3.0` | `zod ^3.25 or ^4` | Use `@anthropic-ai/sdk/helpers/zod`. |
| `@google/genai@2.31.0` | Node `>=20`; 3.0.0 will need 22+ | Pin below 3.0.0. |
| `sharp@0.35.5` | Node `>=20.9`; `sharp-phash` peer `>=0.32` | Auto-external in Next; keep sharp work in the worker where possible. |
| `@aws-sdk/client-s3` and `s3-request-presigner` | Same version | Mixing versions causes type and signing errors. |
| `@elastic/elasticsearch@9.5.1` | Elasticsearch 9.x | Keep client major equal to server major. |
| `typescript@5.9.3` | `typescript-eslint@8.72.1` (`<6.1.0`), Next 16 | 7.x is not supported by typescript-eslint 8.72. |

## Spikes required (do these first; each is under half a day)

## Sources

- npm registry on 2026-10-27 (`npm view` for versions, dist-tags, peer dependencies and engines of all packages above) and unpacked tarballs of `@paypal/paypal-server-sdk@2.5.0` (controllers list), `@paypal/react-paypal-js@10.6.1` (README, exports map), `@google/genai@2.31.0` (README, typings), `sharp-phash@2.2.0` (source), `exifr@7.1.3` (README), `pg-boss@12.38.0` (README, dependencies). HIGH.
- PayPal Payments v2 and Payouts v1 OpenAPI schema files (`developer.paypal.com/api/payments/v2/schema.json`, `.../payments.payouts-batch/v1/schema.json`) and the webhook event-names page (`developer.paypal.com/api/rest/webhooks/event-names/`), fetched 2026-10-27. HIGH for the quoted contract text, including the reauthorize contradiction.
- PayPal "Authorize a payment and capture funds later" (`developer.paypal.com/docs/checkout/standard/customize/authorization`), 3-day honor period, 29-day hold, multiple reauthorizations. MEDIUM.
- Next.js 16 release post (`nextjs.org/blog/next-16`) and the route handler reference (`nextjs.org/docs/app/api-reference/file-conventions/route`, last updated 2026-04-30). MEDIUM-HIGH.
- Better Auth docs: admin plugin and Next.js integration (`better-auth.com/docs/plugins/admin`, `.../integrations/next`); Auth.js joins Better Auth (`better-auth.com/blog/authjs-joins-better-auth`, search summary). MEDIUM.
- Codex API skill (bundled, model table cached 2026-10-06; API drift table) and Anthropic vision docs (`platform.claude.com/docs/en/build-with-claude/vision`). HIGH / MEDIUM.
- Google Gemini docs: models, video understanding, structured output (`ai.google.dev/gemini-api/docs/...`). MEDIUM; model IDs not smoke-tested.
- Render docs: free tier, Postgres creating/connecting, extensions, cron jobs, web services (`render.com/docs/...`). MEDIUM. Request-timeout and price figures not found (LOW).
- Cloudflare R2 docs: presigned URLs, pricing, CORS (`developers.cloudflare.com/r2/...`). MEDIUM-HIGH.
- Elastic dense_vector reference 9.0 (`elastic.co/guide/en/elasticsearch/reference/9.0/dense-vector.html`). MEDIUM.
- WebKit bugs 257534 and 263192 and Apple Developer Forums threads on iOS camera-path GPS stripping (search summaries). MEDIUM-LOW.
- Google Cloud Vision pricing (search summary of localized pages). LOW.
- Zapier premium-app status for Webhooks by Zapier (search summary; sources disagree on the cheapest tier). LOW.

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.Codex/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-Codex-profile` -- do not edit manually.
<!-- GSD:profile-end -->
