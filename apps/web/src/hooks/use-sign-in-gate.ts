"use client";

import { useAuthStore } from "@/stores/auth";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";

/**
 * For actions only a signed-in shopper can take (wishlist, follow a
 * supplier). `gate(action)` runs the action when signed in; for a guest it
 * sends them to login and back to this page instead of firing a request that
 * can only 401 with nothing shown.
 */
export function useSignInGate() {
	const locale = useLocale();
	const pathname = usePathname();
	const router = useRouter();
	const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

	const gate = useCallback(
		(action: () => void) => {
			if (isAuthenticated) {
				action();
				return;
			}
			const search = typeof window !== "undefined" ? window.location.search : "";
			const returnTo = (pathname || `/${locale}`) + search;
			router.push(`/${locale}/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
		},
		[isAuthenticated, locale, pathname, router],
	);

	return { isAuthenticated, gate };
}
