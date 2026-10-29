"use client";

import { useCollapseOnScroll } from "@/hooks/use-collapse-on-scroll";
import { useAuthModalStore } from "@/stores/auth-modal";
import { useAuthStore } from "@/stores/auth";
import { useCartStore } from "@/stores/cart";
import { useMobileNavStore } from "@/stores/mobile-nav";
import { Clapperboard, House, LayoutGrid, ShoppingBag, User } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const HIDDEN_ROUTES = /\/(reels|checkout|auth)(\/|$)/;

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
	const itemClass = (active: boolean) =>
		`flex flex-col items-center justify-center gap-1 h-full text-[9px] tracking-[0.14em] uppercase transition-colors ${
			active ? "text-nl-cacao" : "text-nl-russet/80"
		}`;

	return (
		<>
			{/* Spacer so the fixed bar doesn't cover the end of the page/footer */}
			<div className="h-[calc(3.5rem+env(safe-area-inset-bottom))] lg:hidden" aria-hidden />
			<nav
				aria-label="Mobile navigation"
				className={`lg:hidden fixed bottom-0 inset-x-0 z-40 bg-nl-linen/95 backdrop-blur-md border-t border-nl-cacao/10 pb-[env(safe-area-inset-bottom)] will-change-transform transition-transform duration-300 ease-out motion-reduce:transition-none ${
					collapsed ? "translate-y-full" : "translate-y-0"
				}`}
			>
				<div className="grid grid-cols-5 h-14">
					<Link href={`/${locale}`} className={itemClass(isHome)}>
						<House className="h-5 w-5" strokeWidth={1.25} />
						{t("home")}
					</Link>
					<button type="button" onClick={openDrawer} className={itemClass(false)}>
						<LayoutGrid className="h-5 w-5" strokeWidth={1.25} />
						{tFooter("categories")}
					</button>
					<Link
						href={`/${locale}/reels`}
						className={itemClass(pathname.includes("/reels"))}
					>
						<Clapperboard className="h-5 w-5" strokeWidth={1.25} />
						{t("reels")}
					</Link>
					<button
						type="button"
						onClick={toggleSlideOver}
						className={itemClass(false)}
					>
						<span className="relative inline-flex">
							<ShoppingBag className="h-5 w-5" strokeWidth={1.25} />
							{itemCount > 0 && (
								<span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-nl-amber text-nl-espresso text-[9px] tracking-normal font-medium flex items-center justify-center">
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
							<User className="h-5 w-5" strokeWidth={1.25} />
							{t("account")}
						</Link>
					) : (
						<button
							type="button"
							onClick={() => openAuthModal("login")}
							className={itemClass(false)}
						>
							<User className="h-5 w-5" strokeWidth={1.25} />
							{t("login")}
						</button>
					)}
				</div>
			</nav>
		</>
	);
}
