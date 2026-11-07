"use client";

import { useCollapseOnScroll } from "@/hooks/use-collapse-on-scroll";
import { useAuthModalStore } from "@/stores/auth-modal";
import { useAuthStore } from "@/stores/auth";
import { useCartStore } from "@/stores/cart";
import { useMobileNavStore } from "@/stores/mobile-nav";
import { House, LayoutGrid, ShoppingBag, User } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const HIDDEN_ROUTES = /\/(checkout|auth)(\/|$)/;

export function MobileTabBar() {
	const t = useTranslations("common");
	const tFooter = useTranslations("footer");
	const locale = useLocale();
	const pathname = usePathname() ?? "";
	const router = useRouter();
	const { isAuthenticated } = useAuthStore();
	const { itemCount, toggleSlideOver } = useCartStore();
	const openDrawer = useMobileNavStore((s) => s.openDrawer);
	const openAuthModal = useAuthModalStore((s) => s.open);
	// Must run before the early return below — hooks cannot be conditional.
	const collapsed = useCollapseOnScroll();

	if (HIDDEN_ROUTES.test(pathname)) return null;

	const isHome = pathname === `/${locale}` || pathname === "/";
	// Active: ink label plus a 2px ink rule on the top edge — the same
	// underline idea as the desktop category tabs, flipped to the bar's edge.
	const itemClass = (active: boolean) =>
		`relative flex flex-col items-center justify-center gap-1 h-full text-[11px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-nl-amber ${
			active
				? "text-nl-cacao before:absolute before:inset-x-5 before:top-0 before:h-0.5 before:bg-nl-cacao"
				: "text-nl-russet hover:text-nl-cacao"
		}`;

	return (
		<>
			{/* Spacer so the fixed bar doesn't cover the end of the page/footer */}
			<div className="h-[calc(3.5rem+env(safe-area-inset-bottom))] lg:hidden" aria-hidden />
			<nav
				aria-label={t("mobileNavigation")}
				className={`lg:hidden fixed bottom-0 inset-x-0 z-40 bg-nl-linen border-t border-nl-cacao/12 pb-[env(safe-area-inset-bottom)] will-change-transform transition-transform duration-300 ease-out motion-reduce:transition-none ${
					collapsed ? "translate-y-full" : "translate-y-0"
				}`}
			>
				<div className="grid grid-cols-4 h-14">
					<Link href={`/${locale}`} className={itemClass(isHome)}>
						<House className="h-5 w-5" strokeWidth={1.75} />
						{t("home")}
					</Link>
					<button
						type="button"
						onClick={openDrawer}
						className={itemClass(/\/(c|brands?|search)(\/|$)/.test(pathname))}
					>
						<LayoutGrid className="h-5 w-5" strokeWidth={1.75} />
						{tFooter("categories")}
					</button>
					<button
						type="button"
						onClick={toggleSlideOver}
						className={itemClass(false)}
					>
						<span className="relative inline-flex">
							<ShoppingBag className="h-5 w-5" strokeWidth={1.75} />
							{itemCount > 0 && (
								<span className="absolute -top-1.5 -end-2.5 min-w-[18px] h-[18px] px-1 rounded-sm bg-nl-amber text-white font-mono text-[10.5px] font-medium tabular-nums flex items-center justify-center ring-2 ring-nl-linen">
									{itemCount > 99 ? "99+" : itemCount}
								</span>
							)}
						</span>
						{t("cart")}
					</button>
					{isAuthenticated ? (
						<Link
							href={`/${locale}/account`}
							className={itemClass(pathname.includes("/account"))}
						>
							<User className="h-5 w-5" strokeWidth={1.75} />
							{t("account")}
						</Link>
					) : (
						<button
							type="button"
							onClick={() => openAuthModal("login")}
							className={itemClass(false)}
						>
							<User className="h-5 w-5" strokeWidth={1.75} />
							{t("login")}
						</button>
					)}
				</div>
			</nav>
		</>
	);
}
