import { describe, expect, it } from "vitest";
import {
  GET_EXPIRY_SECONDS,
  MAX_UPLOAD_BYTES,
  MEDIA_MIME_ALLOWLIST,
  PUT_EXPIRY_SECONDS,
  createR2,
  newSpikeKey,
} from "./r2";

const ACCOUNT = "0123456789abcdef0123456789abcdef";
const fake = () =>
  createR2({
    accountId: ACCOUNT,
    accessKeyId: "AKIDEXAMPLE",
    secretAccessKey: "secretexample",
    bucket: "pwd-evidence",
  });

describe("r2 constants", () => {
  it("pins expiries, allowlist and size cap", () => {
    expect(PUT_EXPIRY_SECONDS).toBe(600);
    expect(GET_EXPIRY_SECONDS).toBe(300);
    expect(MAX_UPLOAD_BYTES).toBe(100 * 1024 * 1024);
    expect([...MEDIA_MIME_ALLOWLIST]).toEqual([
      "image/jpeg",
      "image/heic",
      "image/heif",
      "image/png",
      "video/mp4",
      "video/quicktime",
      "video/webm",
    ]);
  });
});

describe("presignPut", () => {
  it("expires in 600 s, signs host, content-length and content-type, and carries no checksum params", async () => {
    const url = new URL(
      await fake().presignPut({ key: "spikes/u1/abc", contentType: "image/jpeg", size: 1234 }),
    );
    expect(url.host).toBe(`${ACCOUNT}.r2.cloudflarestorage.com`);
    expect(url.pathname.startsWith("/pwd-evidence/")).toBe(true);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("600");
    const signed = (url.searchParams.get("X-Amz-SignedHeaders") ?? "").split(";");
    expect(signed).toEqual(expect.arrayContaining(["content-length", "content-type", "host"]));
    const lower = url.toString().toLowerCase();
    expect(lower).not.toContain("x-amz-checksum");
    expect(lower).not.toContain("x-amz-sdk-checksum-algorithm");
  });

  it("rejects a content type outside the allowlist", async () => {
    await expect(
      fake().presignPut({ key: "spikes/u1/abc", contentType: "text/html", size: 10 }),
    ).rejects.toThrow(/content type/i);
  });

  it("rejects a size of 0 and a size above the cap", async () => {
    await expect(
      fake().presignPut({ key: "spikes/u1/abc", contentType: "image/jpeg", size: 0 }),
    ).rejects.toThrow(/size/i);
    await expect(
      fake().presignPut({
        key: "spikes/u1/abc",
        contentType: "image/jpeg",
        size: MAX_UPLOAD_BYTES + 1,
      }),
    ).rejects.toThrow(/size/i);
  });

  it("accepts a size exactly at the cap", async () => {
    await expect(
      fake().presignPut({
        key: "spikes/u1/abc",
        contentType: "video/mp4",
        size: MAX_UPLOAD_BYTES,
      }),
    ).resolves.toContain("X-Amz-Signature");
  });
});

describe("presignGet", () => {
  it("expires in 300 s and has no checksum-mode parameter", async () => {
    const url = new URL(await fake().presignGet({ key: "spikes/u1/abc" }));
    expect(url.host).toBe(`${ACCOUNT}.r2.cloudflarestorage.com`);
    expect(url.pathname).toBe("/pwd-evidence/spikes/u1/abc");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.toString().toLowerCase()).not.toContain("x-amz-checksum-mode");
  });

  it("honours an explicit expiresIn", async () => {
    const url = new URL(await fake().presignGet({ key: "k", expiresIn: 1 }));
    expect(url.searchParams.get("X-Amz-Expires")).toBe("1");
  });
});

describe("unsignedUrl", () => {
  it("has the same host and path and no query string", () => {
    const url = new URL(fake().unsignedUrl("spikes/u1/abc"));
    expect(url.host).toBe(`${ACCOUNT}.r2.cloudflarestorage.com`);
    expect(url.pathname).toBe("/pwd-evidence/spikes/u1/abc");
    expect(url.search).toBe("");
  });
});

describe("newSpikeKey", () => {
  it("returns spikes/<userId>/<uuid v4> and differs per call", () => {
    const a = newSpikeKey("user-1");
    const b = newSpikeKey("user-1");
    expect(a).toMatch(
      /^spikes\/user-1\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(a).not.toBe(b);
  });
});
