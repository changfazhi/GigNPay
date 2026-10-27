import { expect, it } from "vitest";
import { api, baseUrl, describeSmoke } from "./helpers";

describeSmoke("health and HTTPS", () => {
  it("answers /api/health with db ok, a healthy worker and a commit field", async () => {
    const res = await api("/api/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      db: string;
      worker: { ok: boolean };
      commit?: string | null;
    };
    expect(body.db).toBe("ok");
    expect(body.worker.ok).toBe(true);
    expect("commit" in body).toBe(true);
  });

  it("is served over https", () => {
    expect(baseUrl()?.startsWith("https://")).toBe(true);
  });

  it("redirects the http:// form to https://", async () => {
    const httpUrl = (baseUrl() ?? "").replace(/^https:/, "http:");
    const res = await fetch(`${httpUrl}/api/health`, { redirect: "manual" });
    expect([301, 302, 307, 308]).toContain(res.status);
    expect(res.headers.get("location") ?? "").toMatch(/^https:\/\//);
  });
});
