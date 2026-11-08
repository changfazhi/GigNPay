// S-PAY reauthorization spike (plan 01-01). Standalone: plain `node` with type stripping, node:* imports only.
// Usage: node scripts/spikes/paypal/aged-orders.ts <help|create [--force]|authorize|probe-too-soon|status|probe-aged|self-check>
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

type Json = Record<string, unknown>;

type Order = {
  label: string;
  orderId: string;
  amount: string;
  approveUrl: string;
  createdAt: string;
  authId?: string;
  authStatus?: string;
  authCreateTime?: string;
  authExpirationTime?: string;
  reauthId?: string;
};

type State = {
  runId: string;
  createdAt: string;
  orders: Order[];
  authorizeReplay?: { status: number; sameAuthId: boolean; debugId: string | null };
  tooSoon?: Json;
  agedProbeDueAt?: string;
  agedProbeRanAt?: string;
  agedProbeRetryAfter?: string;
};

type Res = { status: number; debugId: string | null; body: Json };

const LABELS: [string, string][] = [
  ["A1", "20.00"],
  ["A2", "20.00"],
  ["B", "30.00"],
  ["C", "20.00"],
  ["D", "20.00"],
];

function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function mainRoot(): string {
  return dirname(git(["rev-parse", "--path-format=absolute", "--git-common-dir"]));
}

function repoTop(): string {
  return git(["rev-parse", "--show-toplevel"]);
}

const STATE_DIR = join(mainRoot(), ".spike-state");
const STATE_FILE = join(STATE_DIR, "paypal.json");
const LINKS_FILE = join(STATE_DIR, "paypal-approval-links.txt");
const EVIDENCE_DIR = join(repoTop(), ".planning", "phases", "01-foundation-deploy-spikes", "spike-evidence", "s-pay-reauth");

function loadEnv(): void {
  // .env.local wins over .env; both are optional, and variables already set win over both.
  for (const name of [".env.local", ".env"]) {
    const file = join(mainRoot(), name);
    if (existsSync(file)) process.loadEnvFile(file);
  }
}

function need(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`missing env ${key}`);
  return v;
}

function base(): string {
  return process.env.PAYPAL_API_BASE || "https://api-m.sandbox.paypal.com";
}

function readState(): State | null {
  return existsSync(STATE_FILE) ? (JSON.parse(readFileSync(STATE_FILE, "utf8")) as State) : null;
}

function mustState(): State {
  const s = readState();
  if (!s) throw new Error("no state file; run create first");
  return s;
}

function saveState(s: State): void {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2) + "\n");
}

function writeEvidence(name: string, data: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(join(EVIDENCE_DIR, name), JSON.stringify(data, null, 2) + "\n");
}

let token: string | null = null;

async function getToken(): Promise<string> {
  if (token) return token;
  const basic = Buffer.from(`${need("PAYPAL_CLIENT_ID")}:${need("PAYPAL_CLIENT_SECRET")}`).toString("base64");
  const res = await fetch(`${base()}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    throw new Error(`oauth token failed: HTTP ${res.status} (check PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET)`);
  }
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new Error("oauth token response had no token");
  token = body.access_token;
  return token;
}

async function pp(method: string, path: string, opts: { requestId?: string; body?: unknown } = {}): Promise<Res> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await getToken()}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  if (opts.requestId) headers["PayPal-Request-Id"] = opts.requestId;
  const res = await fetch(`${base()}${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let body: Json = {};
  try {
    body = text ? (JSON.parse(text) as Json) : {};
  } catch {
    body = { nonJsonBody: text.slice(0, 500) };
  }
  return { status: res.status, debugId: res.headers.get("paypal-debug-id"), body };
}

/** Copy of a response body with emails and payer names removed. */
function scrub(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) return value.map((v) => scrub(v));
  if (value && typeof value === "object") {
    const out: Json = {};
    for (const [k, v] of Object.entries(value as Json)) {
      if (key === "payer" && k === "name") continue;
      out[k] = scrub(v, k);
    }
    return out;
  }
  if (key === "email_address" && typeof value === "string") return "[sandbox-email]";
  return value;
}

function record(step: string, label: string, method: string, path: string, requestId: string | null, res: Res): Json {
  const details = Array.isArray(res.body.details) ? (res.body.details as Json[]) : [];
  return {
    step,
    label,
    method,
    path,
    requestId,
    status: res.status,
    debugId: res.debugId,
    name: typeof res.body.name === "string" ? res.body.name : null,
    message: typeof res.body.message === "string" ? res.body.message : null,
    issues: details.map((d) => d.issue),
    body: scrub(res.body),
    at: new Date().toISOString(),
  };
}

function firstAuth(body: Json): Json | null {
  const units = body.purchase_units as Json[] | undefined;
  const payments = units?.[0]?.payments as Json | undefined;
  const auths = payments?.authorizations as Json[] | undefined;
  return auths?.[0] ?? null;
}

function runIdNow(): string {
  return new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
}

async function cmdCreate(force: boolean): Promise<void> {
  const existing = readState();
  if (existing?.orders.length && !force) {
    console.error("state already has orders; pass --force to create a new set");
    process.exit(1);
  }
  const runId = runIdNow();
  const orders: Order[] = [];
  const records: Json[] = [];
  for (const [label, amount] of LABELS) {
    const requestId = `pwd-spike-create-${label}-${runId}`;
    const path = "/v2/checkout/orders";
    const res = await pp("POST", path, {
      requestId,
      body: {
        intent: "AUTHORIZE",
        purchase_units: [
          {
            reference_id: label,
            custom_id: `spike-${label}`,
            invoice_id: `pwd-spike-${label}-${runId}`,
            description: `PWD spike order ${label}`,
            amount: { currency_code: "USD", value: amount },
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              return_url: "https://example.com/pwd-spike/return",
              cancel_url: "https://example.com/pwd-spike/cancel",
              user_action: "PAY_NOW",
            },
          },
        },
      },
    });
    records.push(record("create", label, "POST", path, requestId, res));
    if (res.status !== 200 && res.status !== 201) {
      throw new Error(`create ${label} failed: HTTP ${res.status} ${String(res.body.name ?? "")} debug ${res.debugId}`);
    }
    const links = (res.body.links as { rel: string; href: string }[] | undefined) ?? [];
    const approve = links.find((l) => l.rel === "payer-action") ?? links.find((l) => l.rel === "approve");
    if (!approve) throw new Error(`create ${label}: no payer-action or approve link`);
    orders.push({ label, orderId: String(res.body.id), amount, approveUrl: approve.href, createdAt: new Date().toISOString() });
  }
  saveState({ runId, createdAt: new Date().toISOString(), orders });
  const lines = orders.map((o) => `${o.label} ${o.approveUrl}`);
  writeFileSync(LINKS_FILE, lines.join("\n") + "\n");
  for (const l of lines) console.log(l);
  writeEvidence("setup.json", { runId, orders: records });
}

async function cmdAuthorize(): Promise<void> {
  const s = mustState();
  const records: Json[] = [];
  for (const o of s.orders) {
    if (o.authId) continue;
    const got = await pp("GET", `/v2/checkout/orders/${o.orderId}`);
    if (got.body.status !== "APPROVED") {
      console.log(`${o.label}: order status ${String(got.body.status)}`);
      continue;
    }
    const path = `/v2/checkout/orders/${o.orderId}/authorize`;
    const requestId = `pwd-spike-authorize-${o.orderId}`;
    const res = await pp("POST", path, { requestId, body: {} });
    records.push(record("authorize", o.label, "POST", path, requestId, res));
    const auth = firstAuth(res.body);
    if (auth?.id) {
      o.authId = String(auth.id);
      o.authStatus = String(auth.status);
      o.authCreateTime = String(auth.create_time);
      o.authExpirationTime = String(auth.expiration_time);
      console.log(`${o.label}: authorized ${o.authId} (${o.authStatus}), expires ${o.authExpirationTime}`);
    } else {
      console.log(`${o.label}: authorize HTTP ${res.status} ${String(res.body.name ?? "")} debug ${res.debugId}`);
    }
  }
  const pending = s.orders.filter((o) => !o.authId).map((o) => o.label);
  if (!pending.length) {
    const b = s.orders.find((o) => o.label === "B")!;
    if (!s.authorizeReplay) {
      const path = `/v2/checkout/orders/${b.orderId}/authorize`;
      const requestId = `pwd-spike-authorize-${b.orderId}`;
      const res = await pp("POST", path, { requestId, body: {} });
      records.push(record("authorize-replay", "B", "POST", path, requestId, res));
      const auth = firstAuth(res.body);
      s.authorizeReplay = { status: res.status, sameAuthId: auth?.id === b.authId, debugId: res.debugId };
    }
    const a1 = s.orders.find((o) => o.label === "A1")!;
    s.agedProbeDueAt = new Date(Date.parse(a1.authCreateTime!) + (72 * 60 + 5) * 60_000).toISOString();
  }
  saveState(s);
  const prior = existsSync(join(EVIDENCE_DIR, "setup.json"))
    ? (JSON.parse(readFileSync(join(EVIDENCE_DIR, "setup.json"), "utf8")) as Json)
    : {};
  writeEvidence("setup.json", {
    runId: s.runId,
    orders: prior.orders ?? [],
    authorizations: [...((prior.authorizations as Json[] | undefined) ?? []), ...records],
    summary: s.orders.map((o) => ({
      label: o.label,
      orderId: o.orderId,
      authId: o.authId ?? null,
      authStatus: o.authStatus ?? null,
      authCreateTime: o.authCreateTime ?? null,
      authExpirationTime: o.authExpirationTime ?? null,
    })),
    authorizeReplay: s.authorizeReplay ?? null,
    agedProbeDueAt: s.agedProbeDueAt ?? null,
  });
  if (pending.length) {
    console.log(`pending approval: ${pending.join(", ")}`);
    process.exit(2);
  }
  console.log(`all five authorized; aged probe due ${s.agedProbeDueAt}`);
}

async function cmdProbeTooSoon(label = "B"): Promise<void> {
  if (label !== "B") throw new Error("probe-too-soon runs on B only");
  const s = mustState();
  const b = s.orders.find((o) => o.label === "B");
  if (!b?.authId) throw new Error("B is not authorized yet");
  const path = `/v2/payments/authorizations/${b.authId}/reauthorize`;
  const requestId = `pwd-spike-reauth-too-soon-${b.authId}`;
  const body = { amount: { currency_code: "USD", value: "30.00" } };
  const first = await pp("POST", path, { requestId, body });
  const second = await pp("POST", path, { requestId, body });
  const records = [
    record("reauth-too-soon", "B", "POST", path, requestId, first),
    record("reauth-too-soon-replay", "B", "POST", path, requestId, second),
  ];
  writeEvidence("too-soon.json", { note: "REAUTH inside the 3-day honor period on B, then the same PayPal-Request-Id again", records });
  if (first.status === 201 && first.body.id) b.reauthId = String(first.body.id);
  s.tooSoon = {
    first: { status: first.status, name: records[0].name, issues: records[0].issues, debugId: first.debugId },
    replay: { status: second.status, name: records[1].name, issues: records[1].issues, debugId: second.debugId },
  };
  saveState(s);
  console.log(JSON.stringify(s.tooSoon, null, 2));
}

async function cmdStatus(): Promise<void> {
  const s = mustState();
  for (const o of s.orders) {
    if (!o.authId) {
      const got = await pp("GET", `/v2/checkout/orders/${o.orderId}`);
      console.log(`${o.label} order ${o.orderId} ${String(got.body.status)} (not authorized)`);
      continue;
    }
    for (const id of [o.authId, o.reauthId].filter((x): x is string => !!x)) {
      const got = await pp("GET", `/v2/payments/authorizations/${id}`);
      console.log(`${o.label} ${id} ${String(got.body.status)} expires ${String(got.body.expiration_time)}`);
    }
  }
  if (s.agedProbeDueAt) console.log(`aged probe due ${s.agedProbeDueAt}`);
}

async function cmdProbeAged(): Promise<void> {
  const s = mustState();
  if (!s.agedProbeDueAt) throw new Error("no agedProbeDueAt; run authorize first");
  if (Date.now() < Date.parse(s.agedProbeDueAt)) {
    console.log(`not-due until ${s.agedProbeDueAt}`);
    return;
  }
  const a1 = s.orders.find((o) => o.label === "A1");
  if (!a1?.authId) throw new Error("A1 is not authorized");
  const orig = a1.authId;
  const amount = { currency_code: "USD", value: "20.00" };
  const records: Json[] = [];
  const call = async (step: string, method: string, path: string, requestId: string | null, body?: unknown) => {
    const res = await pp(method, path, { requestId: requestId ?? undefined, body });
    records.push(record(step, "A1", method, path, requestId, res));
    return res;
  };
  const r1 = await call("reauth-aged-1", "POST", `/v2/payments/authorizations/${orig}/reauthorize`, `pwd-spike-reauth-aged-1-${orig}`, { amount });
  if (r1.status === 422 && records[0].issues && (records[0].issues as unknown[]).includes("REAUTHORIZATION_TOO_SOON")) {
    s.agedProbeRetryAfter = new Date(Date.now() + 3600_000).toISOString();
    saveState(s);
    writeEvidence("aged-probe.json", { records });
    console.log(`still too soon; retry after ${s.agedProbeRetryAfter}`);
    return;
  }
  const newId = r1.status === 201 && r1.body.id ? String(r1.body.id) : null;
  await call("reauth-aged-2-original-again", "POST", `/v2/payments/authorizations/${orig}/reauthorize`, `pwd-spike-reauth-aged-2-${orig}`, { amount });
  if (newId) {
    await call("reauth-aged-3-of-reauth", "POST", `/v2/payments/authorizations/${newId}/reauthorize`, `pwd-spike-reauth-aged-3-${newId}`, { amount });
  }
  await call("capture-partial-original", "POST", `/v2/payments/authorizations/${orig}/capture`, `pwd-spike-capture-aged-${orig}`, {
    amount: { currency_code: "USD", value: "5.00" },
    final_capture: false,
  });
  if (newId) await call("void-new", "POST", `/v2/payments/authorizations/${newId}/void`, `pwd-spike-void-new-${newId}`, {});
  await call("void-original", "POST", `/v2/payments/authorizations/${orig}/void`, `pwd-spike-void-orig-${orig}`, {});
  await call("get-original", "GET", `/v2/payments/authorizations/${orig}`, null);
  if (newId) await call("get-new", "GET", `/v2/payments/authorizations/${newId}`, null);
  s.agedProbeRanAt = new Date().toISOString();
  saveState(s);
  writeEvidence("aged-probe.json", { original: orig, newId, records });
  for (const r of records) console.log(`${String(r.step)}: HTTP ${String(r.status)} ${String(r.name ?? "")} ${JSON.stringify(r.issues)}`);
}

function cmdSelfCheck(): void {
  const needles = [process.env.PAYPAL_CLIENT_SECRET, process.env.PAYPAL_CLIENT_ID, "access_token", "Bearer "].filter(
    (x): x is string => !!x,
  );
  if (!existsSync(EVIDENCE_DIR)) {
    console.log("self-check ok (no evidence yet)");
    return;
  }
  const bad: string[] = [];
  for (const f of readdirSync(EVIDENCE_DIR)) {
    const text = readFileSync(join(EVIDENCE_DIR, f), "utf8");
    if (needles.some((n) => text.includes(n))) bad.push(f);
  }
  if (bad.length) {
    console.error(`self-check FAILED: secret-like text in ${bad.join(", ")}`);
    process.exit(1);
  }
  console.log("self-check ok");
}

function help(): void {
  console.log(`aged-orders.ts <command>
  help             this text
  create [--force] create the five AUTHORIZE orders (A1, A2, B, C, D) and print approval links
  authorize        authorize every APPROVED order; replay B's authorize; set agedProbeDueAt
  probe-too-soon   reauthorize B inside the honor period, then replay the same request id
  status           show every authorization's status and expiry
  probe-aged       after agedProbeDueAt, run the aged reauth probe on A1 (never A2)
  self-check       fail if evidence files contain secret-like text`);
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === "help") return help();
  loadEnv();
  switch (cmd) {
    case "create":
      return cmdCreate(rest.includes("--force"));
    case "authorize":
      return cmdAuthorize();
    case "probe-too-soon":
      return cmdProbeTooSoon(rest[0]);
    case "status":
      return cmdStatus();
    case "probe-aged":
      return cmdProbeAged();
    case "self-check":
      return cmdSelfCheck();
    default:
      help();
      process.exit(1);
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
