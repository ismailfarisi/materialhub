import {
  AppDataSource,
  Brand,
  BrandStatus,
  Category,
  CategoryTranslation,
  type HeaderNavLocaleField,
  type HeaderNavPromoTile,
  type HeaderNavTab,
  HeaderNavigationConfig,
} from "@materialhub/database";
import { In, IsNull } from "typeorm";

interface ResolvedSubcategory {
  label: string;
  href: string;
  highlight?: boolean;
}

interface ResolvedBrand {
  id: string;
  name: string;
  href: string;
}

interface ResolvedTab {
  id: string;
  kind: "category" | "custom";
  label: string;
  href: string;
  subcategories: ResolvedSubcategory[];
  brand_list: {
    title: string;
    see_all_href: string;
    brands: ResolvedBrand[];
  };
  promo_tiles: Array<{
    image_url: string;
    title: string;
    cta_text: string;
    href: string;
  }>;
}

export interface ResolvedHeaderNavigation {
  tabs: ResolvedTab[];
  version: number;
  generated_at: string;
}

const DEFAULT_LOCALE = "en";
type Locale = "en" | "ar" | "hi" | "ml" | "ur";

const VIEW_ALL_LABEL: Record<Locale, string> = {
  en: "View All",
  ar: "عرض الكل",
  hi: "सभी देखें",
  ml: "എല്ലാം കാണുക",
  ur: "تمام دیکھیں",
};

const NEW_IN_LABEL: Record<Locale, (cat: string) => string> = {
  en: (c) => `New in ${c}`,
  ar: (c) => `جديد في ${c}`,
  hi: (c) => `${c} में नया`,
  ml: (c) => `${c}-ൽ പുതിയത്`,
  ur: (c) => `${c} میں نیا`,
};

export class HeaderNavigationResolverService {
  private categoryCache: {
    at: number;
    data: Map<string, Category & { children: Category[] }>;
  } | null = null;
  private brandCache: { at: number; data: Map<string, Brand> } | null = null;
  private topLevelCache: {
    at: number;
    data: Array<Category & { children: Category[] }>;
  } | null = null;
  /** category_id → translated name, one entry per locale (cache key = locale). */
  private nameCache = new Map<Locale, { at: number; data: Map<string, string> }>();
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000;

  clearCaches(): void {
    this.categoryCache = null;
    this.brandCache = null;
    this.topLevelCache = null;
    this.nameCache.clear();
  }

  /**
   * Translated category names for a locale, from `category_translations`.
   * English is the base copy on `categories` itself, so it needs no lookup;
   * a category without a (non-blank) translation keeps its English name.
   */
  private async loadCategoryNames(locale: Locale): Promise<Map<string, string>> {
    if (locale === DEFAULT_LOCALE) return new Map();
    const cached = this.nameCache.get(locale);
    if (cached && Date.now() - cached.at < HeaderNavigationResolverService.CACHE_TTL_MS) {
      return cached.data;
    }
    const rows = await AppDataSource.getRepository(CategoryTranslation).find({
      where: { locale },
      select: { category_id: true, name: true },
    });
    const data = new Map<string, string>();
    for (const r of rows) {
      if (typeof r.name === "string" && r.name.trim()) data.set(r.category_id, r.name);
    }
    this.nameCache.set(locale, { at: Date.now(), data });
    return data;
  }

  async resolve(locale: string): Promise<ResolvedHeaderNavigation> {
    const localeKey = (
      ["en", "ar", "hi", "ml", "ur"].includes(locale) ? locale : DEFAULT_LOCALE
    ) as Locale;
    const published = await AppDataSource.getRepository(HeaderNavigationConfig).findOne({
      where: { status: "published", deleted_at: IsNull() },
    });

    if (!published) {
      // No CMS config published (e.g. fresh environment): fall back to the
      // live category tree so the storefront never renders an empty menu.
      const names = await this.loadCategoryNames(localeKey);
      const tabs = await this.fallbackTabsFromCategories(localeKey, names);
      return { tabs, version: 0, generated_at: new Date().toISOString() };
    }

    const allCategoryIds = published.config.tabs
      .filter((t): t is typeof t & { category_id: string } => !!t.category_id)
      .map((t) => t.category_id);
    const allBrandIds = published.config.tabs.flatMap((t) => t.brand_list.brand_ids);

    const [categoryMap, brandMap, names] = await Promise.all([
      this.loadCategories(allCategoryIds),
      this.loadBrands(allBrandIds),
      this.loadCategoryNames(localeKey),
    ]);

    const tabs: ResolvedTab[] = [];
    for (const tab of published.config.tabs) {
      if (!tab.enabled) continue;
      const resolved = this.resolveTab(tab, localeKey, categoryMap, brandMap, names);
      if (resolved) tabs.push(resolved);
    }

    return {
      tabs,
      version: published.version,
      generated_at: new Date().toISOString(),
    };
  }

  private resolveTab(
    tab: HeaderNavTab,
    locale: Locale,
    categoryMap: Map<string, Category & { children: Category[] }>,
    brandMap: Map<string, Brand>,
    names: Map<string, string>,
  ): ResolvedTab | null {
    let label = this.locale(tab.label, locale);

    let href: string;
    let subcategories: ResolvedSubcategory[] = [];

    if (tab.kind === "category") {
      const cat = tab.category_id ? categoryMap.get(tab.category_id) : null;
      if (!cat) return null;
      href = `/c/${cat.slug}`;
      // A category tab without its own label for this locale shows the
      // category's translated name before falling back to the English label.
      if (!tab.label[locale]?.trim()) label = names.get(cat.id) ?? label;
      if (tab.show_subcategories) {
        subcategories = [
          { label: VIEW_ALL_LABEL[locale], href, highlight: true },
          {
            label: NEW_IN_LABEL[locale](names.get(cat.id) ?? cat.name),
            href: `/search?category=${cat.slug}&sort=newest`,
          },
          ...cat.children
            .filter((c) => c.is_active)
            .map((c) => ({ label: names.get(c.id) ?? c.name, href: `/c/${c.slug}` })),
        ];
      }
    } else {
      if (!tab.href_override) return null;
      href = tab.href_override;
    }

    const brands: ResolvedBrand[] = [];
    for (const id of tab.brand_list.brand_ids) {
      const b = brandMap.get(id);
      if (!b) continue;
      brands.push({ id: b.id, name: b.name, href: `/vendor/${b.slug}` });
    }

    return {
      id: tab.id,
      kind: tab.kind,
      label,
      href,
      subcategories,
      brand_list: {
        title: this.locale(tab.brand_list.title, locale),
        see_all_href: tab.brand_list.see_all_href,
        brands,
      },
      promo_tiles: tab.promo_tiles.map((p: HeaderNavPromoTile) => ({
        image_url: p.image_url,
        title: this.locale(p.title, locale),
        cta_text: this.locale(p.cta_text, locale),
        href: p.href,
      })),
    };
  }

  private async fallbackTabsFromCategories(
    locale: Locale,
    names: Map<string, string>,
  ): Promise<ResolvedTab[]> {
    const topLevel = await this.loadTopLevelCategories();
    const name = (c: Category) => names.get(c.id) ?? c.name;
    return topLevel.map((cat) => ({
      id: cat.id,
      kind: "category" as const,
      label: name(cat),
      href: `/c/${cat.slug}`,
      subcategories: [
        { label: VIEW_ALL_LABEL[locale], href: `/c/${cat.slug}`, highlight: true },
        {
          label: NEW_IN_LABEL[locale](name(cat)),
          href: `/search?category=${cat.slug}&sort=newest`,
        },
        ...cat.children
          .filter((c) => c.is_active)
          .map((c) => ({ label: name(c), href: `/c/${c.slug}` })),
      ],
      brand_list: { title: "", see_all_href: "/brands", brands: [] },
      promo_tiles: [],
    }));
  }

  private async loadTopLevelCategories(): Promise<Array<Category & { children: Category[] }>> {
    if (
      this.topLevelCache &&
      Date.now() - this.topLevelCache.at < HeaderNavigationResolverService.CACHE_TTL_MS
    ) {
      return this.topLevelCache.data;
    }
    const repo = AppDataSource.getRepository(Category);
    const roots = await repo.find({
      where: { parent_id: IsNull(), is_active: true, deleted_at: IsNull() },
      order: { sort_order: "ASC" },
    });
    const children =
      roots.length === 0
        ? []
        : await repo.find({
            where: {
              parent_id: In(roots.map((c) => c.id)),
              is_active: true,
              deleted_at: IsNull(),
            },
            order: { sort_order: "ASC" },
          });
    const grouped = new Map<string, Category[]>();
    for (const child of children) {
      const parentId = child.parent_id as string;
      const arr = grouped.get(parentId) ?? [];
      arr.push(child);
      grouped.set(parentId, arr);
    }
    const data = roots.map((cat) => ({ ...cat, children: grouped.get(cat.id) ?? [] }));
    this.topLevelCache = { at: Date.now(), data };
    return data;
  }

  private locale(field: HeaderNavLocaleField, locale: Locale): string {
    return field[locale] ?? field.en;
  }

  private async loadCategories(
    ids: string[],
  ): Promise<Map<string, Category & { children: Category[] }>> {
    if (ids.length === 0) return new Map();
    if (
      this.categoryCache &&
      Date.now() - this.categoryCache.at < HeaderNavigationResolverService.CACHE_TTL_MS
    ) {
      return this.categoryCache.data;
    }
    const repo = AppDataSource.getRepository(Category);
    const cats = await repo.find({
      where: { id: In(ids), is_active: true, deleted_at: IsNull() },
    });
    const childrenByParent = await repo.find({
      where: {
        parent_id: In(cats.map((c) => c.id)),
        is_active: true,
        deleted_at: IsNull(),
      },
      order: { sort_order: "ASC" },
    });
    const grouped = new Map<string, Category[]>();
    for (const child of childrenByParent) {
      const parentId = child.parent_id as string;
      const arr = grouped.get(parentId) ?? [];
      arr.push(child);
      grouped.set(parentId, arr);
    }
    const result = new Map<string, Category & { children: Category[] }>();
    for (const cat of cats) {
      result.set(cat.id, { ...cat, children: grouped.get(cat.id) ?? [] });
    }
    this.categoryCache = { at: Date.now(), data: result };
    return result;
  }

  private async loadBrands(ids: string[]): Promise<Map<string, Brand>> {
    const unique = Array.from(new Set(ids));
    if (unique.length === 0) return new Map();
    if (
      this.brandCache &&
      Date.now() - this.brandCache.at < HeaderNavigationResolverService.CACHE_TTL_MS
    ) {
      const cached = this.brandCache.data;
      const allHit = unique.every((id) => cached.has(id));
      if (allHit) return cached;
    }
    const brands = await AppDataSource.getRepository(Brand).find({
      // Header nav is storefront-facing: a brand still awaiting review resolves
      // to nothing here and its nav entry is dropped.
      where: { id: In(unique), status: BrandStatus.approved },
    });
    const map = new Map<string, Brand>();
    for (const b of brands) map.set(b.id, b);
    this.brandCache = { at: Date.now(), data: map };
    return map;
  }
}
