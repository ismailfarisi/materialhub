import { type NextRequest, NextResponse } from "next/server";

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow login page and static assets through
  if (pathname === "/login") {
    return NextResponse.next();
  }

  // Check for access_token cookie — set by API on successful login.
  // In cross-origin dev setups the cookie may only be visible client-side,
  // so the dashboard layout has its own React-level auth guard as fallback.
  const authCookie = request.cookies.get("admin_access_token");
  if (!authCookie) {
    // Also check Authorization header (SSR fetch with forwarded token)
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      // No server-visible auth — let the page render so the client-side
      // guard (useMe + Zustand) can check the real auth state and redirect
      // if needed. This avoids redirect loops in cross-origin cookie setups.
      return NextResponse.next();
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
