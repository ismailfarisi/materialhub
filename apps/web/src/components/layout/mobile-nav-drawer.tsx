"use client";

import type { NavTab } from "@/lib/api/navigation";
import { useAuthModalStore } from "@/stores/auth-modal";
import { useAuthStore } from "@/stores/auth";
import { ChevronDown, Clapperboard, Gift, Heart, Package, Store, Tags, User, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useState } from "react";

interface Props {
	open: boolean;
	onClose: () => void;
	tabs: NavTab[];
}

export function MobileNavDrawer({ open, onClose, tabs }: Props) {
	const t = useTranslations("common");
	const tFooter = useTranslations("footer");
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
		{ href: `/${locale}/reels`, label: t("reels"), Icon: Clapperboard },
		{ href: `/${locale}/brands`, label: t("brands"), Icon: Tags },
		{ href: `/${locale}/gifts`, label: t("gifts"), Icon: Gift },
		{ href: `/${locale}/account/wishlist`, label: t("wishlist"), Icon: Heart },
		{ href: `/${locale}/account/orders`, label: t("trackOrder"), Icon: Package },
		{ href: `/${locale}/sell`, label: tFooter("sell"), Icon: Store },
	];

	return (
		<dialog
			open
			aria-modal="true"
			className="fixed inset-0 z-50 m-0 w-full max-w-none h-full bg-nl-linen lg:hidden flex flex-col"
		>
			<div className="flex items-center justify-between px-4 h-14 border-b border-nl-cacao/10">
				<span className="text-[11px] tracking-[0.22em] uppercase text-nl-cacao">
					{t("browse")}
				</span>
				<button
					type="button"
					aria-label="Close"
					onClick={onClose}
					className="text-nl-cacao p-3 -me-3"
				>
					<X className="h-5 w-5" strokeWidth={1.25} />
				</button>
			</div>

			<nav className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
				<ul className="list-none m-0 p-0">
					{tabs.map((tab) => {
						const expanded = openTabId === tab.id;
						return (
							<li key={tab.id} className="border-b border-nl-cacao/5">
								<button
									type="button"
									onClick={() => setOpenTabId(expanded ? null : tab.id)}
									aria-expanded={expanded}
									className="w-full flex items-center justify-between px-4 py-4 text-[13px] tracking-[0.16em] uppercase text-nl-cacao"
								>
									<span>{tab.label}</span>
									<ChevronDown
										className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
										strokeWidth={1.25}
									/>
								</button>
								{expanded && (
									<ul className="list-none m-0 p-0 pb-3">
										{tab.subcategories.map((s) => (
											<li key={s.href}>
												<Link
													href={s.href}
													onClick={onClose}
													className="block px-7 py-3 text-[13px] text-nl-russet"
												>
													{s.label}
												</Link>
											</li>
										))}
										{tab.brand_list.brands.length > 0 && (
											<li className="px-7 pt-3 pb-1 text-[10px] tracking-[0.22em] uppercase text-nl-russet/70">
												{tab.brand_list.title}
											</li>
										)}
										{tab.brand_list.brands.map((b) => (
											<li key={b.id}>
												<Link
													href={b.href}
													onClick={onClose}
													className="block px-7 py-3 text-[13px] text-nl-russet"
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

				{/* Core destinations — always present, even when the CMS nav is empty */}
				<ul className="list-none m-0 p-0 mt-2 border-t border-nl-cacao/10">
					{quickLinks.map(({ href, label, Icon }) => (
						<li key={href} className="border-b border-nl-cacao/5">
							<Link
								href={href}
								onClick={onClose}
								className="flex items-center gap-3 px-4 py-3.5 text-[13px] tracking-[0.16em] uppercase text-nl-cacao"
							>
								<Icon className="h-4 w-4 text-nl-russet" strokeWidth={1.25} />
								{label}
							</Link>
						</li>
					))}
					<li>
						{isAuthenticated ? (
							<Link
								href={`/${locale}/account`}
								onClick={onClose}
								className="flex items-center gap-3 px-4 py-3.5 text-[13px] tracking-[0.16em] uppercase text-nl-cacao"
							>
								<User className="h-4 w-4 text-nl-russet" strokeWidth={1.25} />
								{t("account")}
							</Link>
						) : (
							<button
								type="button"
								onClick={() => {
									onClose();
									openAuthModal("login");
								}}
								className="w-full flex items-center gap-3 px-4 py-3.5 text-[13px] tracking-[0.16em] uppercase text-nl-cacao"
							>
								<User className="h-4 w-4 text-nl-russet" strokeWidth={1.25} />
								{t("login")}
							</button>
						)}
					</li>
				</ul>
			</nav>
		</dialog>
	);
}
