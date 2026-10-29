"use client";

import { useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth";
import { MAISON_SERIF } from "@/components/checkout/maison-primitives";

/**
 * Tier guard for the creator dashboard. The parent account layout already
 * enforces authentication; this layer additionally requires a graduated
 * creator tier (creator or influencer). Regular users landing on the
 * dashboard root are routed to the apply page (not a dead redirect back to
 * account home), and the apply subpath itself bypasses this gate entirely —
 * it manages its own state (form / status / already-creator) for ALL tiers.
 */
export default function CreatorAccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);

  const isCreator =
    user?.creator_tier === "creator" || user?.creator_tier === "influencer";
  const isApplyRoute = !!pathname && pathname.includes("/account/creator/apply");

  useEffect(() => {
    if (isLoading || isApplyRoute) return;
    if (!isCreator) router.replace(`/${locale}/account/creator/apply`);
  }, [isLoading, isApplyRoute, isCreator, locale, router]);

  // Apply route renders for everyone (form for regular, status otherwise).
  if (isApplyRoute) return <>{children}</>;

  if (isLoading || !isCreator) {
    return (
      <div
        className="min-h-[40vh] flex items-center justify-center"
        style={{
          fontFamily: MAISON_SERIF,
          fontStyle: "italic",
          fontSize: 16,
          color: "hsl(var(--nl-russet))",
        }}
      >
        {tCommon("loading")}
      </div>
    );
  }

  return <>{children}</>;
}
