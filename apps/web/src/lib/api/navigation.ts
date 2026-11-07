import { routing } from "../../../i18n/routing";

const API_URL =
	process.env.API_URL ||
	process.env.NEXT_PUBLIC_API_URL ||
	"http://localhost:3000";

export interface NavSubcategory {
	label: string;
	href: string;
	highlight?: boolean;
}

export interface NavBrand {
	id: string;
	name: string;
	href: string;
}

export interface NavPromoTile {
	image_url: string;
	title: string;
	cta_text: string;
	href: string;
}

export interface NavTab {
	id: string;
	kind: "category" | "custom";
	label: string;
	href: string;
	subcategories: NavSubcategory[];
	brand_list: { title: string; see_all_href: string; brands: NavBrand[] };
	promo_tiles: NavPromoTile[];
}

export interface NavData {
	tabs: NavTab[];
	version: number;
	generated_at: string;
}

const LOCALE_PREFIX = new RegExp(`^/(${routing.locales.join("|")})(?=[/?#]|$)`);

/**
 * Prefix a site-relative nav href with the locale ("/c/papers" → "/ar/c/papers").
 * The CMS stores hrefs without a locale, and a bare "/c/…" link costs a 307
 * through the locale middleware on every click. Absolute URLs, protocol-relative
 * URLs and hrefs that already carry a locale are returned unchanged.
 */
export function localizeHref(href: string, locale: string): string {
	if (!href.startsWith("/") || href.startsWith("//") || LOCALE_PREFIX.test(href)) return href;
	return href === "/" ? `/${locale}` : `/${locale}${href}`;
}

/** Apply `localizeHref` to every link in the header navigation payload. */
export function localizeNavTabs(tabs: NavTab[], locale: string): NavTab[] {
	const loc = (href: string) => localizeHref(href, locale);
	return tabs.map((tab) => ({
		...tab,
		href: loc(tab.href),
		subcategories: (tab.subcategories ?? []).map((s) => ({ ...s, href: loc(s.href) })),
		brand_list: tab.brand_list && {
			...tab.brand_list,
			see_all_href: loc(tab.brand_list.see_all_href),
			brands: (tab.brand_list.brands ?? []).map((b) => ({ ...b, href: loc(b.href) })),
		},
		promo_tiles: (tab.promo_tiles ?? []).map((p) => ({ ...p, href: loc(p.href) })),
	}));
}

// 60s SSR cache (down from 15 min) — short enough that CMS edits propagate in
// roughly a minute even without a webhook, while still off-loading 99% of
// requests to the cache. When the revalidate webhook is wired up we can raise
// this again.
export async function fetchHeaderNavigation(locale: string): Promise<NavData> {
	try {
		const res = await fetch(
			`${API_URL}/navigation/header?locale=${encodeURIComponent(locale)}`,
			{
				next: { revalidate: 60, tags: ["header-navigation"] },
			},
		);
		if (!res.ok)
			return { tabs: [], version: 0, generated_at: new Date().toISOString() };
		const json = (await res.json()) as { data: NavData };
		if (!json.data) {
			return { tabs: [], version: 0, generated_at: new Date().toISOString() };
		}
		return { ...json.data, tabs: localizeNavTabs(json.data.tabs ?? [], locale) };
	} catch {
		return { tabs: [], version: 0, generated_at: new Date().toISOString() };
	}
}
