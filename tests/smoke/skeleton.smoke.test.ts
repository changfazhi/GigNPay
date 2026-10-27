import { expect, it } from "vitest";
import { api, CookieJar, describeSmoke, signIn, signUp, uniqueEmail } from "./helpers";

interface Me {
  id: string;
  email: string;
  name: string;
  role: string;
  paypalEmail: string | null;
}

// Walking skeleton happy path. RED until plan 01-10 deploys the app to Render.
// Plan 01-10 reads these four case titles verbatim for its live-DB check: do not rename them.
describeSmoke("walking skeleton: worker sign-up to dashboard", () => {
  const jar = new CookieJar();
  const paypalEmail = uniqueEmail("paypal");
  let email = "";
  let password = "";
  let userId = "";

  it("signs up a worker and reads /api/me twice with the same cookie", async () => {
    const signedUp = await signUp(jar, { role: "worker", paypalEmail });
    expect(signedUp.res.status).toBe(200);
    email = signedUp.email;
    password = signedUp.password;
    expect(jar.size).toBeGreaterThan(0);

    const first = await api("/api/me", { jar });
    expect(first.status).toBe(200);
    const me = (await first.json()) as Me;
    expect(me.role).toBe("worker");
    expect(me.email).toBe(email);
    expect(me.paypalEmail).toBe(paypalEmail);
    userId = me.id;
    expect(userId).toBeTruthy();

    const second = await api("/api/me", { jar });
    expect(second.status).toBe(200);
    expect(((await second.json()) as Me).id).toBe(userId);
  });

  const fresh = new CookieJar();

  it("signs in again from a fresh cookie jar", async () => {
    const res = await signIn(fresh, { email, password });
    expect(res.status).toBe(200);
    expect(fresh.size).toBeGreaterThan(0);

    const meRes = await api("/api/me", { jar: fresh });
    expect(meRes.status).toBe(200);
    expect(((await meRes.json()) as Me).id).toBe(userId);
  });

  it("renders /dashboard with the worker card read from the user row", async () => {
    const res = await api("/dashboard", { jar: fresh });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(email);
    expect(html).toContain(paypalEmail);
  });

  it("reports /api/health green with a fresh worker heartbeat", async () => {
    const res = await api("/api/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      db: string;
      worker: { lastSeenSeconds: number | null; ok: boolean };
    };
    expect(body.db).toBe("ok");
    expect(body.worker.lastSeenSeconds).not.toBeNull();
    expect(body.worker.lastSeenSeconds as number).toBeLessThan(150);
  });
});
