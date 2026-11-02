"use client";

import type { NavTab } from "@/lib/api/navigation";
import { useAuthModalStore } from "@/stores/auth-modal";
import { useAuthStore } from "@/stores/auth";
import { StockChip } from "@/components/swatch";
import { cn } from "@/lib/utils";
import { ChevronDown, Heart, Package, Store, Tags, User, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useState } from "react";
import { stockForTab } from "./mega-menu-panel";

interface Props {
	open: boolean;
	onClose: () => void;
	tabs: NavTab[];
}

export function MobileNavDrawer({ open, onClose, tabs }: Props) {
	const t = useTranslations("common");
	const tFooter = useTranslations("footer");
	const tb = useTranslations("browse");
	const locale = useLocale();
	const { isAuthenticated } = useAuthStore();
	const openAuthModal = useAuthModalStore((s) => s.open);
	const [openTabId, setOpenTabId] = useState<string | null>(null);

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		document.addEventListener("keydown", onKey);
		document.body.style.overflow = "hidden";
		return () => {
			document.removeEventListener("keydown", onKey);
			document.body.style.overflow = "";
		};
	}, [open, onClose]);

	if (!open) return null;

	const quickLinks = [
		{ href: `/${locale}/brands`, label: t("brands"), Icon: Tags },
		{ href: `/${locale}/account/wishlist`, label: t("wishlist"), Icon: Heart },
		{ href: `/${locale}/account/orders`, label: t("trackOrder"), Icon: Package },
		{ href: `/${locale}/sell`, label: tFooter("sell"), Icon: Store },
	];

	const row =
		"flex w-full min-h-14 items-center gap-3 px-4 text-[15px] font-medium text-nl-cacao focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-nl-amber";
	const subLink =
		"flex min-h-12 items-center ps-[2.375rem] pe-4 text-[14.5px] text-nl-cacao focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-nl-amber";

	return (
		<dialog
			open
			aria-modal="true"
			aria-label={t("browse")}
			className="fixed inset-0 z-50 m-0 flex h-full w-full max-w-none flex-col bg-nl-linen p-0 text-nl-cacao lg:hidden"
		>
			<div className="flex h-14 shrink-0 items-center justify-between border-b border-nl-cacao/12 ps-4 pe-2">
				<h2 className="m-0 font-display text-[17px] font-semibold tracking-[-0.01em]">
					{t("browse")}
				</h2>
				<button
					type="button"
					aria-label={tb("close")}
					onClick={onClose}
					className="inline-flex h-11 w-11 items-center justify-center rounded-md hover:bg-nl-cacao/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber"
				>
					<X className="h-5 w-5" strokeWidth={1.75} />
				</button>
			</div>

			<nav className="flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
				{tabs.length > 0 && (
					<ul className="m-0 list-none p-0">
						{tabs.map((tab) => {
							const expanded = openTabId === tab.id;
							const isCategory = tab.kind === "category";
							const hasChildren =
								tab.subcategories.length > 0 || tab.brand_list.brands.length > 0;
							const label = (
								<span className="flex min-w-0 flex-1 items-center gap-3">
									{isCategory ? (
										<StockChip stock={stockForTab(tab)} className="[&>span]:h-3 [&>span]:w-3" />
									) : (
										<span aria-hidden="true" className="h-3 w-3 shrink-0" />
									)}
									<span className="truncate">{tab.label}</span>
								</span>
							);
							return (
								<li key={tab.id} className="border-b border-nl-cacao/10">
									{hasChildren ? (
										<button
											type="button"
											onClick={() => setOpenTabId(expanded ? null : tab.id)}
											aria-expanded={expanded}
											className={row}
										>
											{label}
											<ChevronDown
												aria-hidden="true"
												className={cn(
													"h-4 w-4 shrink-0 text-nl-russet transition-transform duration-200 motion-reduce:transition-none",
													expanded && "rotate-180",
												)}
												strokeWidth={1.75}
											/>
										</button>
									) : (
										<Link href={tab.href} onClick={onClose} className={row}>
											{label}
										</Link>
									)}
									{expanded && (
										<ul className="m-0 list-none bg-nl-pearl/70 p-0 pb-2">
											<li>
												<Link
													href={tab.href}
													onClick={onClose}
													className={cn(subLink, "font-semibold")}
												>
													{tb("allIn", { name: tab.label })}
												</Link>
											</li>
											{tab.subcategories.map((s) => (
												<li key={s.href}>
													<Link href={s.href} onClick={onClose} className={subLink}>
														{s.label}
													</Link>
												</li>
											))}
											{tab.brand_list.brands.length > 0 && (
												<li className="mill-label ps-[2.375rem] pe-4 pt-4 pb-1 text-nl-russet">
													{tab.brand_list.title}
												</li>
											)}
											{tab.brand_list.brands.map((b) => (
												<li key={b.id}>
													<Link
														href={b.href}
														onClick={onClose}
														className={cn(subLink, "text-nl-russet")}
													>
														{b.name}
													</Link>
												</li>
											))}
										</ul>
									)}
								</li>
							);
						})}
					</ul>
				)}

				{/* Core destinations — always present, even when the CMS nav is empty */}
				<ul className="m-0 mt-4 list-none border-t border-nl-cacao/12 p-0">
					{quickLinks.map(({ href, label, Icon }) => (
						<li key={href} className="border-b border-nl-cacao/10">
							<Link href={href} onClick={onClose} className={cn(row, "min-h-12 font-normal")}>
								<Icon className="h-[18px] w-[18px] text-nl-russet" strokeWidth={1.75} aria-hidden="true" />
								{label}
							</Link>
						</li>
					))}
					<li className="border-b border-nl-cacao/10">
						{isAuthenticated ? (
							<Link
								href={`/${locale}/account`}
								onClick={onClose}
								className={cn(row, "min-h-12 font-normal")}
							>
								<User className="h-[18px] w-[18px] text-nl-russet" strokeWidth={1.75} aria-hidden="true" />
								{t("account")}
							</Link>
						) : (
							<button
								type="button"
								onClick={() => {
									onClose();
									openAuthModal("login");
								}}
								className={cn(row, "min-h-12 font-normal")}
							>
								<User className="h-[18px] w-[18px] text-nl-russet" strokeWidth={1.75} aria-hidden="true" />
								{t("login")}
							</button>
						)}
					</li>
				</ul>
			</nav>
		</dialog>
	);
}
