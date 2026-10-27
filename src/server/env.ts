// Single env module for Phase 1. No next/* imports: the worker and tsx scripts import this too.
import { z } from "zod";

// Empty strings (as in a blank .env.example line) count as "not set".
const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);
const opt = <T extends z.ZodType>(schema: T) =>
  z.preprocess(emptyToUndefined, schema.optional());

const url = () => opt(z.url());
const email = () => opt(z.email());
const text = () => opt(z.string());

export const EnvSchema = z.object({
  DATABASE_URL: url(),
  BETTER_AUTH_SECRET: opt(z.string().min(32)),
  BETTER_AUTH_URL: url(),
  DEMO_MODE: text(),
  JUDGE_SIGNUP_CODE: opt(z.string().min(16)),
  DEMO_SEED_PASSWORD: opt(z.string().min(12)),
  SEED_WORKER_PAYPAL_EMAIL: email(),
  SPIKE_WORKER2_PAYPAL_EMAIL: email(),
  SANDBOX_BUYER_EMAIL: email(),
  PAYPAL_CLIENT_ID: text(),
  PAYPAL_CLIENT_SECRET: text(),
  PAYPAL_API_BASE: z.preprocess(
    emptyToUndefined,
    z.url().default("https://api-m.sandbox.paypal.com"),
  ),
  PAYPAL_WEBHOOK_ID: text(),
  R2_ACCOUNT_ID: text(),
  R2_ACCESS_KEY_ID: text(),
  R2_SECRET_ACCESS_KEY: text(),
  R2_BUCKET: text(),
  DIAG_TOKEN: opt(z.string().min(24)),
  APP_BASE_URL: url(),
  ANTHROPIC_API_KEY: text(),
  CLAUDE_JUDGE_MODEL: text(),
  GEMINI_API_KEY: text(),
  GEMINI_MODEL: text(),
  ELASTIC_URL: url(),
  ELASTIC_API_KEY: text(),
  ZAPIER_HOOK_URL: url(),
  RENDER_EXTERNAL_URL: url(),
  RENDER_GIT_COMMIT: text(),
  NODE_ENV: text(),
});

export type Env = z.infer<typeof EnvSchema>;
export type EnvKey = keyof typeof EnvSchema.shape;

let cached: Env | undefined;

/** Memoized parse of process.env. On failure, throws naming the invalid keys only (never values). */
export function getEnv(): Env {
  if (cached) return cached;
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const keys = [
      ...new Set(
        result.error.issues.map((issue) => String(issue.path[0] ?? "(unknown)")),
      ),
    ];
    throw new Error(`Invalid environment variables: ${keys.join(", ")}`);
  }
  cached = result.data;
  return cached;
}

/** Returns the non-empty value of an env key or throws. The message names the key only. */
export function requireEnv(key: EnvKey): string {
  const value = process.env[key];
  if (value === undefined || value === "") {
    throw new Error(`Missing required env ${key}`);
  }
  return value;
}

/** Demo mode is on only when DEMO_MODE is exactly "true". */
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}

/** Public origin of the app: BETTER_AUTH_URL, else RENDER_EXTERNAL_URL, else localhost. */
export function appOrigin(): string {
  for (const candidate of [
    process.env.BETTER_AUTH_URL,
    process.env.RENDER_EXTERNAL_URL,
  ]) {
    if (!candidate) continue;
    try {
      return new URL(candidate).origin;
    } catch {
      // fall through to the next source
    }
  }
  return "http://localhost:3000";
}
