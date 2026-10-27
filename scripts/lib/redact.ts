import { writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { evidenceDir } from "./local-env";

export const SECRET_ENV_KEYS = [
  "PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "ELASTIC_API_KEY",
  "ZAPIER_HOOK_URL",
  "DIAG_TOKEN",
  "DEMO_SEED_PASSWORD",
  "JUDGE_SIGNUP_CODE",
  "BETTER_AUTH_SECRET",
  "DATABASE_URL",
] as const;

const REDACTED = "[REDACTED]";
const MIN_SECRET_LENGTH = 8;
const SENSITIVE_KEY =
  /authorization|secret|token|api[-_ ]?key|password|hook[-_ ]?url|access[-_ ]?key|cookie/i;
const SIGNED_URL_MARKER = /X-Amz-(Signature|Credential)/i;
const URL_IN_TEXT = /https?:\/\/[^\s"'<>\\]+/g;

/** Secret env values (length >= 8) currently set, longest first so overlaps redact fully. */
function secretEntries(): { key: string; value: string }[] {
  const out: { key: string; value: string }[] = [];
  for (const key of SECRET_ENV_KEYS) {
    const value = process.env[key];
    if (value && value.length >= MIN_SECRET_LENGTH) out.push({ key, value });
  }
  return out.sort((a, b) => b.value.length - a.value.length);
}

function stripSignedUrls(text: string): string {
  return text.replace(URL_IN_TEXT, (url) => {
    if (!SIGNED_URL_MARKER.test(url)) return url;
    const q = url.indexOf("?");
    if (q === -1) return url;
    const names = url
      .slice(q + 1)
      .split("&")
      .map((pair) => pair.split("=")[0])
      .filter(Boolean);
    return `${url.slice(0, q)}?${names.join("&")}`;
  });
}

function redactString(text: string): string {
  let out = stripSignedUrls(text);
  for (const { value } of secretEntries()) {
    out = out.split(value).join(REDACTED);
  }
  return out;
}

/**
 * Deep-clones `value`, replacing the content of sensitive keys, env secret values inside strings,
 * and signed-URL query strings. Numeric and boolean values under sensitive keys (for example
 * `input_tokens`) are kept: they are counters, not credentials.
 */
export function redact(value: unknown): unknown {
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      const keepPrimitive = typeof v === "number" || typeof v === "boolean" || v === null;
      out[key] = SENSITIVE_KEY.test(key) && !keepPrimitive ? REDACTED : redact(v);
    }
    return out;
  }
  return value;
}

/** Throws when `text` contains the value of any secret env key. The message names keys only. */
export function assertNoSecrets(text: string): void {
  const hits = secretEntries()
    .filter(({ value }) => text.includes(value))
    .map(({ key }) => key);
  if (hits.length > 0) {
    throw new Error(`Secret value found in text (env keys: ${[...new Set(hits)].join(", ")})`);
  }
}

/** Redacts, serializes, re-checks and writes evidence into evidenceDir(id). Returns the path. */
export function writeEvidence(id: string, fileName: string, data: unknown): string {
  if (basename(fileName) !== fileName) {
    throw new Error("Evidence file name must not contain path separators");
  }
  const text = JSON.stringify(redact(data), null, 2);
  assertNoSecrets(text);
  const path = join(evidenceDir(id), fileName);
  writeFileSync(path, `${text}\n`);
  return path;
}
