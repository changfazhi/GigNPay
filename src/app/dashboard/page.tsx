import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/server/db/client";
import { user } from "@/server/db/schema/auth-schema";
import { getWorkerStatus } from "@/server/heartbeat";
import { getActor } from "@/web/actor";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");

  // Own row only: the id comes from the session, never from the request.
  const [row] = await db
    .select({
      name: user.name,
      email: user.email,
      role: user.role,
      paypalEmail: user.paypalEmail,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(eq(user.id, actor.id));
  if (!row) notFound();

  const worker = await getWorkerStatus(db);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="break-words text-2xl font-semibold">Signed in as {row.email}</h1>

      {row.role === "customer" && (
        <Card>
          <CardHeader>
            <CardTitle>Customer</CardTitle>
          </CardHeader>
          <CardContent>Customer. You will post aircon jobs here.</CardContent>
        </Card>
      )}
      {row.role === "worker" && (
        <Card>
          <CardHeader>
            <CardTitle>Worker</CardTitle>
          </CardHeader>
          <CardContent className="break-words">
            Worker. Payouts go to {row.paypalEmail}.
          </CardContent>
        </Card>
      )}
      {row.role === "judge" && (
        <Card>
          <CardHeader>
            <CardTitle>Judge</CardTitle>
          </CardHeader>
          <CardContent>Judge. Disputes will appear here.</CardContent>
        </Card>
      )}

      <section id="worker-status" className="text-sm">
        <p
          className={
            worker.ok
              ? "text-green-700 dark:text-green-400"
              : "text-amber-700 dark:text-amber-400"
          }
        >
          {worker.lastSeenSeconds === null
            ? "Background worker not seen yet"
            : `Background worker last seen ${worker.lastSeenSeconds} s ago`}
        </p>
      </section>
    </div>
  );
}
