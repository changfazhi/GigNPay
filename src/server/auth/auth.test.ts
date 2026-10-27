import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";
import { JUDGE_CODE_HEADER, createAuth } from "./options";

const SECRET = "test-secret-0123456789-0123456789-abcd";
const JUDGE_CODE = "judge-code-for-tests-1234";

function makeAuth(overrides: { demoMode?: boolean; judgeSignupCode?: string } = {}) {
  return createAuth({
    database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    secret: SECRET,
    baseURL: "http://localhost:3000",
    trustedOrigins: ["http://localhost:3000"],
    demoMode: overrides.demoMode ?? false,
    judgeSignupCode: overrides.judgeSignupCode ?? JUDGE_CODE,
    nextCookies: false,
  });
}

let counter = 0;
const uniqueEmail = (prefix: string) => `${prefix}${++counter}@test.example.com`;

type SignUpBody = {
  email: string;
  password: string;
  name: string;
  role?: string;
  paypalEmail?: string;
};

function signUp(
  auth: ReturnType<typeof makeAuth>,
  body: Partial<SignUpBody> & { role?: string },
  headers?: Headers,
) {
  return auth.api.signUpEmail({
    body: {
      email: uniqueEmail("u"),
      password: "password-123",
      name: "Test User",
      ...body,
    } as never,
    headers,
  });
}

async function statusOf(promise: Promise<unknown>): Promise<string | number | undefined> {
  try {
    await promise;
    return undefined;
  } catch (err) {
    const e = err as { status?: string | number; statusCode?: number };
    return e.statusCode ?? e.status;
  }
}

describe("auth core (memory adapter)", () => {
  it("worker sign-up stores role and paypalEmail; sign-in returns role and a cookie", async () => {
    const auth = makeAuth();
    const email = uniqueEmail("worker");
    const created = await signUp(auth, {
      email,
      role: "worker",
      paypalEmail: "w@personal.example.com",
    });
    const user = created.user as Record<string, unknown>;
    expect(user.role).toBe("worker");
    expect(user.paypalEmail).toBe("w@personal.example.com");

    const signedIn = await auth.api.signInEmail({
      body: { email, password: "password-123" },
      returnHeaders: true,
    });
    expect((signedIn.response.user as Record<string, unknown>).role).toBe("worker");
    expect(signedIn.headers.get("set-cookie")).toBeTruthy();
  });

  it("customer sign-up without paypalEmail succeeds", async () => {
    const auth = makeAuth();
    const created = await signUp(auth, { role: "customer" });
    expect((created.user as Record<string, unknown>).role).toBe("customer");
  });

  it.each([["admin"], ["superuser"], [undefined]])(
    "sign-up with role %s is rejected with 400",
    async (role) => {
      const auth = makeAuth();
      const status = await statusOf(signUp(auth, { role, paypalEmail: "a@b.example.com" }));
      expect(status).toBe(400);
    },
  );

  it.each([[undefined], ["not-an-email"]])(
    "worker sign-up with paypalEmail %s is rejected with 400",
    async (paypalEmail) => {
      const auth = makeAuth();
      const status = await statusOf(signUp(auth, { role: "worker", paypalEmail }));
      expect(status).toBe(400);
    },
  );

  it("rejects a 7-character password", async () => {
    const auth = makeAuth();
    const status = await statusOf(signUp(auth, { role: "customer", password: "1234567" }));
    expect(status).toBe(400);
  });

  it("D-02: judge sign-up without the code is 403 when demo mode is off", async () => {
    const auth = makeAuth({ demoMode: false });
    expect(await statusOf(signUp(auth, { role: "judge" }))).toBe(403);
  });

  it("D-02: judge sign-up with a wrong code is 403", async () => {
    const auth = makeAuth({ demoMode: false });
    const headers = new Headers({ [JUDGE_CODE_HEADER]: "wrong-code-wrong-code" });
    expect(await statusOf(signUp(auth, { role: "judge" }, headers))).toBe(403);
  });

  it("D-02: judge sign-up with the matching code succeeds", async () => {
    const auth = makeAuth({ demoMode: false });
    const headers = new Headers({ [JUDGE_CODE_HEADER]: JUDGE_CODE });
    const created = await signUp(auth, { role: "judge" }, headers);
    expect((created.user as Record<string, unknown>).role).toBe("judge");
  });

  it("D-02: judge sign-up is closed when no code is configured, even with a header", async () => {
    const auth = createAuth({
      database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
      secret: SECRET,
      baseURL: "http://localhost:3000",
      trustedOrigins: ["http://localhost:3000"],
      demoMode: false,
      nextCookies: false,
    });
    const headers = new Headers({ [JUDGE_CODE_HEADER]: "" });
    expect(await statusOf(signUp(auth, { role: "judge" }, headers))).toBe(403);
  });

  it("D-02: judge sign-up with demo mode on needs no code", async () => {
    const auth = makeAuth({ demoMode: true });
    const created = await signUp(auth, { role: "judge" });
    expect((created.user as Record<string, unknown>).role).toBe("judge");
  });

  it("admin is rejected even in demo mode", async () => {
    const auth = makeAuth({ demoMode: true });
    expect(await statusOf(signUp(auth, { role: "admin" }))).toBe(400);
  });

  it("updateUser cannot change role (FORBIDDEN) but can change name", async () => {
    const auth = makeAuth();
    const email = uniqueEmail("cust");
    await signUp(auth, { email, role: "customer" });
    const signedIn = await auth.api.signInEmail({
      body: { email, password: "password-123" },
      returnHeaders: true,
    });
    const cookie = signedIn.headers
      .get("set-cookie")!
      .split(/,(?=\s*[^;,]+=)/)
      .map((c) => c.split(";")[0].trim())
      .join("; ");
    const headers = new Headers({ cookie });

    expect(await statusOf(auth.api.updateUser({ body: { role: "judge" } as never, headers }))).toBe(403);
    const ok = await auth.api.updateUser({ body: { name: "New" }, headers });
    expect(ok.status).toBe(true);
  });
});
