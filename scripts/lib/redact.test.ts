import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertNoSecrets, redact, SECRET_ENV_KEYS } from "./redact";

const FAKE = {
  PAYPAL_CLIENT_SECRET: "fake-paypal-secret-AAAA1111",
  R2_SECRET_ACCESS_KEY: "fake-r2-secret-BBBB2222",
  DIAG_TOKEN: "fake-diag-token-0123456789abcdef",
  SHORT: "short",
} as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ["PAYPAL_CLIENT_SECRET", "R2_SECRET_ACCESS_KEY", "DIAG_TOKEN", "ELASTIC_API_KEY"]) {
    saved[key] = process.env[key];
  }
  process.env.PAYPAL_CLIENT_SECRET = FAKE.PAYPAL_CLIENT_SECRET;
  process.env.R2_SECRET_ACCESS_KEY = FAKE.R2_SECRET_ACCESS_KEY;
  process.env.DIAG_TOKEN = FAKE.DIAG_TOKEN;
  process.env.ELASTIC_API_KEY = FAKE.SHORT; // below the 8 char floor: must not be treated as a secret value
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("redact: sensitive keys", () => {
  it("redacts keys matching authorization/secret/token/api key/password/hook url/access key/cookie at any depth", () => {
    const input = {
      Authorization: "Bearer abc",
      client_secret: "x",
      nested: {
        access_token: "y",
        apiKey: "z",
        "x-api-key": "k",
        password: "p",
        zapierHookUrl: "https://hooks.zapier.com/hooks/catch/1/2",
        accessKeyId: "AKIA",
        "Set-Cookie": "session=1",
        list: [{ cookie: "c", safe: "keep-me" }],
      },
      status: 200,
    };
    const out = redact(input) as typeof input;
    expect(out.Authorization).toBe("[REDACTED]");
    expect(out.client_secret).toBe("[REDACTED]");
    expect(out.nested.access_token).toBe("[REDACTED]");
    expect(out.nested.apiKey).toBe("[REDACTED]");
    expect(out.nested["x-api-key"]).toBe("[REDACTED]");
    expect(out.nested.password).toBe("[REDACTED]");
    expect(out.nested.zapierHookUrl).toBe("[REDACTED]");
    expect(out.nested.accessKeyId).toBe("[REDACTED]");
    expect(out.nested["Set-Cookie"]).toBe("[REDACTED]");
    expect(out.nested.list[0].cookie).toBe("[REDACTED]");
    expect(out.nested.list[0].safe).toBe("keep-me");
    expect(out.status).toBe(200);
  });

  it("does not mutate the input and keeps numeric counters such as input_tokens", () => {
    const input = { secret: "s", usage: { input_tokens: 12, output_tokens: 34 } };
    const out = redact(input) as typeof input;
    expect(input.secret).toBe("s");
    expect(out.usage).toEqual({ input_tokens: 12, output_tokens: 34 });
  });
});

describe("redact: secret values inside strings", () => {
  it("replaces env secret values of length >= 8 anywhere in a string", () => {
    const out = redact({
      note: `call failed with ${FAKE.PAYPAL_CLIENT_SECRET} and ${FAKE.R2_SECRET_ACCESS_KEY}`,
      arr: [`x ${FAKE.DIAG_TOKEN} y`],
    }) as { note: string; arr: string[] };
    expect(out.note).toBe("call failed with [REDACTED] and [REDACTED]");
    expect(out.arr[0]).toBe("x [REDACTED] y");
  });

  it("ignores env values shorter than 8 characters", () => {
    const out = redact({ note: `value ${FAKE.SHORT} stays` }) as { note: string };
    expect(out.note).toBe(`value ${FAKE.SHORT} stays`);
  });

  it("lists the expected secret env keys", () => {
    expect(SECRET_ENV_KEYS).toContain("PAYPAL_CLIENT_SECRET");
    expect(SECRET_ENV_KEYS).toContain("DATABASE_URL");
    expect(SECRET_ENV_KEYS).toContain("ZAPIER_HOOK_URL");
  });
});

describe("redact: signed URLs", () => {
  it("keeps only the query parameter names of URLs with X-Amz-Signature or X-Amz-Credential", () => {
    const signed =
      "https://acct.r2.cloudflarestorage.com/bucket/spikes/u/1.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAEXAMPLE%2F20261027%2Fauto%2Fs3%2Faws4_request&X-Amz-Signature=deadbeef1234&X-Amz-Expires=300";
    const out = redact({ url: signed, text: `see ${signed} for details` }) as { url: string; text: string };
    for (const s of [out.url, out.text]) {
      expect(s).not.toContain("deadbeef1234");
      expect(s).not.toContain("AKIAEXAMPLE");
      expect(s).toContain("X-Amz-Signature");
      expect(s).toContain("X-Amz-Expires");
    }
    expect(out.url).toBe(
      "https://acct.r2.cloudflarestorage.com/bucket/spikes/u/1.jpg?X-Amz-Algorithm&X-Amz-Credential&X-Amz-Signature&X-Amz-Expires",
    );
  });

  it("leaves ordinary URLs alone", () => {
    const url = "https://example.com/a?b=1&c=2";
    expect(redact({ url })).toEqual({ url });
  });
});

describe("assertNoSecrets", () => {
  it("throws when a secret value is present, without echoing the value", () => {
    let message = "";
    try {
      assertNoSecrets(`oops ${FAKE.DIAG_TOKEN}`);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).not.toBe("");
    expect(message).toContain("DIAG_TOKEN");
    expect(message).not.toContain(FAKE.DIAG_TOKEN);
  });

  it("passes when no secret value is present", () => {
    expect(() => assertNoSecrets('{"ok":true}')).not.toThrow();
  });
});
