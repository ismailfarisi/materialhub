import type { ProductCollectionItemRole, ProductCollectionKind } from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";
import type { CollectionResolver, ResolveOpts } from "./collection-resolver.service.ts";
import type { CollectionSkuResolverService } from "./collection-sku-resolver.service.ts";
import type { CollectionService, CreateCollectionInput } from "./collection.service.ts";

export class CollectionController {
  constructor(
    private service: CollectionService,
    private resolver: CollectionResolver,
    private skuResolver: CollectionSkuResolverService,
  ) {}

  create(body: CreateCollectionInput) {
    return this.service.create(body);
  }
  update(id: string, body: Partial<CreateCollectionInput>) {
    return this.service.update(id, body);
  }
  remove(id: string) {
    return this.service.remove(id);
  }
  getById(id: string) {
    return this.service.getById(id);
  }
  listForAdmin(page?: number, limit?: number, search?: string) {
    return this.service.listForAdmin(page, limit, search);
  }
  addItems(
    id: string,
    role: ProductCollectionItemRole,
    entries: { product_id?: string; variant_id?: string; source_sku?: string }[],
  ) {
    return this.service.addItems(id, role, entries);
  }
  reorder(id: string, itemIds: string[]) {
    return this.service.reorder(id, itemIds);
  }
  removeItem(id: string, itemId: string) {
    return this.service.removeItem(id, itemId);
  }
  listItems(id: string, role: ProductCollectionItemRole) {
    return this.service.listItems(id, role);
  }
  resolveSkus(kind: ProductCollectionKind, skus: string[]) {
    return this.skuResolver.resolve(kind, skus);
  }
  async preview(id: string, opts: ResolveOpts) {
    const c = await this.service.getById(id);
    return this.resolver.resolve(c, opts);
  }
  async getStorefront(slug: string, opts: ResolveOpts) {
    const c = await this.service.getActiveBySlug(slug);
    if (!c) throw new HttpError(404, "Collection not found", "COLLECTION_NOT_FOUND");
    const result = await this.resolver.resolve(c, opts);
    return {
      collection: { id: c.id, name: c.name, slug: c.slug, description: c.description },
      ...result,
    };
  }
}
