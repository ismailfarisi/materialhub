"use client";

import type { NavTab } from "@/lib/api/navigation";
import { useAuthModalStore } from "@/stores/auth-modal";
import { useAuthStore } from "@/stores/auth";
import { useCartStore } from "@/stores/cart";
import { useCollapseOnScroll } from "@/hooks/use-collapse-on-scroll";
import { useMobileNavStore } from "@/stores/mobile-nav";
import { Heart, MapPin, Menu, Search, ShoppingBag, Store, User } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { Logo } from "./logo";
import { Suspense, useState } from "react";
import { CurrencySelector } from "./currency-selector";
import { LocaleSwitcher } from "./locale-switcher";
import { MobileNavDrawer } from "./mobile-nav-drawer";
import { MobileSearchOverlay } from "./mobile-search-overlay";
import { NavBar } from "./nav-bar";
import {
	SearchAutocomplete,
	SearchAutocompleteFallback,
} from "./search-autocomplete";

interface HeaderProps {
	tabs: NavTab[];
}

export function Header({ tabs }: HeaderProps) {
	const t = useTranslations("common");
	const locale = useLocale();
	const { isAuthenticated, user } = useAuthStore();
	const { itemCount, toggleSlideOver } = useCartStore();
	const openAuthModal = useAuthModalStore((s) => s.open);
	const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
	const mobileNavOpen = useMobileNavStore((s) => s.drawerOpen);
	const openMobileNav = useMobileNavStore((s) => s.openDrawer);
	const closeMobileNav = useMobileNavStore((s) => s.closeDrawer);
	const collapsed = useCollapseOnScroll();

	return (
		<header
			className={`sticky z-40 transition-[top] duration-300 ease-out motion-reduce:transition-none ${
				collapsed ? "-top-9" : "top-0"
			}`}
		>
			{/* Utility bar — delivery promise, trade line, locale, currency.
			    Scrolls up out of the viewport when `collapsed` shifts the sticky
			    offset by its own height, leaving the main row pinned at the top. */}
			<div className="bg-nl-espresso text-nl-pearl/80">
				<div className="max-w-[1400px] mx-auto px-4 md:px-8 h-9 flex items-center justify-between gap-4 text-[12.5px]">
					<div className="flex items-center gap-2 min-w-0">
						<MapPin className="h-3.5 w-3.5 text-nl-amber shrink-0" strokeWidth={1.75} />
						<span className="truncate">
							<span className="hidden sm:inline">Delivering across the </span>
							<span className="text-nl-pearl font-medium">UAE</span>
							<span className="hidden md:inline">
								{" "}· free shipping over{" "}
								<span className="text-nl-pearl font-medium">AED 150</span>
							</span>
						</span>
					</div>
					<div className="flex items-center gap-3 md:gap-4 shrink-0">
						<Link
							href={`/${locale}/contact`}
							className="hidden lg:inline hover:text-nl-pearl transition-colors"
						>
							Bulk &amp; trade orders
						</Link>
						<span className="hidden lg:block w-px h-3.5 bg-nl-pearl/20" />
						<LocaleSwitcher />
						<CurrencySelector />
					</div>
				</div>
			</div>

			{/* Main header — logo + search + actions */}
			<div className="bg-nl-pearl/90 backdrop-blur-xl backdrop-saturate-150 border-b border-nl-cacao/[0.08]">
				<div className="max-w-[1400px] mx-auto px-4 md:px-8 grid grid-cols-[auto_1fr_auto] items-center gap-3 md:gap-8 h-16 md:h-[76px]">
					{/* Logo */}
					<Link
						href={`/${locale}`}
						aria-label="MaterialHub"
						className="shrink-0 inline-flex items-center rounded-md"
					>
						<Logo className="text-nl-cacao" />
					</Link>

					{/* Search — desktop */}
					<div className="hidden md:flex relative justify-self-center w-full max-w-[720px] items-center gap-3 h-12 ps-4 pe-1.5 rounded-full bg-nl-linen border border-transparent transition-[border-color,background-color,box-shadow] hover:border-nl-cacao/10 focus-within:bg-white focus-within:border-nl-cacao/15 focus-within:shadow-card">
						<Search
							className="h-[18px] w-[18px] text-nl-russet shrink-0"
							strokeWidth={1.75}
						/>
						<div className="flex-1 min-w-0 text-[15px]">
							{/* Boundary is required: SearchAutocomplete reads useSearchParams,
							    which would otherwise deopt every page under this layout out of
							    static rendering and fail the build. */}
							<Suspense fallback={<SearchAutocompleteFallback />}>
								<SearchAutocomplete />
							</Suspense>
						</div>
						<kbd className="hidden lg:inline-flex items-center h-7 px-2 rounded-md border border-nl-cacao/10 bg-white font-mono text-[11px] text-nl-russet shrink-0">
							⌘K
						</kbd>
					</div>

					{/* Actions */}
					<div className="flex items-center justify-self-end gap-0.5 md:gap-1.5 text-sm font-medium text-nl-cacao shrink-0">
						{/* Mobile search toggle */}
						<button
							type="button"
							onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
							className="md:hidden h-10 w-10 inline-flex items-center justify-center rounded-full hover:bg-nl-linen transition-colors"
							aria-label="Search"
						>
							<Search className="h-5 w-5" strokeWidth={1.75} />
						</button>

						{/* Sell — desktop only */}
						<Link
							href={`/${locale}/sell`}
							className="hidden lg:inline-flex items-center gap-2 h-10 px-3.5 rounded-full hover:bg-nl-linen transition-colors"
						>
							<Store className="h-[18px] w-[18px]" strokeWidth={1.75} />
							Sell
						</Link>

						{/* Wishlist */}
						<Link
							href={`/${locale}/account/wishlist`}
							aria-label="Wishlist"
							className="hidden sm:inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-nl-linen transition-colors"
						>
							<Heart className="h-5 w-5" strokeWidth={1.75} />
						</Link>

						{/* Cart */}
						<button
							type="button"
							onClick={toggleSlideOver}
							aria-label={t("cart")}
							className="relative h-10 w-10 inline-flex items-center justify-center rounded-full hover:bg-nl-linen transition-colors"
						>
							<ShoppingBag className="h-5 w-5" strokeWidth={1.75} />
							{itemCount > 0 && (
								<span className="absolute top-0.5 end-0 min-w-[18px] h-[18px] px-1 rounded-full bg-nl-amber text-white text-[10.5px] font-semibold tabular-nums flex items-center justify-center ring-2 ring-nl-pearl">
									{itemCount > 99 ? "99+" : itemCount}
								</span>
							)}
						</button>

						{/* Account / Login */}
						{isAuthenticated ? (
							<Link
								href={`/${locale}/account`}
								className="inline-flex items-center gap-2 h-10 ps-1 pe-1 lg:pe-3.5 rounded-full border border-nl-cacao/10 hover:border-nl-cacao/25 transition-colors ms-1"
							>
								<span className="h-8 w-8 rounded-full bg-nl-cacao text-nl-pearl text-xs font-semibold inline-flex items-center justify-center">
									{user?.first_name?.[0]?.toUpperCase() || (
										<User className="h-4 w-4" strokeWidth={1.75} />
									)}
								</span>
								<span className="hidden lg:inline max-w-[96px] truncate">
									{user?.first_name || t("account")}
								</span>
							</Link>
						) : (
							<button
								type="button"
								onClick={() => openAuthModal("login")}
								className="inline-flex items-center gap-2 h-10 px-3 sm:px-4 ms-1 rounded-full bg-nl-cacao text-nl-pearl hover:bg-nl-cacao/85 transition-colors cursor-pointer"
							>
								<User className="h-4 w-4" strokeWidth={1.75} />
								<span className="hidden sm:inline">{t("login")}</span>
							</button>
						)}

						{/* Mobile menu — trailing, where the thumb is */}
						<button
							type="button"
							onClick={openMobileNav}
							aria-label="Menu"
							className="lg:hidden h-10 w-10 inline-flex items-center justify-center rounded-full hover:bg-nl-linen transition-colors"
						>
							<Menu className="h-5 w-5" strokeWidth={1.75} />
						</button>
					</div>
				</div>

				<NavBar tabs={tabs} />
			</div>

			<MobileSearchOverlay
				open={mobileSearchOpen}
				onClose={() => setMobileSearchOpen(false)}
				tabs={tabs}
			/>
			<MobileNavDrawer open={mobileNavOpen} onClose={closeMobileNav} tabs={tabs} />
		</header>
	);
}
