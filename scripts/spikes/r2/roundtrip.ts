// Live round-trip against the private R2 bucket. Usage: npx tsx scripts/spikes/r2/roundtrip.ts
// Proves: presigned PUT works, a type-swapped PUT is refused, signed GET returns the same bytes,
// the unsigned object URL is refused, an expired signed GET is refused, and delete works.
// Never prints or stores key material or full signed URLs.
import { createHash } from "node:crypto";
import sharp from "sharp";
import { newSpikeKey, r2 } from "../../../src/server/storage/r2";
import { loadLocalEnv } from "../../lib/local-env";
import { writeEvidence } from "../../lib/redact";

interface StepResult {
  step: string;
  status: number;
  ok: boolean;
  ms: number;
}

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function timed(
  step: string,
  run: () => Promise<number>,
  expect: (status: number) => boolean,
  results: StepResult[],
): Promise<number> {
  const start = Date.now();
  let status = 0;
  try {
    status = await run();
  } catch (err) {
    // Network failures are recorded as status 0 with the error class only.
    console.error(`${step}: ${err instanceof Error ? err.name : "error"}`);
  }
  results.push({ step, status, ok: expect(status), ms: Date.now() - start });
  return status;
}

async function main(): Promise<number> {
  loadLocalEnv();
  const bucket = r2();
  const results: StepResult[] = [];
  const extra: Record<string, unknown> = {};

  const jpeg = await sharp({
    create: { width: 64, height: 64, channels: 3, background: { r: 200, g: 40, b: 40 } },
  })
    .jpeg()
    .toBuffer();
  const body = new Uint8Array(jpeg);
  const expectedHash = sha256(body);

  const key = newSpikeKey("roundtrip");
  const wrongTypeKey = newSpikeKey("roundtrip");

  // 1. Presigned PUT with the declared Content-Type.
  const putUrl = await bucket.presignPut({
    key,
    contentType: "image/jpeg",
    size: body.byteLength,
  });
  await timed(
    "putStatus",
    async () =>
      (await fetch(putUrl, { method: "PUT", body, headers: { "Content-Type": "image/jpeg" } }))
        .status,
    (s) => s === 200,
    results,
  );

  // 2. Presigned PUT sent with a different Content-Type must be refused.
  const wrongUrl = await bucket.presignPut({
    key: wrongTypeKey,
    contentType: "image/jpeg",
    size: body.byteLength,
  });
  await timed(
    "wrongTypePutStatus",
    async () =>
      (await fetch(wrongUrl, { method: "PUT", body, headers: { "Content-Type": "image/png" } }))
        .status,
    (s) => s >= 400,
    results,
  );

  // 3. Signed GET returns identical bytes.
  const getUrl = await bucket.presignGet({ key });
  await timed(
    "signedGetStatus",
    async () => {
      const res = await fetch(getUrl);
      if (res.status === 200) {
        extra.sha256Match = sha256(new Uint8Array(await res.arrayBuffer())) === expectedHash;
      }
      return res.status;
    },
    (s) => s === 200,
    results,
  );
  results.push({
    step: "sha256Match",
    status: extra.sha256Match === true ? 1 : 0,
    ok: extra.sha256Match === true,
    ms: 0,
  });

  // 4. Unsigned GET must be refused (record the exact status).
  await timed(
    "unsignedGetStatus",
    async () => (await fetch(bucket.unsignedUrl(key))).status,
    (s) => s >= 400,
    results,
  );

  // 5. Expired signed GET must be refused.
  const shortUrl = await bucket.presignGet({ key, expiresIn: 1 });
  await sleep(3000);
  await timed(
    "expiredGetStatus",
    async () => (await fetch(shortUrl)).status,
    (s) => s >= 400,
    results,
  );

  // 6. Delete both keys; HEAD must then be 404.
  await timed(
    "deletedHeadStatus",
    async () => {
      await bucket.deleteObject(key);
      await bucket.deleteObject(wrongTypeKey);
      try {
        await bucket.headObject(key);
        return 200;
      } catch (err) {
        const meta = (err as { $metadata?: { httpStatusCode?: number } }).$metadata;
        return meta?.httpStatusCode ?? 0;
      }
    },
    (s) => s === 404,
    results,
  );

  const byStep = Object.fromEntries(results.map((r) => [r.step, r.status]));
  const evidence = {
    date: new Date().toISOString(),
    bucket: bucket.bucket,
    region: "auto",
    putStatus: byStep.putStatus,
    wrongTypePutStatus: byStep.wrongTypePutStatus,
    signedGetStatus: byStep.signedGetStatus,
    sha256Match: extra.sha256Match === true,
    unsignedGetStatus: byStep.unsignedGetStatus,
    expiredGetStatus: byStep.expiredGetStatus,
    deletedHeadStatus: byStep.deletedHeadStatus,
    results,
  };
  const path = writeEvidence("r2", "roundtrip.json", evidence);

  const failed = results.filter((r) => !r.ok).map((r) => r.step);
  console.log(`wrote ${path}`);
  if (failed.length > 0) {
    console.error(`failed steps: ${failed.join(", ")}`);
    return 1;
  }
  console.log("r2 roundtrip ok");
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    // requireEnv errors name keys only; other errors print class and message without URLs.
    console.error(err instanceof Error ? `${err.name}: ${err.message}` : "unknown error");
    process.exit(1);
  },
);
