import { describe, expect, it } from "vitest";
import {
  HEARTBEAT_STALE_SECONDS,
  secondsSince,
  workerStatusFrom,
} from "@/server/heartbeat";

const now = new Date("2026-10-27T12:00:00.000Z");
const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000);

describe("secondsSince", () => {
  it("returns null when there is no date", () => {
    expect(secondsSince(null, now)).toBeNull();
  });

  it("returns whole seconds, floored", () => {
    expect(secondsSince(new Date(now.getTime() - 10_999), now)).toBe(10);
    expect(secondsSince(ago(600), now)).toBe(600);
  });
});

describe("workerStatusFrom", () => {
  it("uses a 150 second staleness limit", () => {
    expect(HEARTBEAT_STALE_SECONDS).toBe(150);
  });

  it("is not ok when the worker has never been seen", () => {
    expect(workerStatusFrom(null, now)).toEqual({
      lastSeenAt: null,
      lastSeenSeconds: null,
      ok: false,
    });
  });

  it("is ok at 10 seconds", () => {
    const status = workerStatusFrom(ago(10), now);
    expect(status.lastSeenSeconds).toBe(10);
    expect(status.ok).toBe(true);
  });

  it("is ok at 149 seconds", () => {
    expect(workerStatusFrom(ago(149), now).ok).toBe(true);
  });

  it("is not ok at exactly 150 seconds", () => {
    expect(workerStatusFrom(ago(150), now).ok).toBe(false);
  });

  it("is not ok at 600 seconds", () => {
    const status = workerStatusFrom(ago(600), now);
    expect(status.lastSeenSeconds).toBe(600);
    expect(status.ok).toBe(false);
  });
});
