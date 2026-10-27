import { defineConfig } from "drizzle-kit";
import { loadLocalEnv } from "./scripts/lib/local-env";

// Generation needs no database; migrate reads DATABASE_URL (process env or MAIN_ROOT/.env.local).
if (!process.env.DATABASE_URL) loadLocalEnv();

export default defineConfig({
  dialect: "postgresql",
  schema: [
    "./src/server/db/schema/auth-schema.ts",
    "./src/server/db/schema/app.ts",
  ],
  out: "./drizzle",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ?? "postgres://unused:unused@127.0.0.1:5432/unused",
  },
});
