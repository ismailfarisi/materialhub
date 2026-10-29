"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useMe } from "@/lib/queries/auth";
import { ensureGuestSessionToken } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { ConsentProvider } from "@/lib/consent/consent-state";
import { TagLoader } from "@/lib/channels/tag-loader";
import { AuthModal } from "@/components/auth/auth-modal";
import { WebMcpRegistrar } from "@/components/webmcp/webmcp-registrar";

function AuthHydrator({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Skip auth hydration on auth pages to prevent 401 loop
  const isAuthPage = pathname?.includes("/auth/") || pathname === "/login";
  useMe(!isAuthPage);
  return <>{children}</>;
}

/**
 * Ensures a guest session exists as soon as the app mounts, so guests
 * can use auth-optional endpoints (cart, wishlist, etc.) and so a
 * pre-login cart can later be merged on login.
 *
 * Safe to call redundantly — it's a no-op when a token is already stored.
 */
function GuestSessionInit() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (isAuthenticated) return;
    ensureGuestSessionToken();
  }, [isAuthenticated]);

  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
          },
          mutations: {
            retry: false,
          },
        },
      })
  );

  return (
    // ConsentProvider sits OUTSIDE QueryClientProvider so consent state
    // (cookie-backed) survives any future QueryClient reset/remount.
    <ConsentProvider>
      <QueryClientProvider client={queryClient}>
        <GuestSessionInit />
        <TagLoader
          googleGtagId={process.env.NEXT_PUBLIC_GOOGLE_GTAG_ID}
          googleConversionId={process.env.NEXT_PUBLIC_GOOGLE_CONVERSION_ID}
          metaPixelId={process.env.NEXT_PUBLIC_META_PIXEL_ID}
          tiktokPixelCode={process.env.NEXT_PUBLIC_TIKTOK_PIXEL_CODE}
        />
        <AuthHydrator>{children}</AuthHydrator>
        <WebMcpRegistrar />
        <AuthModal />
      </QueryClientProvider>
    </ConsentProvider>
  );
}
