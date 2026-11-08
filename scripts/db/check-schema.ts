import { withLocalDb } from "../lib/db";

const EXPECTED = [
  "user",
  "session",
  "account",
  "verification",
  "worker_heartbeats",
  "webhook_events",
  "spike_uploads",
  "spike_observations",
];

async function main(): Promise<void> {
  const result = await withLocalDb(async (db) => {
    const t = await db.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' order by 1",
    );
    const tables = t.rows.map((r) => r.table_name);
    let migrations: number | null = null;
    try {
      const m = await db.query<{ n: string }>("select count(*) as n from drizzle.__drizzle_migrations");
      migrations = Number(m.rows[0]?.n ?? 0);
    } catch {
      migrations = 0;
    }
    const p = await db.query("select 1 from information_schema.schemata where schema_name = 'pgboss'");
    return { tables, missing: EXPECTED.filter((e) => !tables.includes(e)), migrations, pgboss: (p.rowCount ?? 0) > 0 };
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.missing.length) process.exit(1);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
