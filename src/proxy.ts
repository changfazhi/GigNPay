import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic redirect only: a missing session cookie sends the visitor to /login.
 * A present cookie proves nothing; every page and route handler still checks the session itself.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const guarded = pathname.startsWith("/dashboard") || pathname.startsWith("/spikes");
  if (guarded && !getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/spikes/:path*"],
};
