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
		return (
			json.data ?? {
				tabs: [],
				version: 0,
				generated_at: new Date().toISOString(),
			}
		);
	} catch {
		return { tabs: [], version: 0, generated_at: new Date().toISOString() };
	}
}
