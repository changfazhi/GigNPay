// Cloudflare R2 (S3-compatible) presign and object helpers. No next/* imports: scripts and the worker use this too.
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireEnv } from "../env";

export const PUT_EXPIRY_SECONDS = 600;
export const GET_EXPIRY_SECONDS = 300;
export const MEDIA_MIME_ALLOWLIST = [
  "image/jpeg",
  "image/heic",
  "image/heif",
  "image/png",
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export interface PresignPutInput {
  key: string;
  contentType: string;
  size: number;
  expiresIn?: number;
}

export interface PresignGetInput {
  key: string;
  expiresIn?: number;
}

async function streamToBuffer(body: unknown): Promise<Buffer> {
  const bytes = await (
    body as { transformToByteArray: () => Promise<Uint8Array> }
  ).transformToByteArray();
  return Buffer.from(bytes);
}

export function createR2(cfg: R2Config) {
  const endpoint = `https://${cfg.accountId}.r2.cloudflarestorage.com`;
  const client = new S3Client({
    region: "auto",
    endpoint,
    // Path-style URLs: <account>.r2.cloudflarestorage.com/<bucket>/<key>. The SDK default is virtual-hosted (<bucket>.<account>...).
    forcePathStyle: true,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    // Without these the SDK adds x-amz-checksum-crc32 / x-amz-checksum-mode to presigned URLs and browser uploads break.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  const { bucket } = cfg;

  return {
    bucket,

    /** Presigned PUT that pins host, content-type and content-length. Validates MIME and size first. */
    async presignPut({
      key,
      contentType,
      size,
      expiresIn = PUT_EXPIRY_SECONDS,
    }: PresignPutInput): Promise<string> {
      if (!(MEDIA_MIME_ALLOWLIST as readonly string[]).includes(contentType)) {
        throw new Error("Content type is not allowed for upload");
      }
      if (!Number.isInteger(size) || size <= 0 || size > MAX_UPLOAD_BYTES) {
        throw new Error(`Upload size must be between 1 and ${MAX_UPLOAD_BYTES} bytes`);
      }
      return getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          ContentType: contentType,
          ContentLength: size,
        }),
        { expiresIn, signableHeaders: new Set(["content-type", "content-length"]) },
      );
    },

    /** Short-lived signed GET. */
    presignGet({ key, expiresIn = GET_EXPIRY_SECONDS }: PresignGetInput): Promise<string> {
      return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
        expiresIn,
      });
    },

    async headObject(key: string) {
      return client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    },

    /** Reads an object into memory, refusing anything over `maxBytes` (checked with HEAD first). */
    async getObjectBuffer(key: string, maxBytes: number): Promise<Buffer> {
      const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      if ((head.ContentLength ?? 0) > maxBytes) {
        throw new Error(`Object is larger than ${maxBytes} bytes`);
      }
      const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return streamToBuffer(res.Body);
    },

    async getObjectStream(key: string) {
      const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return res.Body;
    },

    async deleteObject(key: string): Promise<void> {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },

    /** The plain object URL with no signature. The bucket is private, so this must be refused. */
    unsignedUrl(key: string): string {
      return `${endpoint}/${bucket}/${key}`;
    },
  };
}

export type R2 = ReturnType<typeof createR2>;

let cached: R2 | undefined;

/** Memoized client from env. Throws naming the missing key (never values). */
export function r2(): R2 {
  cached ??= createR2({
    accountId: requireEnv("R2_ACCOUNT_ID"),
    accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    bucket: requireEnv("R2_BUCKET"),
  });
  return cached;
}

/** Object keys are always server-generated; a client never supplies one. */
export function newSpikeKey(userId: string): string {
  return `spikes/${userId}/${crypto.randomUUID()}`;
}
