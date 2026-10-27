import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { requireEnv } from "@/server/env";

// The Pool does not connect at import; it connects on first query.
export const pool = new Pool({
  connectionString: requireEnv("DATABASE_URL"),
  max: 5,
});

export const db = drizzle(pool);
