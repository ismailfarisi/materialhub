"use client";

import { type Stock, StockChip } from "@/components/swatch";
import { buildBreadcrumbJsonLd } from "@/lib/breadcrumb-jsonld";
import { ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";

interface BreadcrumbItem {
	name: string;
	/** Category slug — links to `/{locale}/c/{slug}`. */
	slug?: string;
	/**
	 * Locale-relative href (e.g. `/brands`) for crumbs that don't live under
	 * `/c/`. Takes precedence over `slug`; the locale prefix is added here.
	 */
	href?: string;
}

/**
 * Sentence-case breadcrumb with chevrons that mirror in RTL. The last item is
 * the current page when it has no link. When `stock` is given, the first category
 * crumb carries its stock chip.
 */
export function Breadcrumb({ items, stock }: { items: BreadcrumbItem[]; stock?: Stock | null }) {
	const locale = useLocale();
	const t = useTranslations("common");

	const itemHref = (item: BreadcrumbItem): string | undefined =>
		item.href ? `/${locale}${item.href}` : item.slug ? `/${locale}/c/${item.slug}` : undefined;

	// Locale-less path for the JSON-LD; the helper adds the origin and locale.
	const itemPath = (item: BreadcrumbItem): string | undefined =>
		item.href ?? (item.slug ? `/c/${item.slug}` : undefined);

	const jsonLd = buildBreadcrumbJsonLd(
		locale,
		items.map((item) => ({ name: item.name, path: itemPath(item) })),
		t("home"),
	);

	const link = "text-nl-russet underline decoration-transparent underline-offset-4 transition-colors hover:text-nl-cacao hover:decoration-nl-cacao/30";

	return (
		<>
			<nav aria-label="Breadcrumb" className="min-w-0 py-3">
				<ol className="m-0 flex min-w-0 list-none items-center gap-1.5 overflow-hidden whitespace-nowrap p-0 text-[13px]">
					<li className="shrink-0">
						<Link href={`/${locale}`} className={link}>
							{t("home")}
						</Link>
					</li>
					{items.map((item, i) => {
						const href = itemHref(item);
						const last = i === items.length - 1;
						return (
							<li
								key={item.href ?? item.slug ?? item.name}
								className={last ? "flex min-w-0 items-center gap-1.5" : "flex shrink-0 items-center gap-1.5"}
							>
								<ChevronRight className="h-3.5 w-3.5 shrink-0 text-nl-russet/60 rtl:rotate-180" strokeWidth={1.75} aria-hidden="true" />
								{i === 0 && stock && <StockChip stock={stock} />}
								{href ? (
									<Link href={href} className={link}>
										{item.name}
									</Link>
								) : (
									<span aria-current={last ? "page" : undefined} className="truncate text-nl-cacao">
										{item.name}
									</span>
								)}
							</li>
						);
					})}
				</ol>
			</nav>
			<script
				type="application/ld+json"
				// biome-ignore lint/security/noDangerouslySetInnerHtml: schema.org JSON-LD payload
				dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
			/>
		</>
	);
}
