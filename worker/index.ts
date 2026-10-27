// Background worker. Run with `npm run worker` (tsx). Never print env values or connection strings.
import { PgBoss } from "pg-boss";
import { requireEnv } from "@/server/env";

const QUEUE = "heartbeat";

/** Error text safe to log: message (or code when the message is empty), never the object. */
function safeMessage(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as { code?: unknown }).code;
    return err.message || (typeof code === "string" ? code : err.name);
  }
  return "unknown error";
}

async function main(): Promise<void> {
  const connectionString = requireEnv("DATABASE_URL");
  // Imported here so a missing DATABASE_URL is reported by main().catch below.
  const { db, pool } = await import("@/server/db/client");
  const { recordHeartbeat } = await import("@/server/heartbeat");

  const boss = new PgBoss({ connectionString, max: 3 });
  boss.on("error", (err) => console.error("pg-boss error:", safeMessage(err)));

  await boss.start();
  await boss.createQueue("heartbeat");
  await boss.schedule(QUEUE, "* * * * *");
  await boss.work(QUEUE, async (jobs) => {
    for (const job of jobs) {
      await recordHeartbeat(db, job.id);
    }
  });

  // One heartbeat right away so /api/health is healthy before the first scheduled run.
  await recordHeartbeat(db, "startup");

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`worker stopping (${signal})`);
    try {
      await boss.stop({ graceful: true });
      await pool.end();
      process.exit(0);
    } catch (err) {
      console.error("worker stop failed:", safeMessage(err));
      process.exit(1);
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  console.log("worker started");
}

main().catch((err) => {
  console.error("worker failed:", safeMessage(err));
  process.exit(1);
});
