"use client";

import {
  Eyebrow,
  MAISON_SANS,
  MAISON_SERIF,
  SerifTitle,
} from "@/components/checkout/maison-primitives";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useAuthStore } from "@/stores/auth";
import {
  ArrowLeft,
  ChevronRight,
  Heart,
  LifeBuoy,
  type LucideIcon,
  MapPin,
  Package,
  PackageX,
  Search,
  Settings,
  Wallet,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  key: string;
  icon: LucideIcon;
  href: string;
  /** Message key to use for the label, if different from `key`. */
  labelKey?: string;
}

const navItems: NavItem[] = [
  { key: "orders", icon: Package, href: "/account/orders" },
  { key: "returns", icon: PackageX, href: "/account/returns" },
  { key: "wishlist", icon: Heart, href: "/account/wishlist" },
  { key: "savedSearches", icon: Search, href: "/account/saved-searches" },
  { key: "addresses", icon: MapPin, href: "/account/addresses" },
  { key: "wallet", icon: Wallet, href: "/account/wallet" },
  { key: "support", icon: LifeBuoy, href: "/account/support" },
  { key: "settings", icon: Settings, href: "/account/settings" },
];

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations("account");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const pathname = usePathname();
  const { user } = useAuthStore();
  const { isReady } = useRequireAuth();

  const visibleNavItems = navItems;

  // Exact match: only the menu landing page, not any subpage under it.
  const isIndex = pathname === `/${locale}/account`;
  const activeItem = visibleNavItems.find(({ href }) => pathname.startsWith(`/${locale}${href}`));

  if (!isReady) {
    return (
      <div
        className="min-h-[60vh] flex items-center justify-center bg-background"
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

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-10">
        {/* Profile header — mobile: menu landing only, desktop: always */}
        <div className={`${isIndex ? "flex" : "hidden md:flex"} items-center gap-4 mb-6 md:mb-8`}>
          <div
            className="h-14 w-14 rounded-full overflow-hidden shrink-0 flex items-center justify-center"
            style={{
              border: "1px solid rgba(184,115,51,0.5)",
              background: "rgba(184,115,51,0.08)",
            }}
          >
            <span
              style={{
                fontFamily: MAISON_SERIF,
                fontSize: 22,
                color: "hsl(var(--nl-amber))",
              }}
            >
              {(user?.first_name?.charAt(0) ?? user?.email?.charAt(0) ?? "U").toUpperCase()}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <Eyebrow>Account</Eyebrow>
            <SerifTitle size={24} className="mt-1.5 truncate">
              {user?.first_name} {user?.last_name}
            </SerifTitle>
            <p
              className="truncate"
              style={{
                fontFamily: MAISON_SANS,
                fontSize: 12,
                color: "hsl(var(--nl-russet))",
              }}
            >
              {user?.email}
            </p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-5 md:gap-10">
          <nav
            className={`${isIndex ? "flex" : "hidden"} flex-col md:flex md:flex-col gap-0 md:gap-0.5 md:w-52 shrink-0`}
            aria-label="Account navigation"
          >
            {visibleNavItems.map(({ key, labelKey, icon: Icon, href }) => {
              const fullHref = `/${locale}${href}`;
              const isActive = pathname.startsWith(fullHref);
              return (
                <Link
                  key={key}
                  href={fullHref}
                  className={`flex items-center justify-between md:justify-start gap-3 py-3.5 md:py-2.5 px-0 md:px-3 border-b border-nl-cacao/10 md:border-b-0 md:border-l uppercase transition-colors ${
                    isActive
                      ? "text-nl-amber md:border-nl-amber"
                      : "text-nl-cacao md:text-nl-russet md:border-transparent hover:text-nl-cacao"
                  }`}
                  style={{
                    fontFamily: MAISON_SANS,
                    fontSize: 10.5,
                    letterSpacing: "0.18em",
                  }}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <Icon className="h-4 w-4 shrink-0" strokeWidth={1.25} />
                    <span className="leading-tight line-clamp-1">{t(labelKey ?? key)}</span>
                  </span>
                  <ChevronRight
                    className="h-4 w-4 shrink-0 opacity-40 md:hidden"
                    strokeWidth={1.25}
                  />
                </Link>
              );
            })}
          </nav>
          <div className={`flex-1 min-w-0 ${isIndex ? "hidden md:block" : ""}`}>
            {!isIndex && (
              <Link
                href={`/${locale}/account`}
                className="md:hidden flex items-center gap-2 mb-4 text-nl-cacao"
                style={{
                  fontFamily: MAISON_SANS,
                  fontSize: 11,
                  letterSpacing: "0.1em",
                }}
              >
                <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
                <span className="uppercase">{tCommon("back")}</span>
                {activeItem && (
                  <span className="opacity-50 normal-case">
                    · {t(activeItem.labelKey ?? activeItem.key)}
                  </span>
                )}
              </Link>
            )}
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
