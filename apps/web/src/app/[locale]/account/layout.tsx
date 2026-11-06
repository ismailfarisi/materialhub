"use client";

import { Skeleton } from "@/components/account/account-ui";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import {
	Building2,
	Heart,
	LayoutGrid,
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
import { useEffect, useRef } from "react";

interface NavItem {
	key: string;
	icon: LucideIcon;
	href: string;
	/** Only the exact path is active (the overview). */
	exact?: boolean;
}

// Order history first: trade buyers come back to re-order the same SKUs.
const navItems: NavItem[] = [
	{ key: "overview", icon: LayoutGrid, href: "/account", exact: true },
	{ key: "orders", icon: Package, href: "/account/orders" },
	{ key: "returns", icon: PackageX, href: "/account/returns" },
	{ key: "wishlist", icon: Heart, href: "/account/wishlist" },
	{ key: "savedSearches", icon: Search, href: "/account/saved-searches" },
	{ key: "business", icon: Building2, href: "/account/business" },
	{ key: "addresses", icon: MapPin, href: "/account/addresses" },
	{ key: "wallet", icon: Wallet, href: "/account/wallet" },
	{ key: "support", icon: LifeBuoy, href: "/account/support" },
	{ key: "settings", icon: Settings, href: "/account/settings" },
];

export default function AccountLayout({ children }: { children: React.ReactNode }) {
	const t = useTranslations("account");
	// The Business entry's label lives in the `business` namespace (workstream 3).
	const tBusiness = useTranslations("business");
	const label = (key: string) => (key === "business" ? tBusiness("nav") : t(key));
	const locale = useLocale();
	const pathname = usePathname();
	const { user } = useAuthStore();
	const { isReady } = useRequireAuth();
	const tabsRef = useRef<HTMLDivElement>(null);

	const isActive = (item: NavItem) => {
		const full = `/${locale}${item.href}`;
		return item.exact ? pathname === full : pathname.startsWith(full);
	};

	// Keep the active tab in view on the mobile scroller.
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-run on navigation
	useEffect(() => {
		const el = tabsRef.current?.querySelector<HTMLElement>("[aria-current='page']");
		el?.scrollIntoView({ block: "nearest", inline: "center" });
	}, [pathname, isReady]);

	const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ");
	const initial = (user?.first_name?.charAt(0) ?? user?.email?.charAt(0) ?? "M").toUpperCase();

	return (
		<div className="min-h-[70vh] bg-nl-linen">
			<div className="mx-auto max-w-[1400px] px-4 pb-16 pt-5 md:px-8 lg:grid lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-10 lg:pt-10 xl:gap-14">
				{/* Desktop side nav */}
				<aside className="hidden lg:block">
					<div className="sticky top-24 grid gap-5">
						{isReady ? (
							<div className="flex items-center gap-3">
								<span
									aria-hidden="true"
									className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-nl-cacao font-display text-[17px] font-semibold text-white"
								>
									{initial}
								</span>
								<div className="min-w-0">
									<p className="m-0 truncate font-display text-[15.5px] font-semibold leading-tight text-nl-cacao">
										{name || t("yourAccount")}
									</p>
									{user?.email && <p className="m-0 truncate text-[13px] text-nl-russet">{user.email}</p>}
								</div>
							</div>
						) : (
							<div className="flex items-center gap-3">
								<Skeleton className="h-11 w-11 rounded-md" />
								<div className="grid flex-1 gap-2">
									<Skeleton className="h-4 w-28" />
									<Skeleton className="h-3 w-36" />
								</div>
							</div>
						)}
						<nav aria-label={t("navLabel")}>
							<ul className="m-0 grid list-none gap-0.5 p-0">
								{navItems.map((item) => {
									const active = isActive(item);
									const Icon = item.icon;
									return (
										<li key={item.key}>
											<Link
												href={`/${locale}${item.href}`}
												aria-current={active ? "page" : undefined}
												className={cn(
													"flex h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors",
													active
														? "bg-nl-pearl font-medium text-nl-cacao shadow-card"
														: "text-nl-russet hover:bg-nl-cacao/[0.05] hover:text-nl-cacao",
												)}
											>
												<Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
												<span className="truncate">{label(item.key)}</span>
											</Link>
										</li>
									);
								})}
							</ul>
						</nav>
					</div>
				</aside>

				<div className="min-w-0">
					{/* Mobile / tablet: horizontal tabs */}
					<nav aria-label={t("navLabel")} className="-mx-4 mb-6 border-b border-nl-cacao/12 md:-mx-8 lg:hidden">
						<div ref={tabsRef} className="scrollbar-hide flex gap-1 overflow-x-auto px-4 md:px-8">
							{navItems.map((item) => {
								const active = isActive(item);
								return (
									<Link
										key={item.key}
										href={`/${locale}${item.href}`}
										aria-current={active ? "page" : undefined}
										className={cn(
											"relative flex h-11 shrink-0 items-center whitespace-nowrap px-3 text-sm transition-colors",
											"after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-[1px]",
											active
												? "font-medium text-nl-cacao after:bg-nl-amber"
												: "text-nl-russet after:bg-transparent hover:text-nl-cacao",
										)}
									>
										{label(item.key)}
									</Link>
								);
							})}
						</div>
					</nav>

					{isReady ? children : <ShellSkeleton />}
				</div>
			</div>
		</div>
	);
}

function ShellSkeleton() {
	return (
		<div className="grid gap-6" aria-hidden="true">
			<Skeleton className="h-8 w-48" />
			<div className="grid gap-3">
				<Skeleton className="h-28 w-full rounded-md" />
				<Skeleton className="h-28 w-full rounded-md" />
			</div>
		</div>
	);
}
