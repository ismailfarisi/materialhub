import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { routing } from "../i18n/routing";

const intlProxy = createMiddleware(routing);

// NOTE: Auth guarding is done client-side via the `useRequireAuth` hook
// (see `src/hooks/use-require-auth.ts`). A middleware cookie check isn't
// usable here because the access-token cookie is set by the API domain
// (e.g. api.stage.materialhubuae.com) and is never sent to the web origin, so
// `request.cookies.get("web_access_token")` would always be undefined and
// redirect every authenticated user back to login.

export default function proxy(request: NextRequest) {
  return intlProxy(request);
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
