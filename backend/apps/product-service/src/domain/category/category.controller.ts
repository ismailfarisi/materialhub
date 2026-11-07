import { revalidateStorefrontTags } from "@materialhub/utils";
import {
  type CategoryCacheService,
  TREE_CACHE_LOCALES,
  type TreeCacheLocale,
} from "./category-cache.service.ts";
import { type CategoryService, categoryLocale } from "./category.service.ts";

export class CategoryController {
  constructor(
    private readonly categoryService: CategoryService,
    private readonly cacheService: CategoryCacheService,
    private readonly revalidate: (tags: string[]) => Promise<unknown> = revalidateStorefrontTags,
  ) {}

  /**
   * Best-effort storefront revalidation after a catalogue edit: the category
   * page (`category:<slug>`), the tree (`categories`, read by PDP breadcrumbs
   * and menus) and the header menu, which falls back to the category tree.
   * Without it a disabled category kept rendering for up to the 1h tree TTL.
   * Fire and forget; it never fails the admin action.
   */
  private revalidateStorefront(slug?: string | null) {
    const tags = ["categories", "header-navigation"];
    if (slug) tags.unshift(`category:${slug}`);
    this.revalidate(tags).catch(() => undefined);
  }

  async create(data: any) {
    const result = await this.categoryService.create(data);
    await this.cacheService.invalidate();
    this.revalidateStorefront((result as { slug?: string } | null)?.slug);
    return result;
  }

  async update(id: string, data: any) {
    const result = await this.categoryService.update(id, data);
    await this.cacheService.invalidate();
    this.revalidateStorefront(result?.slug);
    return result;
  }

  async remove(id: string) {
    const removed = await this.categoryService.remove(id);
    await this.cacheService.invalidate();
    this.revalidateStorefront(removed?.slug);
  }

  async listForAdmin(page?: number, limit?: number, search?: string) {
    return this.categoryService.listForAdmin(page, limit, search);
  }

  async getTree(
    opts: { vendorId?: string; includeInactive?: boolean; locale?: string | null } = {},
  ) {
    if (opts.vendorId || opts.includeInactive) {
      // Vendor-scoped and admin (inactive-inclusive) trees are not cached —
      // the cache only holds the public active-only tree.
      return this.categoryService.getTree(opts);
    }
    const requested = categoryLocale(opts.locale);
    const locale = (TREE_CACHE_LOCALES as readonly string[]).includes(requested)
      ? (requested as TreeCacheLocale)
      : "en";
    return this.cacheService.getTree(locale);
  }

  async getBySlug(slug: string, opts: { locale?: string | null } = {}) {
    return this.categoryService.getBySlug(slug, opts);
  }

  async reorder(items: Array<{ id: string; sort_order: number }>) {
    await this.categoryService.reorder(items);
    await this.cacheService.invalidate();
    this.revalidateStorefront();
  }

  async linkAttribute(
    categoryId: string,
    attributeId: string,
    isRequired: boolean,
    sortOrder: number,
  ) {
    return this.categoryService.linkAttribute(categoryId, attributeId, isRequired, sortOrder);
  }

  async bulkLinkAttributes(categoryId: string, attributeIds: string[]) {
    const result = await this.categoryService.bulkLinkAttributes(categoryId, attributeIds);
    await this.cacheService.invalidate();
    return result;
  }

  async unlinkAttribute(categoryId: string, attributeId: string) {
    return this.categoryService.unlinkAttribute(categoryId, attributeId);
  }

  async getCategoryAttributes(categoryId: string) {
    return this.categoryService.getCategoryAttributes(categoryId);
  }
}
