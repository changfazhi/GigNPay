// Worker liveness helpers. No next/* imports: the pg-boss worker and tsx scripts import this too.
import { max } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { workerHeartbeats } from "@/server/db/schema/app";

/** A worker is healthy only when its last heartbeat is younger than this. Heartbeats run every 60 s. */
export const HEARTBEAT_STALE_SECONDS = 150;

export type WorkerStatus = {
  lastSeenAt: Date | null;
  lastSeenSeconds: number | null;
  ok: boolean;
};

/** Whole seconds between `date` and `now` (floor), or null when `date` is null. */
export function secondsSince(date: Date | null, now: Date): number | null {
  if (date === null) return null;
  return Math.floor((now.getTime() - date.getTime()) / 1000);
}

export function workerStatusFrom(
  lastSeenAt: Date | null,
  now: Date,
): WorkerStatus {
  const lastSeenSeconds = secondsSince(lastSeenAt, now);
  return {
    lastSeenAt,
    lastSeenSeconds,
    ok: lastSeenSeconds !== null && lastSeenSeconds < HEARTBEAT_STALE_SECONDS,
  };
}

/** Inserts one worker_heartbeats row. `pgbossJobId` is the pg-boss job id, or "startup". */
export async function recordHeartbeat(
  db: NodePgDatabase,
  pgbossJobId: string,
): Promise<void> {
  await db.insert(workerHeartbeats).values({ pgbossJobId });
}

/** Reads the newest heartbeat and applies the staleness rule. */
export async function getWorkerStatus(
  db: NodePgDatabase,
  now: Date = new Date(),
): Promise<WorkerStatus> {
  const [row] = await db
    .select({ lastSeenAt: max(workerHeartbeats.createdAt) })
    .from(workerHeartbeats);
  return workerStatusFrom(row?.lastSeenAt ?? null, now);
}
