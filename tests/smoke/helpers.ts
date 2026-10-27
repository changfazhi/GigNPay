import { randomBytes } from "node:crypto";
import { describe } from "vitest";
import { loadLocalEnv } from "../../scripts/lib/local-env";

/** Base URL of the deployed app, no trailing slash, or null when none is known. */
export function baseUrl(): string | null {
  loadLocalEnv();
  const raw = process.env.SMOKE_BASE_URL || process.env.APP_BASE_URL;
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

/** `describe` when a base URL exists, else `describe.skip` so `npm run test:smoke` stays green offline. */
export const describeSmoke = baseUrl() ? describe : describe.skip;

/** Minimal cookie jar: keeps name=value pairs from Set-Cookie and emits a Cookie header. */
export class CookieJar {
  private cookies = new Map<string, string>();

  store(res: Response): void {
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(";").map((part) => part.trim());
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      const expired = attrs.some((a) => /^max-age=0$/i.test(a));
      if (expired || value === "") this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  header(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  get size(): number {
    return this.cookies.size;
  }
}

export interface ApiOptions {
  method?: string;
  json?: unknown;
  jar?: CookieJar;
  headers?: Record<string, string>;
  redirect?: RequestRedirect;
}

/** Sends a request to the base URL. Non-GET requests carry `Origin: <baseUrl>`. */
export async function api(path: string, opts: ApiOptions = {}): Promise<Response> {
  const base = baseUrl();
  if (!base) throw new Error("No SMOKE_BASE_URL or APP_BASE_URL is set");
  const method = opts.method ?? (opts.json === undefined ? "GET" : "POST");
  const headers: Record<string, string> = { ...opts.headers };
  if (method !== "GET") headers.Origin = base;
  if (opts.json !== undefined) headers["Content-Type"] = "application/json";
  const cookie = opts.jar?.header();
  if (cookie) headers.Cookie = cookie;

  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: opts.json === undefined ? undefined : JSON.stringify(opts.json),
    redirect: opts.redirect ?? "follow",
  });
  opts.jar?.store(res);
  return res;
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}+${Date.now()}-${randomBytes(4).toString("hex")}@smoke.example.com`;
}

export interface SignUpOptions {
  role: "worker" | "customer";
  paypalEmail?: string;
  judgeCode?: string;
}

export async function signUp(
  jar: CookieJar,
  opts: SignUpOptions,
): Promise<{ res: Response; email: string; password: string }> {
  const email = uniqueEmail(opts.role);
  const password = randomBytes(12).toString("base64url"); // 16 characters
  const headers: Record<string, string> = {};
  if (opts.judgeCode) headers["x-judge-signup-code"] = opts.judgeCode;
  const res = await api("/api/auth/sign-up/email", {
    jar,
    headers,
    json: {
      name: `Smoke ${opts.role}`,
      email,
      password,
      role: opts.role,
      paypalEmail: opts.paypalEmail,
    },
  });
  return { res, email, password };
}

export async function signIn(
  jar: CookieJar,
  creds: { email: string; password: string },
): Promise<Response> {
  return api("/api/auth/sign-in/email", { jar, json: creds });
}
