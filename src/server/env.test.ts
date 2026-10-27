import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("env module", () => {
  it("getEnv reports invalid keys by name, never by value", async () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "too-short-secret-value");
    const { getEnv } = await import("./env");
    let message = "";
    try {
      getEnv();
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("BETTER_AUTH_SECRET");
    expect(message).not.toContain("too-short-secret-value");
  });

  it("requireEnv throws a key-only message for empty values", async () => {
    vi.stubEnv("R2_BUCKET", "");
    const { requireEnv } = await import("./env");
    expect(() => requireEnv("R2_BUCKET")).toThrow("Missing required env R2_BUCKET");
  });

  it("isDemoMode is true only for the exact string true", async () => {
    const { isDemoMode } = await import("./env");
    vi.stubEnv("DEMO_MODE", "TRUE");
    expect(isDemoMode()).toBe(false);
    vi.stubEnv("DEMO_MODE", "true");
    expect(isDemoMode()).toBe(true);
  });

  it("appOrigin prefers BETTER_AUTH_URL, then RENDER_EXTERNAL_URL, then localhost", async () => {
    const { appOrigin } = await import("./env");
    vi.stubEnv("BETTER_AUTH_URL", "");
    vi.stubEnv("RENDER_EXTERNAL_URL", "");
    expect(appOrigin()).toBe("http://localhost:3000");
    vi.stubEnv("RENDER_EXTERNAL_URL", "https://app.onrender.com/x");
    expect(appOrigin()).toBe("https://app.onrender.com");
    vi.stubEnv("BETTER_AUTH_URL", "https://pwd.example.com/api/auth");
    expect(appOrigin()).toBe("https://pwd.example.com");
  });
});
