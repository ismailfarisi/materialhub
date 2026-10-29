import {
  AppDataSource,
  type CollectionRules,
  Product,
  ProductCollection,
  ProductCollectionItem,
  ProductCollectionItemRole,
  ProductCollectionKind,
  ProductCollectionSort,
} from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";
import { generateSlug } from "@materialhub/utils";
import { In } from "typeorm";

export function buildCollectionSlug(name: string, slug?: string): string {
  return generateSlug(slug?.trim() || name);
}

export function assignPositions(ids: string[]): { id: string; position: number }[] {
  return ids.map((id, position) => ({ id, position }));
}

export interface HydratedCollectionItem {
  item_id: string;
  product_id: string;
  name: string;
  image_url: string | null;
  sku: string | null;
  position: number;
}

/** Pure: join pivot items to their products for the admin editor list. */
export function shapeItems(
  items: { id: string; product_id: string | null; position: number; source_sku: string | null }[],
  products: { id: string; name: string; sku: string | null; images?: any[] }[],
): HydratedCollectionItem[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  return items
    .filter((i) => i.product_id)
    .map((i) => {
      const p = byId.get(i.product_id as string);
      const imgs = p?.images ?? [];
      const primary = imgs.find((im: any) => im.is_primary) ?? imgs[0];
      return {
        item_id: i.id,
        product_id: i.product_id as string,
        name: p?.name ?? "(unavailable product)",
        image_url: primary?.thumbnail_url ?? primary?.url ?? null,
        sku: p?.sku ?? i.source_sku ?? null,
        position: i.position,
      };
    });
}

export interface CreateCollectionInput {
  name: string;
  slug?: string;
  description?: string;
  kind?: ProductCollectionKind;
  rules?: CollectionRules | null;
  default_sort?: ProductCollectionSort;
  max_products?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;
  is_active?: boolean;
  created_by?: string | null;
}

export class CollectionService {
  constructor(private onChange?: (collectionId: string) => void) {}

  private get repo() {
    return AppDataSource.getRepository(ProductCollection);
  }

  async create(data: CreateCollectionInput): Promise<ProductCollection> {
    let slug = buildCollectionSlug(data.name, data.slug);
    const existing = await this.repo.findOne({ where: { slug }, withDeleted: true });
    if (existing) slug = `${slug}-${Date.now().toString(36)}`;
    const saved = await this.repo.save(
      this.repo.create({
        name: data.name,
        slug,
        description: data.description ?? null,
        kind: data.kind ?? ProductCollectionKind.product,
        rules: data.rules ?? null,
        default_sort: data.default_sort ?? ProductCollectionSort.custom,
        max_products: data.max_products ?? null,
        starts_at: data.starts_at ? new Date(data.starts_at) : null,
        ends_at: data.ends_at ? new Date(data.ends_at) : null,
        is_active: data.is_active ?? true,
        created_by: data.created_by ?? null,
      }),
    );
    this.onChange?.(saved.id);
    return saved;
  }

  async update(id: string, data: Partial<CreateCollectionInput>): Promise<ProductCollection> {
    const c = await this.repo.findOne({ where: { id } });
    if (!c) throw new HttpError(404, "Collection not found", "COLLECTION_NOT_FOUND");
    if (data.name !== undefined) c.name = data.name;
    if (data.slug !== undefined) {
      let slug = buildCollectionSlug(c.name, data.slug);
      const existing = await this.repo.findOne({ where: { slug }, withDeleted: true });
      if (existing && existing.id !== c.id) slug = `${slug}-${Date.now().toString(36)}`;
      c.slug = slug;
    }
    if (data.description !== undefined) c.description = data.description ?? null;
    if (data.kind !== undefined) c.kind = data.kind;
    if (data.rules !== undefined) c.rules = data.rules ?? null;
    if (data.default_sort !== undefined) c.default_sort = data.default_sort;
    if (data.max_products !== undefined) c.max_products = data.max_products ?? null;
    if (data.starts_at !== undefined)
      c.starts_at = data.starts_at ? new Date(data.starts_at) : null;
    if (data.ends_at !== undefined) c.ends_at = data.ends_at ? new Date(data.ends_at) : null;
    if (data.is_active !== undefined) c.is_active = data.is_active;
    const saved = await this.repo.save(c);
    this.onChange?.(id);
    return saved;
  }

  async remove(id: string): Promise<void> {
    const c = await this.repo.findOne({ where: { id } });
    if (!c) throw new HttpError(404, "Collection not found", "COLLECTION_NOT_FOUND");
    await this.repo.softRemove(c);
    this.onChange?.(id);
  }

  async getById(id: string): Promise<ProductCollection> {
    const c = await this.repo.findOne({ where: { id } });
    if (!c) throw new HttpError(404, "Collection not found", "COLLECTION_NOT_FOUND");
    return c;
  }

  async getActiveBySlug(slug: string): Promise<ProductCollection | null> {
    const c = await this.repo.findOne({ where: { slug, is_active: true } });
    if (!c) return null;
    const now = Date.now();
    if (c.starts_at && new Date(c.starts_at).getTime() > now) return null;
    if (c.ends_at && new Date(c.ends_at).getTime() < now) return null;
    return c;
  }

  async listForAdmin(page = 1, limit = 20, search?: string) {
    const qb = this.repo
      .createQueryBuilder("c")
      .orderBy("c.created_at", "DESC")
      .skip((page - 1) * limit)
      .take(limit);
    const q = search?.trim();
    if (q) qb.where("(c.name ILIKE :q OR c.slug ILIKE :q)", { q: `%${q}%` });
    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  private get itemRepo() {
    return AppDataSource.getRepository(ProductCollectionItem);
  }

  /** Bulk add pins/excludes. Positions continue after the current max for that role. */
  async addItems(
    collectionId: string,
    role: ProductCollectionItemRole,
    entries: { product_id?: string; variant_id?: string; source_sku?: string }[],
  ): Promise<ProductCollectionItem[]> {
    const c = await this.getById(collectionId);
    const isVariant = c.kind === ProductCollectionKind.variant;
    for (const e of entries) {
      if (isVariant && !e.variant_id) {
        throw new HttpError(422, "variant_id is required for a variant collection", "INVALID_ITEM");
      }
      if (!isVariant && !e.product_id) {
        throw new HttpError(422, "product_id is required for a product collection", "INVALID_ITEM");
      }
    }
    const { max } = await this.itemRepo
      .createQueryBuilder("i")
      .select("COALESCE(MAX(i.position), -1)", "max")
      .where("i.collection_id = :collectionId AND i.role = :role", { collectionId, role })
      .getRawOne();
    let pos = Number(max) + 1;
    const rows = entries.map((e) =>
      this.itemRepo.create({
        collection_id: collectionId,
        product_id: isVariant ? null : (e.product_id ?? null),
        variant_id: isVariant ? (e.variant_id ?? null) : null,
        role,
        position: pos++,
        source_sku: e.source_sku ?? null,
      }),
    );
    const result = await this.itemRepo.save(rows);
    this.onChange?.(collectionId);
    return result;
  }

  /** Set custom order: ids in desired order -> sequential positions. */
  async reorder(collectionId: string, itemIds: string[]): Promise<void> {
    const positions = assignPositions(itemIds);
    await AppDataSource.transaction(async (mgr) => {
      for (const { id, position } of positions) {
        await mgr.update(ProductCollectionItem, { id, collection_id: collectionId }, { position });
      }
    });
    this.onChange?.(collectionId);
  }

  async removeItem(collectionId: string, itemId: string): Promise<void> {
    const item = await this.itemRepo.findOne({
      where: { id: itemId, collection_id: collectionId },
    });
    if (!item) throw new HttpError(404, "Item not found", "ITEM_NOT_FOUND");
    await this.itemRepo.softRemove(item);
    this.onChange?.(collectionId);
  }

  /** Pinned product ids in custom order + excluded product ids (product kind). */
  async loadPinsAndExcludes(
    collectionId: string,
  ): Promise<{ pinIds: string[]; excludeIds: string[] }> {
    const rows = await this.itemRepo.find({
      where: { collection_id: collectionId },
      order: { position: "ASC" },
    });
    const pinIds: string[] = [];
    const excludeIds: string[] = [];
    for (const r of rows) {
      const id = r.product_id;
      if (!id) continue;
      if (r.role === ProductCollectionItemRole.pin) pinIds.push(id);
      else excludeIds.push(id);
    }
    return { pinIds, excludeIds };
  }

  /** Items for a role (pin|exclude) in position order, hydrated with product display info. */
  async listItems(
    collectionId: string,
    role: ProductCollectionItemRole,
  ): Promise<HydratedCollectionItem[]> {
    await this.getById(collectionId);
    const items = await this.itemRepo.find({
      where: { collection_id: collectionId, role },
      order: { position: "ASC" },
    });
    const productIds = items.map((i) => i.product_id).filter(Boolean) as string[];
    if (productIds.length === 0) return [];
    const products = await AppDataSource.getRepository(Product).find({
      where: { id: In(productIds) },
      relations: ["images"],
    });
    return shapeItems(items, products as any);
  }
}
