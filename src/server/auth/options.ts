// Auth rules for Pay-When-Done. No next/* imports (the worker and tsx scripts import src/server/**);
// the one exception is better-auth/next-js, loaded only when cfg.nextCookies is true.
import { createHash, timingSafeEqual } from "node:crypto";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";

export const ROLES = ["customer", "worker", "judge"] as const;
export type Role = (typeof ROLES)[number];

/** D-02: header carrying the judge sign-up code. Read per request, never stored. */
export const JUDGE_CODE_HEADER = "x-judge-signup-code";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type AuthConfig = {
  database: BetterAuthOptions["database"];
  secret: string;
  baseURL?: string;
  trustedOrigins: string[];
  demoMode: boolean;
  judgeSignupCode?: string;
  nextCookies: boolean;
};

const digest = (value: string) => createHash("sha256").update(value).digest();

/** Constant-time comparison of two strings via fixed-length SHA-256 digests. */
function codesMatch(supplied: string, expected: string): boolean {
  return timingSafeEqual(digest(supplied), digest(expected));
}

export function createAuth(cfg: AuthConfig) {
  return betterAuth({
    database: cfg.database,
    secret: cfg.secret,
    baseURL: cfg.baseURL,
    trustedOrigins: cfg.trustedOrigins,
    advanced: { database: { generateId: "uuid" } },
    emailAndPassword: { enabled: true },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    user: {
      additionalFields: {
        role: { type: ["customer", "worker", "judge"], required: true, input: true },
        paypalEmail: { type: "string", required: false, input: true },
      },
    },
    // Better Auth enables rate limiting in production only.
    rateLimit: {
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 60, max: 10 },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-up/email") return;
        const { role, paypalEmail } = (ctx.body ?? {}) as {
          role?: unknown;
          paypalEmail?: unknown;
        };

        if (typeof role !== "string" || !(ROLES as readonly string[]).includes(role)) {
          throw new APIError("BAD_REQUEST", { message: "invalid role" });
        }

        if (role === "worker") {
          if (typeof paypalEmail !== "string" || !EMAIL.test(paypalEmail)) {
            throw new APIError("BAD_REQUEST", { message: "worker needs a PayPal email" });
          }
        }

        // D-02: judge sign-up is open only in demo mode, or with the correct code header.
        if (role === "judge" && !cfg.demoMode) {
          const supplied = ctx.headers?.get(JUDGE_CODE_HEADER);
          const expected = cfg.judgeSignupCode;
          if (!expected || !supplied || !codesMatch(supplied, expected)) {
            throw new APIError("FORBIDDEN", { message: "judge sign-up is closed" });
          }
        }
      }),
    },
    databaseHooks: {
      user: {
        update: {
          before: async (data) => {
            if ("role" in data) {
              throw new APIError("FORBIDDEN", { message: "role is immutable" });
            }
            return { data };
          },
        },
      },
    },
    plugins: cfg.nextCookies ? [nextCookies()] : [],
  });
}
