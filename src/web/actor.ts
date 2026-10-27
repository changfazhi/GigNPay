// Web-only session helper. Lives in src/web because it imports next/headers (src/server must not).
import { headers } from "next/headers";
import { auth } from "@/server/auth/auth";
import type { Role } from "@/server/auth/options";

export type Actor = { id: string; email: string; role: Role };

/** Resolves the signed-in user from the session cookie, or null. No cookie cache: always hits the DB. */
export async function getActor(): Promise<Actor | null> {
  const session = await auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true },
  });
  if (!session) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    role: session.user.role as Role,
  };
}
