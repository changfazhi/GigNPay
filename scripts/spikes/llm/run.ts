import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { evidenceDir, loadLocalEnv } from "../../lib/local-env";
import { assertNoSecrets, redact, writeEvidence } from "../../lib/redact";
import { prepareFixtures, type FixtureImage } from "./fixtures";
import {
  AVG_BAR,
  MIN_BAR,
  RUBRIC_PROMPT,
  Rubric,
  TOLERANCE,
  criterionAverage,
  meetsAutoReleaseBar,
  vendorGap,
  type RubricResult,
} from "./rubric";

const ROUNDS = 3;
const TIMEOUT_MS = 120_000;
const RAW_LIMIT = 4000;
const GEMINI_PREFERENCE = ["gemini-3.8-flash", "gemini-3.6-flash"];
const CLAUDE_DEFAULT = "claude-opus-5-5";
// USD per million tokens for the Claude judge, from the project stack notes (not re-confirmed here).
const CLAUDE_PRICE = { input: 4, output: 20, confirmed: false };

type Vendor = "claude" | "gemini";

type CallRecord = {
  vendor: Vendor;
  round: number;
  requestedModel: string;
  model: string | null;
  surface: string;
  latencyMs: number;
  imageLabels: string[];
  usage: unknown;
  stopReason: string | null;
  rawText: string | null;
  schemaValid: boolean;
  zodIssues: unknown;
  scores: Record<string, number> | null;
  average: number | null;
  meetsAutoReleaseBar: boolean | null;
  instructionalTextInMedia: boolean | null;
  suspiciousTextQuote: string | null;
  estimatedCostUsd: number | null;
  costNote: string;
  outage: boolean;
  outageReason: string | null;
  parsed: RubricResult | null;
};

function errMessage(e: unknown): string {
  return e instanceof Error ? `${e.name}: ${e.message}` : String(e);
}

function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctrl.abort();
      reject(new Error(`timeout after ${TIMEOUT_MS} ms`));
    }, TIMEOUT_MS);
  });
  return Promise.race([run(ctrl.signal), timeout]).finally(() => clearTimeout(timer));
}

function b64(img: FixtureImage): string {
  return readFileSync(img.path).toString("base64");
}

function promptFor(images: FixtureImage[]): string {
  const order = images.map((img, i) => `Image ${i + 1}: ${img.label}`).join("\n");
  return `${RUBRIC_PROMPT}\n\nImage order:\n${order}`;
}

function emptyRecord(
  vendor: Vendor,
  round: number,
  requestedModel: string,
  surface: string,
  images: FixtureImage[],
): CallRecord {
  return {
    vendor,
    round,
    requestedModel,
    model: null,
    surface,
    latencyMs: 0,
    imageLabels: images.map((i) => i.label),
    usage: null,
    stopReason: null,
    rawText: null,
    schemaValid: false,
    zodIssues: null,
    scores: null,
    average: null,
    meetsAutoReleaseBar: null,
    instructionalTextInMedia: null,
    suspiciousTextQuote: null,
    estimatedCostUsd: null,
    costNote: "",
    outage: true,
    outageReason: null,
    parsed: null,
  };
}

/** Re-validate with the full schema (ranges included) and fill the scoring fields. */
function applyValidation(rec: CallRecord, candidate: unknown): void {
  try {
    const parsed = Rubric.parse(candidate);
    rec.schemaValid = true;
    rec.parsed = parsed;
    rec.scores = Object.fromEntries(
      Object.entries(parsed.criteria).map(([k, v]) => [k, v.score]),
    );
    rec.average = criterionAverage(parsed);
    rec.meetsAutoReleaseBar = meetsAutoReleaseBar(parsed);
    rec.instructionalTextInMedia = parsed.instructional_text_in_media;
    rec.suspiciousTextQuote = parsed.suspicious_text_quote;
  } catch (e) {
    rec.schemaValid = false;
    rec.zodIssues = e instanceof z.ZodError ? e.issues : errMessage(e);
    rec.outage = true;
    rec.outageReason = "schema validation failed";
  }
}

async function callClaude(
  client: Anthropic,
  model: string,
  round: number,
  images: FixtureImage[],
): Promise<CallRecord> {
  const rec = emptyRecord("claude", round, model, "messages.parse", images);
  const started = Date.now();
  try {
    const res = await withTimeout(() =>
      client.messages.parse({
        model,
        max_tokens: 16000,
        output_config: { effort: "medium", format: zodOutputFormat(Rubric) },
        messages: [
          {
            role: "user",
            content: [
              ...images.map((img) => ({
                type: "image" as const,
                source: { type: "base64" as const, media_type: "image/jpeg" as const, data: b64(img) },
              })),
              { type: "text" as const, text: promptFor(images) },
            ],
          },
        ],
      }),
    );
    rec.latencyMs = Date.now() - started;
    rec.model = res.model;
    rec.usage = res.usage;
    rec.stopReason = res.stop_reason ?? null;
    const text = res.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    rec.rawText = text.slice(0, RAW_LIMIT);
    if (res.stop_reason === "refusal") {
      rec.outage = true;
      rec.outageReason = "refusal";
      return rec;
    }
    rec.outage = false;
    applyValidation(rec, res.parsed_output);
    const u = res.usage as { input_tokens?: number; output_tokens?: number };
    if (typeof u.input_tokens === "number" && typeof u.output_tokens === "number") {
      rec.estimatedCostUsd =
        (u.input_tokens * CLAUDE_PRICE.input + u.output_tokens * CLAUDE_PRICE.output) / 1_000_000;
      rec.costNote = `estimate at $${CLAUDE_PRICE.input}/$${CLAUDE_PRICE.output} per MTok (price from project stack notes, not re-confirmed)`;
    }
  } catch (e) {
    rec.latencyMs = Date.now() - started;
    rec.outage = true;
    rec.outageReason = errMessage(e);
  }
  return rec;
}

function collectInteractionText(node: unknown, out: string[]): void {
  if (Array.isArray(node)) {
    for (const n of node) collectInteractionText(n, out);
  } else if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    if (o.type === "text" && typeof o.text === "string") out.push(o.text);
    for (const v of Object.values(o)) {
      if (v && typeof v === "object") collectInteractionText(v, out);
    }
  }
}

function geminiSchema(): Record<string, unknown> {
  const schema = { ...(z.toJSONSchema(Rubric) as Record<string, unknown>) };
  delete schema.$schema;
  return schema;
}

async function callGemini(
  ai: GoogleGenAI,
  model: string,
  round: number,
  images: FixtureImage[],
): Promise<CallRecord> {
  const rec = emptyRecord("gemini", round, model, "models.generateContent", images);
  const started = Date.now();
  const prompt = promptFor(images);
  const schema = geminiSchema();

  const viaGenerateContent = async () => {
    const res = await withTimeout((signal) =>
      ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              ...images.map((img) => ({ inlineData: { mimeType: "image/jpeg", data: b64(img) } })),
              { text: prompt },
            ],
          },
        ],
        config: { responseMimeType: "application/json", responseJsonSchema: schema, abortSignal: signal },
      }),
    );
    rec.model = res.modelVersion ?? null;
    rec.usage = res.usageMetadata ?? null;
    rec.stopReason = res.candidates?.[0]?.finishReason ?? null;
    return res.text ?? "";
  };

  const viaInteractions = async () => {
    rec.surface = "interactions.create";
    const res = await withTimeout(() =>
      ai.interactions.create({
        model,
        input: [
          ...images.map((img) => ({ type: "image" as const, data: b64(img), mime_type: "image/jpeg" })),
          { type: "text" as const, text: prompt },
        ],
        response_format: { type: "text", mime_type: "application/json", schema },
      }),
    );
    const r = res as unknown as Record<string, unknown>;
    rec.model = typeof r.model === "string" ? r.model : null;
    rec.usage = r.usage ?? null;
    rec.stopReason = typeof r.status === "string" ? r.status : null;
    const parts: string[] = [];
    collectInteractionText(r, parts);
    return parts.join("");
  };

  let text = "";
  try {
    try {
      text = await viaGenerateContent();
    } catch (first) {
      rec.costNote = `generateContent failed (${errMessage(first)}); retried once via interactions`;
      text = await viaInteractions();
    }
    rec.latencyMs = Date.now() - started;
    rec.rawText = text.slice(0, RAW_LIMIT);
    rec.outage = false;
    if (rec.stopReason && !/^(STOP|completed)$/i.test(rec.stopReason)) {
      rec.outage = true;
      rec.outageReason = `finish reason ${rec.stopReason}`;
    }
    let candidate: unknown;
    try {
      candidate = JSON.parse(text);
    } catch (e) {
      rec.outage = true;
      rec.outageReason = `output is not JSON (${errMessage(e)})`;
      return rec;
    }
    applyValidation(rec, candidate);
    if (rec.outage && !rec.outageReason) rec.outageReason = "schema validation failed";
    rec.costNote = `${rec.costNote} cost not estimated: Gemini price per token not confirmed`.trim();
  } catch (e) {
    rec.latencyMs = Date.now() - started;
    rec.outage = true;
    rec.outageReason = errMessage(e);
  }
  return rec;
}

async function listGeminiModels(ai: GoogleGenAI): Promise<{ all: number; relevant: string[]; error: string | null }> {
  const relevant: string[] = [];
  let all = 0;
  try {
    const pager = await ai.models.list();
    for await (const m of pager) {
      all += 1;
      const name = (m.name ?? "").replace(/^models\//, "");
      if (/flash|gemini-4/i.test(name)) relevant.push(name);
    }
    return { all, relevant, error: null };
  } catch (e) {
    return { all, relevant, error: errMessage(e) };
  }
}

function range(values: number[]): string {
  return values.length ? `${Math.min(...values)}-${Math.max(...values)} ms` : "n/a";
}

async function main(): Promise<void> {
  const keysSeen = loadLocalEnv();
  const missing = ["ANTHROPIC_API_KEY", "GEMINI_API_KEY"].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`missing env keys: ${missing.join(", ")} (loaded ${keysSeen.length} keys from .env.local)`);
    process.exit(1);
  }

  const fixtures = await prepareFixtures();
  const pairs = fixtures.images.filter((i) => i.kind === "before-after");
  const sign = fixtures.images.find((i) => i.kind === "sign");

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const list = await listGeminiModels(ai);
  const geminiModel =
    process.env.GEMINI_MODEL ??
    GEMINI_PREFERENCE.find((id) => list.relevant.includes(id)) ??
    GEMINI_PREFERENCE[0];
  const claudeModel = process.env.CLAUDE_JUDGE_MODEL ?? CLAUDE_DEFAULT;
  console.log(`claude model: ${claudeModel}; gemini model: ${geminiModel} (list ok: ${list.error === null})`);

  const calls: CallRecord[] = [];
  const rounds: { round: number; gap: number | null; withinTolerance: boolean | null; note: string }[] = [];

  for (let round = 1; round <= ROUNDS; round += 1) {
    const images = round === ROUNDS && sign ? [...pairs, sign] : pairs;
    const [c, g] = await Promise.allSettled([
      callClaude(anthropic, claudeModel, round, images),
      callGemini(ai, geminiModel, round, images),
    ]);
    const claudeRec =
      c.status === "fulfilled"
        ? c.value
        : { ...emptyRecord("claude", round, claudeModel, "messages.parse", images), outageReason: errMessage(c.reason) };
    const geminiRec =
      g.status === "fulfilled"
        ? g.value
        : { ...emptyRecord("gemini", round, geminiModel, "models.generateContent", images), outageReason: errMessage(g.reason) };
    calls.push(claudeRec, geminiRec);

    if (claudeRec.parsed && geminiRec.parsed) {
      const gap = vendorGap(claudeRec.parsed, geminiRec.parsed);
      rounds.push({ round, gap, withinTolerance: gap <= TOLERANCE, note: "" });
    } else {
      rounds.push({ round, gap: null, withinTolerance: null, note: "a vendor produced no valid scores this round" });
    }
    console.log(
      `round ${round}: claude ${claudeRec.outage ? "OUTAGE" : "ok"} ${claudeRec.latencyMs}ms, gemini ${geminiRec.outage ? "OUTAGE" : "ok"} ${geminiRec.latencyMs}ms`,
    );
  }

  const byVendor = (v: Vendor) => calls.filter((x) => x.vendor === v);
  const validCount = (v: Vendor) => byVendor(v).filter((x) => x.schemaValid && !x.outage).length;

  writeEvidence("s-llm", "runs.json", {
    generatedAt: new Date().toISOString(),
    fixtureMode: fixtures.mode,
    models: {
      claudeRequested: claudeModel,
      claudeAnswered: [...new Set(byVendor("claude").map((x) => x.model))],
      geminiChosen: geminiModel,
      geminiAnswered: [...new Set(byVendor("gemini").map((x) => x.model))],
    },
    geminiModelsList: { totalModels: list.all, flashOrGemini4Ids: list.relevant, error: list.error },
    decisions: {
      serverSideModelSwitching: "not used on the Claude judge; a silent model change would falsify the verdict log",
      samplingParametersSent: false,
      forcedToolSelectionSent: false,
      thinkingOverrideSent: false,
      claudeMaxRetries: 0,
      timeoutMsPerCall: TIMEOUT_MS,
    },
    thresholds: { tolerance: TOLERANCE, avgBar: AVG_BAR, minBar: MIN_BAR },
    calls,
    rounds,
    summary: {
      claudeSchemaValid: `${validCount("claude")}/${ROUNDS}`,
      geminiSchemaValid: `${validCount("gemini")}/${ROUNDS}`,
    },
  });

  // ---- RESULT.md ----
  const date = new Date().toISOString().slice(0, 10);
  const placeholder = fixtures.mode === "placeholder";
  const claudeCalls = byVendor("claude");
  const geminiCalls = byVendor("gemini");
  const outages = calls.filter((x) => x.outage);
  const neverAnswered = (v: Vendor) => byVendor(v).every((x) => x.outage && x.latencyMs >= 0 && !x.rawText);
  const gaps = rounds.filter((r) => r.gap !== null);
  const signRound = calls.filter((x) => x.round === ROUNDS && x.parsed);
  const signFlags = signRound.map((x) => `${x.vendor}=${x.instructionalTextInMedia}`).join(", ") || "no valid round-3 output";
  const bar = calls.filter((x) => x.meetsAutoReleaseBar !== null);
  const barPass = bar.filter((x) => x.meetsAutoReleaseBar).length;

  let status: string;
  if (neverAnswered("claude") || neverAnswered("gemini")) {
    const who = neverAnswered("claude") ? "claude" : "gemini";
    status = `BLOCKED (${who} never answered: ${byVendor(who)[0]?.outageReason ?? "unknown"})`;
  } else if (validCount("claude") === ROUNDS && validCount("gemini") === ROUNDS) {
    status = "CONFIRMED";
  } else {
    status = "PARTIAL";
  }
  if (placeholder) status += " - schema and timing only";

  const outageLines = outages.length
    ? outages.map((x) => `- ${x.vendor} round ${x.round}: ${x.outageReason}`).join("\n")
    : "- none";
  const gapLines = gaps.length
    ? gaps.map((r) => `- round ${r.round}: gap ${r.gap!.toFixed(2)} (${r.withinTolerance ? "within" : "OUTSIDE"} ${TOLERANCE})`).join("\n")
    : "- no round had valid scores from both vendors";
  const costSum = (v: Vendor) => {
    const xs = byVendor(v).map((x) => x.estimatedCostUsd).filter((x): x is number => x !== null);
    return xs.length ? `about $${(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(4)} per call (estimate)` : "not estimated (price unconfirmed)";
  };

  const md = `## S-LLM - Claude and Gemini structured scoring

### Question
Do Claude and Gemini both return schema-valid structured scores for the same photos with one shared Zod rubric, how fast, at what cost, and how far apart do their scores land?

### Method
Script \`scripts/spikes/llm/run.ts\` on ${date}, fixture mode \`${fixtures.mode}\`${placeholder ? " (generated placeholder images, so scores say nothing about real work quality)" : ""}. Claude model requested \`${claudeModel}\`, answered \`${[...new Set(claudeCalls.map((x) => x.model))].join(", ") || "none"}\` via \`messages.parse\` with \`output_config.effort: "medium"\` and \`zodOutputFormat(Rubric)\`. Gemini model chosen \`${geminiModel}\` (answered \`${[...new Set(geminiCalls.map((x) => x.model))].join(", ") || "none"}\`; surface \`${[...new Set(geminiCalls.map((x) => x.surface))].join(", ")}\`) from the \`models.list\` result (${list.error ? `list failed: ${list.error}` : `${list.all} models, flash/gemini-4 ids: ${list.relevant.join(", ") || "none"}`}). Three rounds, both vendors in parallel with \`Promise.allSettled\`, ${TIMEOUT_MS / 1000} s timeout each, ${pairs.length} before/after images per call (plus the sign image in round 3). Every output was re-validated with the full Zod schema.

### What happened
- Schema-valid runs: Claude ${validCount("claude")}/${ROUNDS}, Gemini ${validCount("gemini")}/${ROUNDS}.
- Latency: Claude ${range(claudeCalls.map((x) => x.latencyMs))}, Gemini ${range(geminiCalls.map((x) => x.latencyMs))}.
- Estimated cost: Claude ${costSum("claude")}; Gemini ${costSum("gemini")}.
- Outages:
${outageLines}
- Vendor score gap per round against the ${TOLERANCE}-point tolerance:
${gapLines}
- Auto-release bar (avg >= ${AVG_BAR}, no criterion < ${MIN_BAR}) met by ${barPass}/${bar.length} valid outputs (indicator only, not a calibration).
- Sign image (round ${ROUNDS}) set \`instructional_text_in_media\`: ${signFlags}.
- No sampling parameters, forced tool selection, thinking override or server-side model switching were sent.

### Evidence
- \`spike-evidence/s-llm/fixtures.json\` (hashes and sizes only)
- \`spike-evidence/s-llm/runs.json\` (all calls, usage, stop reasons, raw text, scores, model list)

### Design impact
- AI-04 / AI-05: pin the answered model ids above in env (\`CLAUDE_JUDGE_MODEL\`, \`GEMINI_MODEL\`) and write the response model id into every verdict-log row; ${outages.length ? "the outages above show the outage path (route to the customer) must be exercised." : "no outage was observed, so the outage path rests on documented behaviour only."}
- AI-06: the shared Zod rubric works for both vendors only if re-validated after parsing; keep \`Rubric.parse\` on both outputs. Vendor gaps above decide how often the ${TOLERANCE}-point tolerance forces customer review.
- AI-08: the sign probe result above is the baseline for injection handling; the prompt tells the model to flag instruction-like text, and Phase 5 still needs the code-level guard.
- Phase 5 timeouts: use at least the observed maximum latency (Claude ${range(claudeCalls.map((x) => x.latencyMs))}, Gemini ${range(geminiCalls.map((x) => x.latencyMs))}) plus margin; the spike used ${TIMEOUT_MS / 1000} s.
- Recorded decision: no Claude fallback models on the judge (no server-side model switching); a refusal, timeout or schema failure is an outage for that vendor.

### Status
${status}
`;
  assertNoSecrets(md);
  writeFileSync(join(evidenceDir("s-llm"), "RESULT.md"), String(redact(md)));
  console.log(`status: ${status}`);
}

main().catch((e) => {
  console.error(errMessage(e));
  process.exit(1);
});
