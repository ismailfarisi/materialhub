export interface LocaleField {
	en: string;
	ar?: string;
	hi?: string;
	ml?: string;
	ur?: string;
}

export interface HeaderNavBrandList {
	title: LocaleField;
	see_all_href: string;
	brand_ids: string[];
}

export interface HeaderNavPromoTile {
	id: string;
	image_url: string;
	title: LocaleField;
	cta_text: LocaleField;
	href: string;
}

export interface HeaderNavTab {
	id: string;
	kind: "category" | "custom";
	category_id: string | null;
	href_override: string | null;
	label: LocaleField;
	show_subcategories: boolean;
	enabled: boolean;
	position: number;
	brand_list: HeaderNavBrandList;
	promo_tiles: HeaderNavPromoTile[];
}

export interface HeaderNavConfig {
	tabs: HeaderNavTab[];
}

export interface HeaderNavRecord {
	id: string;
	version: number;
	status: "draft" | "published";
	config: HeaderNavConfig;
}
