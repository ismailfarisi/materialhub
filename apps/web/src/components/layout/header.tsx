"use client";

import type { NavTab } from "@/lib/api/navigation";
import { useAuthModalStore } from "@/stores/auth-modal";
import { useAuthStore } from "@/stores/auth";
import { useCartStore } from "@/stores/cart";
import { useCollapseOnScroll } from "@/hooks/use-collapse-on-scroll";
import { useMobileNavStore } from "@/stores/mobile-nav";
import { Gift, Heart, MapPin, Menu, Search, ShoppingBag, Store, User } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
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
			{/* Utility bar — delivery, perks, locale, currency.
			    Scrolls up out of the viewport when `collapsed` shifts the sticky
			    offset by its own height, leaving the main row pinned at the top. */}
			<div className="bg-nl-cacao text-nl-pearl">
				<div className="max-w-[1400px] mx-auto px-4 md:px-12 h-9 flex items-center justify-between text-[10.5px] tracking-[0.2em] uppercase">
					<div className="flex items-center gap-2">
						<MapPin className="h-3.5 w-3.5 text-nl-amber" strokeWidth={1.25} />
						<span className="hidden sm:inline">
							Deliver to{" "}
							<span className="text-nl-linen">United Arab Emirates</span>
						</span>
						<span className="sm:hidden text-nl-linen">UAE</span>
					</div>
					<div className="flex items-center gap-3 md:gap-[18px] opacity-90">
						<span className="hidden md:inline">
							Free shipping over{" "}
							<span className="text-nl-amber">AED 150</span>
						</span>
						<span className="hidden md:block w-px h-3 bg-nl-pearl/20" />
						<LocaleSwitcher />
						<CurrencySelector />
					</div>
				</div>
			</div>

			{/* Main header — logo + search + actions */}
			<div className="bg-nl-linen/95 backdrop-blur-md border-b border-nl-cacao/10">
				<div className="max-w-[1400px] mx-auto px-4 md:px-12 grid grid-cols-[auto_1fr_auto] items-center gap-4 md:gap-9 py-4 md:py-5">
					{/* Logo */}
					<Link
						href={`/${locale}`}
						aria-label="MaterialHub"
						className="shrink-0 inline-flex items-center"
					>
						<Image
							src="/materialhub-logo.png"
							alt="MaterialHub"
							width={216}
							height={120}
							priority
							className="h-12 md:h-16 w-auto"
						/>
					</Link>

					{/* Search — desktop */}
					<div className="hidden md:flex relative justify-self-center w-full max-w-[760px] items-center gap-3 px-5 py-3 bg-white/60 border border-nl-cacao/10">
						<Search
							className="h-4 w-4 text-nl-russet shrink-0"
							strokeWidth={1.25}
						/>
						<div className="flex-1 min-w-0">
							{/* Boundary is required: SearchAutocomplete reads useSearchParams,
							    which would otherwise deopt every page under this layout out of
							    static rendering and fail the build. */}
							<Suspense fallback={<SearchAutocompleteFallback />}>
								<SearchAutocomplete />
							</Suspense>
						</div>
						<span className="text-[9px] tracking-[0.22em] uppercase text-nl-russet/60 shrink-0">
							⌘K
						</span>
					</div>

					{/* Actions */}
					<div className="flex items-center justify-self-end gap-1 md:gap-[22px] text-[10px] tracking-[0.22em] uppercase text-nl-russet shrink-0">
						{/* Mobile hamburger */}
						<button
							type="button"
							onClick={openMobileNav}
							aria-label="Menu"
							className="lg:hidden text-nl-cacao p-3"
						>
							<Menu className="h-5 w-5" strokeWidth={1.25} />
						</button>

						{/* Mobile search toggle */}
						<button
							type="button"
							onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
							className="md:hidden text-nl-cacao p-3"
							aria-label="Search"
						>
							<Search className="h-5 w-5" strokeWidth={1.25} />
						</button>

						{/* Gifts — desktop only */}
						<Link
							href={`/${locale}/gifts`}
							className="hidden lg:inline-flex items-center gap-1.5 hover:text-nl-amber transition-colors"
						>
							<Gift className="h-4 w-4" strokeWidth={1.25} />
							Gifts
						</Link>

						{/* Sell — desktop only */}
						<Link
							href={`/${locale}/sell`}
							className="hidden lg:inline-flex items-center gap-1.5 hover:text-nl-amber transition-colors"
						>
							<Store className="h-4 w-4" strokeWidth={1.25} />
							Sell
						</Link>

						{/* Wishlist */}
						<Link
							href={`/${locale}/account/wishlist`}
							aria-label="Wishlist"
							className="hidden sm:inline-flex p-3 text-nl-cacao hover:text-nl-amber transition-colors"
						>
							<Heart className="h-[19px] w-[19px]" strokeWidth={1.25} />
						</Link>

						{/* Cart */}
						<button
							type="button"
							onClick={toggleSlideOver}
							aria-label={t("cart")}
							className="p-3 text-nl-cacao hover:text-nl-amber transition-colors"
						>
							<span className="relative inline-flex">
								<ShoppingBag className="h-[19px] w-[19px]" strokeWidth={1.25} />
								{itemCount > 0 && (
									<span className="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-nl-amber text-nl-espresso text-[9px] tracking-normal font-medium flex items-center justify-center">
										{itemCount > 99 ? "99+" : itemCount}
									</span>
								)}
							</span>
						</button>

						{/* Account / Login */}
						{isAuthenticated ? (
							<Link
								href={`/${locale}/account`}
								className="inline-flex items-center gap-1.5 px-3 py-2 border border-nl-cacao/15 text-nl-cacao hover:border-nl-amber hover:text-nl-amber transition-colors"
							>
								<User className="h-3.5 w-3.5" strokeWidth={1.25} />
								<span className="hidden lg:inline max-w-[80px] truncate">
									{user?.first_name || t("account")}
								</span>
							</Link>
						) : (
							<button
								type="button"
								onClick={() => openAuthModal("login")}
								className="inline-flex items-center gap-1.5 bg-nl-cacao text-nl-linen px-4 py-2.5 hover:bg-nl-espresso transition-colors cursor-pointer"
							>
								<User className="h-3.5 w-3.5" strokeWidth={1.25} />
								<span className="hidden sm:inline">{t("login")}</span>
							</button>
						)}
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
