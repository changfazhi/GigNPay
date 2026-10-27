import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/server/auth/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** The caller's own account fields. Takes no id parameter, so it can never return another user. */
export async function GET() {
  const session = await auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true },
  });
  if (!session) {
    return NextResponse.json(
      { error: "unauthenticated" },
      { status: 401, headers: NO_STORE },
    );
  }
  const { id, email, name, role, paypalEmail } = session.user;
  return NextResponse.json(
    { id, email, name, role, paypalEmail: paypalEmail ?? null },
    { status: 200, headers: NO_STORE },
  );
}
