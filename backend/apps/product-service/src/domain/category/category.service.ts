import {
  AppDataSource,
  Category,
  CategoryAttribute,
  CategoryTranslation,
} from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";
import { generateSlug } from "@materialhub/utils";
import { In, Like } from "typeorm";

export class CategoryService {
  private get repo() {
    return AppDataSource.getRepository(Category);
  }
  private get translationRepo() {
    return AppDataSource.getRepository(CategoryTranslation);
  }
  private get categoryAttributeRepo() {
    return AppDataSource.getRepository(CategoryAttribute);
  }

  async create(data: {
    name: string;
    parent_id?: string;
    icon_url?: string | null;
    image_url?: string | null;
    banner_url?: string | null;
    description?: string | null;
    is_active?: boolean;
    is_featured?: boolean;
    commission_rate?: number | null;
    meta_title?: string | null;
    meta_description?: string | null;
    meta_keywords?: string | null;
    translations?: Array<{ locale: string; name: string; description?: string | null }>;
  }) {
    let slug = generateSlug(data.name);
    const existing = await this.repo.findOne({ where: { slug }, withDeleted: true });
    if (existing) slug = `${slug}-${Date.now().toString(36)}`;

    let path = slug;
    let depth = 0;

    if (data.parent_id) {
      const parent = await this.repo.findOne({ where: { id: data.parent_id } });
      if (!parent) throw new HttpError(404, "Parent category not found", "PARENT_NOT_FOUND");
      depth = (parent.depth ?? 0) + 1;
      if (depth > 3) throw new HttpError(422, "Maximum category depth is 4 levels", "MAX_DEPTH");
      path = `${parent.path}.${slug}`;
    }

    if (data.commission_rate !== undefined) this.assertCommission(data.commission_rate);

    const category = this.repo.create({
      name: data.name,
      slug,
      path,
      depth,
      parent_id: data.parent_id ?? null,
      icon_url: data.icon_url ?? null,
      image_url: data.image_url ?? null,
      banner_url: data.banner_url ?? null,
      description: data.description ?? null,
      is_active: data.is_active ?? true,
      is_featured: data.is_featured ?? false,
      commission_rate: data.commission_rate ?? null,
      meta_title: data.meta_title ?? null,
      meta_description: data.meta_description ?? null,
      meta_keywords: data.meta_keywords ?? null,
      sort_order: 0,
    });

    const result = await this.repo.save(category);
    if (data.translations) await this.upsertTranslations(result.id, data.translations);
    return result;
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      parent_id: string | null;
      icon_url: string | null;
      image_url: string | null;
      banner_url: string | null;
      description: string | null;
      is_active: boolean;
      is_featured: boolean;
      commission_rate: number | null;
      meta_title: string | null;
      meta_description: string | null;
      meta_keywords: string | null;
      translations: Array<{ locale: string; name: string; description?: string | null }>;
    }>,
  ) {
    const category = await this.repo.findOne({ where: { id } });
    if (!category) throw new HttpError(404, "Category not found", "CATEGORY_NOT_FOUND");

    if (data.name) category.name = data.name;

    if (data.icon_url !== undefined) category.icon_url = data.icon_url;
    if (data.image_url !== undefined) category.image_url = data.image_url;
    if (data.banner_url !== undefined) category.banner_url = data.banner_url;
    if (data.description !== undefined) category.description = data.description;
    if (data.is_active !== undefined) category.is_active = data.is_active;
    if (data.is_featured !== undefined) category.is_featured = data.is_featured;
    if (data.meta_title !== undefined) category.meta_title = data.meta_title;
    if (data.meta_description !== undefined) category.meta_description = data.meta_description;
    if (data.meta_keywords !== undefined) category.meta_keywords = data.meta_keywords;
    if (data.commission_rate !== undefined) {
      this.assertCommission(data.commission_rate);
      category.commission_rate = data.commission_rate;
    }

    // Handle reparenting (updates path/depth of node + descendants).
    // Scalar fields are assigned first so reparent's internal transaction save
    // persists them atomically with path/depth/parent_id changes.
    if (data.parent_id !== undefined && data.parent_id !== category.parent_id) {
      await this.reparent(category, data.parent_id);
    }

    const result = await this.repo.save(category);
    if (data.translations) await this.upsertTranslations(id, data.translations);
    return result;
  }

  private assertCommission(rate: number | null) {
    if (rate === null) return;
    if (rate < 0 || rate > 100) {
      throw new HttpError(422, "Commission rate must be between 0 and 100", "INVALID_COMMISSION");
    }
  }

  private async upsertTranslations(
    categoryId: string,
    translations: Array<{ locale: string; name: string; description?: string | null }>,
  ): Promise<void> {
    for (const entry of translations) {
      const locale = (entry.locale ?? "").trim();
      if (!locale) continue;

      const existing = await this.translationRepo.findOne({
        where: { category_id: categoryId, locale },
        withDeleted: true,
      });

      const name = (entry.name ?? "").trim();
      if (!name) {
        // Blank name => remove the translation entirely (hard delete to free the
        // (category_id, locale) unique slot — the constraint is NOT partial).
        if (existing) await this.translationRepo.remove(existing);
        continue;
      }

      if (existing) {
        existing.name = name;
        existing.description = entry.description ?? null;
        existing.deleted_at = null; // revive if it had been soft-deleted
        await this.translationRepo.save(existing);
      } else {
        await this.translationRepo.save(
          this.translationRepo.create({
            category_id: categoryId,
            locale,
            name,
            description: entry.description ?? null,
          }),
        );
      }
    }
  }

  private async reparent(category: Category, newParentId: string | null) {
    const oldPath = category.path ?? "";

    let newPath: string;
    let newDepth: number;

    if (newParentId) {
      const parent = await this.repo.findOne({ where: { id: newParentId } });
      if (!parent) throw new HttpError(404, "Parent category not found", "PARENT_NOT_FOUND");
      newDepth = (parent.depth ?? 0) + 1;
      newPath = `${parent.path}.${category.slug}`;
    } else {
      newDepth = 0;
      newPath = category.slug;
    }

    // Check depth constraint for descendants
    const descendants = await this.repo.find({
      where: { path: Like(`${oldPath}.%`) } as any,
    });
    const maxDescendantDepth = descendants.reduce(
      (max, d) => Math.max(max, (d.depth ?? 0) - (category.depth ?? 0)),
      0,
    );
    if (newDepth + maxDescendantDepth > 3) {
      throw new HttpError(422, "Reparenting would exceed max depth of 4", "MAX_DEPTH");
    }

    // Batch update descendants
    await AppDataSource.transaction(async (manager) => {
      for (const desc of descendants) {
        desc.path = (desc.path ?? "").replace(oldPath, newPath);
        desc.depth = (desc.depth ?? 0) - (category.depth ?? 0) + newDepth;
      }
      if (descendants.length > 0) {
        await manager.save(Category, descendants);
      }

      category.parent_id = newParentId;
      category.path = newPath;
      category.depth = newDepth;
      await manager.save(Category, category);
    });
  }

  async remove(id: string) {
    const category = await this.repo.findOne({ where: { id } });
    if (!category) throw new HttpError(404, "Category not found", "CATEGORY_NOT_FOUND");
    if ((category.product_count ?? 0) > 0) {
      throw new HttpError(409, "Cannot delete category with active products", "HAS_PRODUCTS");
    }
    await this.repo.softRemove(category);
  }

  async listForAdmin(page = 1, limit = 20, search?: string) {
    const qb = this.repo.createQueryBuilder("c");
    if (search) qb.where("c.name ILIKE :search", { search: `%${search}%` });
    qb.orderBy("c.sort_order", "ASC").addOrderBy("c.name", "ASC");
    qb.skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async getTree(opts: { vendorId?: string; includeInactive?: boolean } = {}): Promise<Category[]> {
    const all = await this.repo.find({
      where: opts.includeInactive ? {} : { is_active: true },
      order: { sort_order: "ASC", name: "ASC" },
    });

    // Admin trees carry translations so the editor can prefill them.
    const translations = opts.includeInactive
      ? await this.loadTranslations(all.map((c) => c.id))
      : undefined;

    if (!opts.vendorId) {
      return this.buildTree(all, null, translations);
    }

    // Vendor-scoped: find categories containing this vendor's products,
    // expand to include all ancestors, then prune the tree.
    const allowedIds = await this.collectVendorCategoryIds(opts.vendorId);
    if (allowedIds.size === 0) return [];
    return this.buildTree(
      all.filter((c) => allowedIds.has(c.id)),
      null,
      translations,
    );
  }

  private async loadTranslations(
    categoryIds: string[],
  ): Promise<Map<string, Array<{ locale: string; name: string; description: string | null }>>> {
    const map = new Map<
      string,
      Array<{ locale: string; name: string; description: string | null }>
    >();
    if (categoryIds.length === 0) return map;
    const rows = await this.translationRepo.find({
      where: { category_id: In(categoryIds) },
      order: { locale: "ASC" },
    });
    for (const r of rows) {
      const list = map.get(r.category_id) ?? [];
      list.push({ locale: r.locale, name: r.name, description: r.description });
      map.set(r.category_id, list);
    }
    return map;
  }

  private async collectVendorCategoryIds(vendorId: string): Promise<Set<string>> {
    const rows = await AppDataSource.query(
      `WITH leaf_ids AS (
         SELECT DISTINCT pc."category_id" AS id
           FROM "product_categories" pc
           JOIN "products" p ON p."id" = pc."product_id"
          WHERE p."vendor_id" = $1
            AND p."deleted_at" IS NULL
       ),
       ancestors AS (
         SELECT c."id", c."parent_id" FROM "categories" c
          WHERE c."id" IN (SELECT id FROM leaf_ids)
         UNION
         SELECT c."id", c."parent_id" FROM "categories" c
           JOIN ancestors a ON c."id" = a."parent_id"
       )
       SELECT id FROM ancestors`,
      [vendorId],
    );
    return new Set(rows.map((r: { id: string }) => r.id));
  }

  private buildTree(
    categories: Category[],
    parentId: string | null = null,
    translations?: Map<string, Array<{ locale: string; name: string; description: string | null }>>,
  ): any[] {
    return categories
      .filter((c) => c.parent_id === parentId)
      .map((c) => {
        const node: any = {
          ...c,
          children: this.buildTree(categories, c.id, translations),
        };
        if (translations) node.translations = translations.get(c.id) ?? [];
        return node;
      });
  }

  async getBySlug(slug: string) {
    const category = await this.repo.findOne({ where: { slug } });
    if (!category) throw new HttpError(404, "Category not found", "CATEGORY_NOT_FOUND");

    // Build breadcrumb from path
    const pathParts = (category.path ?? "").split(".");
    const breadcrumb = [];
    for (let i = 0; i < pathParts.length; i++) {
      const partPath = pathParts.slice(0, i + 1).join(".");
      const ancestor = await this.repo.findOne({ where: { path: partPath } });
      if (ancestor) breadcrumb.push({ id: ancestor.id, name: ancestor.name, slug: ancestor.slug });
    }

    const children = await this.repo.find({
      where: { parent_id: category.id, is_active: true },
      order: { sort_order: "ASC", name: "ASC" },
    });

    return { ...category, breadcrumb, children };
  }

  async reorder(items: Array<{ id: string; sort_order: number }>) {
    await AppDataSource.transaction(async (manager) => {
      for (const item of items) {
        await manager.update(Category, { id: item.id }, { sort_order: item.sort_order });
      }
    });
  }

  async linkAttribute(
    categoryId: string,
    attributeId: string,
    isRequired: boolean,
    sortOrder: number,
  ) {
    const existing = await this.categoryAttributeRepo.findOne({
      where: { category_id: categoryId, attribute_id: attributeId },
    });
    if (existing) throw new HttpError(409, "Attribute already linked", "ALREADY_LINKED");

    return this.categoryAttributeRepo.save(
      this.categoryAttributeRepo.create({
        category_id: categoryId,
        attribute_id: attributeId,
        is_required: isRequired,
        sort_order: sortOrder,
      }),
    );
  }

  async bulkLinkAttributes(categoryId: string, attributeIds: string[]) {
    const existing = await this.categoryAttributeRepo.find({
      where: { category_id: categoryId },
      select: ["attribute_id"],
    });
    const existingIds = new Set(existing.map((e) => e.attribute_id));

    const newLinks = attributeIds
      .filter((id) => !existingIds.has(id))
      .map((attributeId, index) =>
        this.categoryAttributeRepo.create({
          category_id: categoryId,
          attribute_id: attributeId,
          is_required: false,
          sort_order: existingIds.size + index,
        }),
      );

    if (newLinks.length === 0) return [];
    return this.categoryAttributeRepo.save(newLinks);
  }

  async unlinkAttribute(categoryId: string, attributeId: string) {
    const link = await this.categoryAttributeRepo.findOne({
      where: { category_id: categoryId, attribute_id: attributeId },
    });
    if (!link) throw new HttpError(404, "Attribute link not found", "LINK_NOT_FOUND");
    await this.categoryAttributeRepo.remove(link);
  }

  // Returns CategoryAttribute[] with relations ["attribute", "attribute.values"].
  // The attribute's filter_input_type and each value's color_hex/swatch_image_url
  // are used by the storefront filter dispatcher to pick the right renderer.
  async getCategoryAttributes(categoryId: string) {
    return this.categoryAttributeRepo.find({
      where: { category_id: categoryId },
      relations: ["attribute", "attribute.values"],
      order: { sort_order: "ASC" },
    });
  }
}
