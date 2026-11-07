import type { CategoryCacheService } from "./category-cache.service.ts";
import type { CategoryService } from "./category.service.ts";

export class CategoryController {
  constructor(
    private readonly categoryService: CategoryService,
    private readonly cacheService: CategoryCacheService,
  ) {}

  async create(data: any) {
    const result = await this.categoryService.create(data);
    await this.cacheService.invalidate();
    return result;
  }

  async update(id: string, data: any) {
    const result = await this.categoryService.update(id, data);
    await this.cacheService.invalidate();
    return result;
  }

  async remove(id: string) {
    await this.categoryService.remove(id);
    await this.cacheService.invalidate();
  }

  async listForAdmin(page?: number, limit?: number, search?: string) {
    return this.categoryService.listForAdmin(page, limit, search);
  }

  async getTree(opts: { vendorId?: string; includeInactive?: boolean } = {}) {
    if (opts.vendorId || opts.includeInactive) {
      // Vendor-scoped and admin (inactive-inclusive) trees are not cached —
      // the cache only holds the public active-only tree.
      return this.categoryService.getTree(opts);
    }
    return this.cacheService.getTree();
  }

  async getBySlug(slug: string, opts: { locale?: string | null } = {}) {
    return this.categoryService.getBySlug(slug, opts);
  }

  async reorder(items: Array<{ id: string; sort_order: number }>) {
    await this.categoryService.reorder(items);
    await this.cacheService.invalidate();
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
