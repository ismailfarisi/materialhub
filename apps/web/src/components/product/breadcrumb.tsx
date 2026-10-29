"use client";

import { buildBreadcrumbJsonLd } from "@/lib/breadcrumb-jsonld";
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

const crumb = "text-[10px] uppercase tracking-[0.22em]";

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
	const locale = useLocale();
	const t = useTranslations("common");

	const itemHref = (item: BreadcrumbItem): string | undefined =>
		item.href
			? `/${locale}${item.href}`
			: item.slug
				? `/${locale}/c/${item.slug}`
				: undefined;

	// Locale-less path for the JSON-LD; the helper adds the origin and locale.
	const itemPath = (item: BreadcrumbItem): string | undefined =>
		item.href ?? (item.slug ? `/c/${item.slug}` : undefined);

	const jsonLd = buildBreadcrumbJsonLd(
		locale,
		items.map((item) => ({ name: item.name, path: itemPath(item) })),
		t("home"),
	);

	return (
		<>
			<nav className="flex items-center gap-2.5 py-3 overflow-hidden whitespace-nowrap">
				<Link
					href={`/${locale}`}
					className={`${crumb} text-nl-russet transition-colors hover:text-nl-cacao`}
				>
					{t("home")}
				</Link>
				{items.map((item) => {
					const href = itemHref(item);
					return (
						<span
							key={item.href ?? item.slug ?? item.name}
							className="flex items-center gap-2.5 min-w-0"
						>
							<span className="text-nl-russet/40" aria-hidden="true">
								·
							</span>
							{href ? (
								<Link
									href={href}
									className={`${crumb} text-nl-russet transition-colors hover:text-nl-cacao`}
								>
									{item.name}
								</Link>
							) : (
								<span className={`${crumb} text-nl-cacao truncate`}>{item.name}</span>
							)}
						</span>
					);
				})}
			</nav>
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
			/>
		</>
	);
}
