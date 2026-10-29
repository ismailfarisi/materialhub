"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth";

/**
 * Client-side auth guard for protected pages.
 *
 * Waits for the auth store to finish hydrating (via `useMe` in Providers),
 * then redirects unauthenticated users to `/auth/login` with a `returnTo`
 * query param pointing back to the current path. Uses `router.replace` so
 * the protected route doesn't stay in history.
 *
 * Pages that use this hook should render a loading placeholder (or return
 * null) while `isReady` is false to avoid a flash of protected UI before
 * the redirect fires.
 *
 * NOTE: this replaces the old Next.js middleware-based guard, which read
 * `web_access_token` from `request.cookies` — that cookie lives on the API
 * origin and is never sent to the web origin, so the middleware check was a
 * no-op at best and an infinite redirect at worst in the cross-origin setup.
 */
export function useRequireAuth(): { isReady: boolean } {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isAuthLoading = useAuthStore((s) => s.isLoading);

  useEffect(() => {
    if (isAuthLoading) return;
    if (isAuthenticated) return;
    // Preserve the full URL including query string — routes like
    // /book/:slug carry load-bearing state (start/end/tz/staff/...) in the
    // query, so a pathname-only returnTo strands a login-mid-flow customer
    // with no slot selected post-login. Read window.location.search (not
    // next/navigation's useSearchParams) so this shared hook doesn't force
    // every consumer page into a Suspense-boundary requirement — this runs
    // client-side-only inside the existing effect, so it's a no-op string
    // append for the routes that have no query string.
    const search = typeof window !== "undefined" ? window.location.search : "";
    const returnTo = (pathname || `/${locale}`) + search;
    router.replace(`/${locale}/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  }, [isAuthLoading, isAuthenticated, locale, pathname, router]);

  return { isReady: !isAuthLoading && isAuthenticated };
}
