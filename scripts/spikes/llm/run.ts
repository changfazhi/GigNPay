import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
  scoreGap,
  type RubricResult,
} from "./rubric";

const ROUNDS = 3;
const TIMEOUT_MS = 120_000;
const RAW_LIMIT = 4000;
const GEMINI_PREFERENCE = ["gemini-3.8-flash", "gemini-3.6-flash"];

type CallRecord = {
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
  round: number,
  requestedModel: string,
  surface: string,
  images: FixtureImage[],
): CallRecord {
  return {
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
  const rec = emptyRecord(round, model, "models.generateContent", images);
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
  if (!process.env.GEMINI_API_KEY) {
    console.error(`missing env key: GEMINI_API_KEY (loaded ${keysSeen.length} keys from .env.local)`);
    process.exit(1);
  }

  const fixtures = await prepareFixtures();
  const pairs = fixtures.images.filter((i) => i.kind === "before-after");
  const sign = fixtures.images.find((i) => i.kind === "sign");

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const list = await listGeminiModels(ai);
  const geminiModel =
    process.env.GEMINI_MODEL ||
    (GEMINI_PREFERENCE.find((id) => list.relevant.includes(id)) ?? GEMINI_PREFERENCE[0]);
  console.log(`gemini model: ${geminiModel} (list ok: ${list.error === null})`);

  const calls: CallRecord[] = [];
  for (let round = 1; round <= ROUNDS; round += 1) {
    const images = round === ROUNDS && sign ? [...pairs, sign] : pairs;
    const rec = await callGemini(ai, geminiModel, round, images);
    calls.push(rec);
    console.log(`round ${round}: gemini ${rec.outage ? "OUTAGE" : "ok"} ${rec.latencyMs}ms`);
  }

  // Rounds 1 and 2 score the same images, so their gap shows how repeatable a single judge is.
  const [r1, r2] = calls;
  const repeatGap = r1?.parsed && r2?.parsed ? scoreGap(r1.parsed, r2.parsed) : null;
  const validCount = calls.filter((x) => x.schemaValid && !x.outage).length;

  writeEvidence("s-llm", "runs.json", {
    generatedAt: new Date().toISOString(),
    fixtureMode: fixtures.mode,
    models: {
      geminiChosen: geminiModel,
      geminiAnswered: [...new Set(calls.map((x) => x.model))],
    },
    geminiModelsList: { totalModels: list.all, flashOrGemini4Ids: list.relevant, error: list.error },
    decisions: {
      judge: "Gemini only (owner decision 2026-11-08); a timeout, refusal or schema failure is an outage and routes to the customer",
      samplingParametersSent: false,
      timeoutMsPerCall: TIMEOUT_MS,
    },
    thresholds: { repeatTolerance: TOLERANCE, avgBar: AVG_BAR, minBar: MIN_BAR },
    calls,
    repeatGap,
    summary: { geminiSchemaValid: `${validCount}/${ROUNDS}` },
  });

  // ---- RESULT.md ----
  const date = new Date().toISOString().slice(0, 10);
  const placeholder = fixtures.mode === "placeholder";
  const outages = calls.filter((x) => x.outage);
  const neverAnswered = calls.every((x) => x.outage && !x.rawText);
  const last = calls[ROUNDS - 1];
  const signFlag = last?.parsed ? String(last.instructionalTextInMedia) : "no valid round-3 output";
  const bar = calls.filter((x) => x.meetsAutoReleaseBar !== null);
  const barPass = bar.filter((x) => x.meetsAutoReleaseBar).length;
  const latency = range(calls.map((x) => x.latencyMs));

  let status: string;
  if (neverAnswered) {
    status = `BLOCKED (gemini never answered: ${calls[0]?.outageReason ?? "unknown"})`;
  } else if (validCount === ROUNDS) {
    status = "CONFIRMED";
  } else {
    status = "PARTIAL";
  }
  if (placeholder) status += " - schema and timing only";

  const outageLines = outages.length
    ? outages.map((x) => `- round ${x.round}: ${x.outageReason}`).join("\n")
    : "- none";
  const gapLine =
    repeatGap === null
      ? "no valid scores in both rounds 1 and 2"
      : `${repeatGap.toFixed(2)} (${repeatGap <= TOLERANCE ? "within" : "OUTSIDE"} ${TOLERANCE})`;

  const md = `## S-LLM - Gemini structured scoring

### Question
Does Gemini return schema-valid structured scores for the job photos with the shared Zod rubric, how fast, and how repeatable are its scores on the same photos?

### Method
Script \`scripts/spikes/llm/run.ts\` on ${date}, fixture mode \`${fixtures.mode}\`${placeholder ? " (generated placeholder images, so scores say nothing about real work quality)" : ""}. Gemini model chosen \`${geminiModel}\` (answered \`${[...new Set(calls.map((x) => x.model))].join(", ") || "none"}\`; surface \`${[...new Set(calls.map((x) => x.surface))].join(", ")}\`) from the \`models.list\` result (${list.error ? `list failed: ${list.error}` : `${list.all} models, flash/gemini-4 ids: ${list.relevant.join(", ") || "none"}`}). Three rounds, ${TIMEOUT_MS / 1000} s timeout each, ${pairs.length} before/after images per call (plus the sign image in round 3). Rounds 1 and 2 use identical images. Every output was re-validated with the full Zod schema. Gemini is the only judge (owner decision 2026-11-08).

### What happened
- Schema-valid runs: ${validCount}/${ROUNDS}.
- Latency: ${latency}.
- Outages:
${outageLines}
- Score gap between rounds 1 and 2 (same photos): ${gapLine}.
- Auto-release bar (avg >= ${AVG_BAR}, no criterion < ${MIN_BAR}) met by ${barPass}/${bar.length} valid outputs (indicator only, not a calibration).
- Sign image (round ${ROUNDS}) set \`instructional_text_in_media\`: ${signFlag}.
- No sampling parameters were sent.

### Evidence
- \`spike-evidence/s-llm/fixtures.json\` (hashes and sizes only)
- \`spike-evidence/s-llm/runs.json\` (all calls, usage, finish reasons, raw text, scores, model list)

### Design impact
- AI-04 / AI-05: pin the answered model id above in \`GEMINI_MODEL\` and write the response model id into every verdict-log row; ${outages.length ? "the outages above show the outage path (route to the customer) must be exercised." : "no outage was observed, so the outage path rests on documented behaviour only."}
- AI-06: keep \`Rubric.parse\` on every output; Gemini ignores some JSON Schema constraints. The repeat gap above shows how much one judge's score moves on identical photos.
- AI-08: the sign probe result above is the baseline for injection handling; the prompt tells the model to flag instruction-like text, and Phase 5 still needs the code-level guard.
- Phase 5 timeouts: use at least the observed maximum latency (${latency}) plus margin; the spike used ${TIMEOUT_MS / 1000} s.

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
