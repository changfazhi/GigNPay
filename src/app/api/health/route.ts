import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { getWorkerStatus } from "@/server/heartbeat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(): Promise<Response> {
  try {
    await db.execute(sql`select 1`);
    const worker = await getWorkerStatus(db);
    return Response.json(
      {
        status: "ok",
        db: "ok",
        worker: { lastSeenSeconds: worker.lastSeenSeconds, ok: worker.ok },
        commit: process.env.RENDER_GIT_COMMIT ?? null,
        time: new Date().toISOString(),
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error(
      "health check failed:",
      err instanceof Error ? err.message : "unknown error",
    );
    return Response.json(
      { status: "error", db: "error" },
      { status: 503, headers: NO_STORE },
    );
  }
}
