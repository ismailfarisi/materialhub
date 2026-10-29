import { type NextRequest, NextResponse } from "next/server";

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/login") {
    return NextResponse.next();
  }

  // Let all pages through — the client-side auth guard in the dashboard
  // layout (useMe + Zustand) handles redirect to /login when not authenticated.
  // This avoids redirect loops in cross-origin cookie setups where the API
  // cookie is not visible to the Next.js server.
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
