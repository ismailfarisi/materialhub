"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * The account menu itself is rendered by account/layout.tsx on mobile, and
 * every generic account entry point (header, tab bar, nav drawer) links here.
 * On desktop the sidebar nav is always visible, so bare /account is not a real
 * destination there — redirect it to Orders.
 */
export default function AccountIndexPage() {
  const router = useRouter();
  const locale = useLocale();

  useEffect(() => {
    if (window.matchMedia("(min-width: 768px)").matches) {
      router.replace(`/${locale}/account/orders`);
    }
  }, [router, locale]);

  return null;
}
