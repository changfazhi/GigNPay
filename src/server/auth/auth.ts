import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/server/db/client";
import * as authSchema from "@/server/db/schema/auth-schema";
import { appOrigin, getEnv, isDemoMode, requireEnv } from "@/server/env";
import { createAuth } from "./options";

export const auth = createAuth({
  database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
  secret: requireEnv("BETTER_AUTH_SECRET"),
  baseURL: appOrigin(),
  trustedOrigins: [appOrigin()],
  demoMode: isDemoMode(),
  judgeSignupCode: getEnv().JUDGE_SIGNUP_CODE,
  nextCookies: true,
});

export type AuthSession = typeof auth.$Infer.Session;
