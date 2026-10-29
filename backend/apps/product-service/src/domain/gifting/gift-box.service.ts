import {
  AppDataSource,
  GiftBox,
  GiftBoxItem,
  GiftBoxOccasion,
  GiftBoxStyle,
  Product,
  ProductVariant,
} from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";
import { generateSlug } from "@materialhub/utils";
import { type PricingItem, computeGiftBoxPrice } from "@materialhub/utils";
import { In } from "typeorm";

export function assertCapacity(items: { quantity: number }[], maxCapacity: number): void {
  const total = items.reduce((s, i) => s + i.quantity, 0);
  if (total > maxCapacity)
    throw new HttpError(
      422,
      `Box exceeds capacity (${total}/${maxCapacity})`,
      "GIFT_BOX_OVER_CAPACITY",
    );
}

export interface BoxItemInput {
  product_id: string;
  variant_id?: string | null;
  quantity: number;
  sort_order?: number;
}
export interface BoxInput {
  name: string;
  slug?: string;
  description?: string | null;
  style_id: string;
  hero_image_url?: string | null;
  discount_percentage?: number | null;
  is_active?: boolean;
  starts_at?: string | null;
  expires_at?: string | null;
  occasion_ids?: string[];
  items?: BoxItemInput[];
}

export class GiftBoxService {
  private get boxRepo() {
    return AppDataSource.getRepository(GiftBox);
  }
  private get itemRepo() {
    return AppDataSource.getRepository(GiftBoxItem);
  }
  private get occRepo() {
    return AppDataSource.getRepository(GiftBoxOccasion);
  }
  private get styleRepo() {
    return AppDataSource.getRepository(GiftBoxStyle);
  }
  private get productRepo() {
    return AppDataSource.getRepository(Product);
  }
  private get variantRepo() {
    return AppDataSource.getRepository(ProductVariant);
  }

  async hydrateItems(
    items: { product_id: string; variant_id: string | null; quantity: number }[],
  ): Promise<PricingItem[]> {
    if (items.length === 0) return [];

    const products = await this.productRepo.find({
      where: { id: In(items.map((i) => i.product_id)) },
    });
    const byProductId = new Map(products.map((p) => [p.id, p]));

    // Load any variants that are referenced
    const variantIds = items.map((i) => i.variant_id).filter((id): id is string => id != null);
    const variantMap = new Map<string, ProductVariant>();
    if (variantIds.length > 0) {
      const variants = await this.variantRepo.find({ where: { id: In(variantIds) } });
      for (const v of variants) variantMap.set(v.id, v);
    }

    return items.map((i) => {
      const p = byProductId.get(i.product_id);
      if (!p)
        throw new HttpError(422, `Product ${i.product_id} unavailable`, "GIFT_ITEM_UNAVAILABLE");

      // Prefer variant price override when a variant_id is provided and the variant exists
      const variant = i.variant_id ? variantMap.get(i.variant_id) : undefined;
      // Variant not found (e.g. soft-deleted) → gracefully fall back to product base price rather than failing the whole box.
      const unit_price = variant != null ? variant.price : p.price;

      return {
        product_id: i.product_id,
        variant_id: i.variant_id,
        vendor_id: p.vendor_id,
        quantity: i.quantity,
        unit_price,
      } satisfies PricingItem;
    });
  }

  private async loadStyle(styleId: string) {
    const s = await this.styleRepo.findOne({ where: { id: styleId } });
    if (!s) throw new HttpError(422, "Style not found", "STYLE_NOT_FOUND");
    return s;
  }

  async create(data: BoxInput) {
    const style = await this.loadStyle(data.style_id);
    const items = data.items ?? [];
    assertCapacity(items, style.max_capacity);
    let slug = generateSlug(data.slug?.trim() || data.name);
    if (await this.boxRepo.findOne({ where: { slug }, withDeleted: true }))
      slug = `${slug}-${Date.now().toString(36)}`;
    const box = await this.boxRepo.save(
      this.boxRepo.create({
        name: data.name,
        slug,
        description: data.description ?? null,
        style_id: data.style_id,
        hero_image_url: data.hero_image_url ?? null,
        discount_percentage: data.discount_percentage ?? null,
        is_active: data.is_active ?? true,
        starts_at: data.starts_at ? new Date(data.starts_at) : null,
        expires_at: data.expires_at ? new Date(data.expires_at) : null,
      }),
    );
    await this.replaceItems(box.id, items);
    await this.replaceOccasions(box.id, data.occasion_ids ?? []);
    return this.getById(box.id);
  }

  async update(id: string, data: Partial<BoxInput>) {
    const box = await this.boxRepo.findOne({ where: { id } });
    if (!box) throw new HttpError(404, "Box not found", "GIFT_BOX_NOT_FOUND");
    if (data.style_id) box.style_id = data.style_id;
    const style = await this.loadStyle(box.style_id);
    if (data.items) assertCapacity(data.items, style.max_capacity);
    Object.assign(box, {
      name: data.name ?? box.name,
      description: data.description === undefined ? box.description : data.description,
      hero_image_url: data.hero_image_url === undefined ? box.hero_image_url : data.hero_image_url,
      discount_percentage:
        data.discount_percentage === undefined ? box.discount_percentage : data.discount_percentage,
      is_active: data.is_active ?? box.is_active,
      starts_at:
        data.starts_at === undefined
          ? box.starts_at
          : data.starts_at
            ? new Date(data.starts_at)
            : null,
      expires_at:
        data.expires_at === undefined
          ? box.expires_at
          : data.expires_at
            ? new Date(data.expires_at)
            : null,
    });
    if (data.slug) {
      let newSlug = generateSlug(data.slug);
      const clash = await this.boxRepo.findOne({ where: { slug: newSlug }, withDeleted: true });
      if (clash && clash.id !== box.id) newSlug = `${newSlug}-${Date.now().toString(36)}`;
      box.slug = newSlug;
    }
    await this.boxRepo.save(box);
    if (data.items) await this.replaceItems(id, data.items);
    if (data.occasion_ids) await this.replaceOccasions(id, data.occasion_ids);
    return this.getById(id);
  }

  private async replaceItems(boxId: string, items: BoxItemInput[]) {
    await this.itemRepo.softDelete({ gift_box_id: boxId });
    if (items.length)
      await this.itemRepo.save(
        items.map((i, idx) =>
          this.itemRepo.create({
            gift_box_id: boxId,
            product_id: i.product_id,
            variant_id: i.variant_id ?? null,
            quantity: i.quantity,
            sort_order: i.sort_order ?? idx,
          }),
        ),
      );
  }

  private async replaceOccasions(boxId: string, occasionIds: string[]) {
    await this.occRepo.delete({ gift_box_id: boxId });
    if (occasionIds.length)
      await this.occRepo.save(
        occasionIds.map((occasion_id) => this.occRepo.create({ gift_box_id: boxId, occasion_id })),
      );
  }

  async remove(id: string) {
    await this.boxRepo.softDelete(id);
  }

  async getById(id: string) {
    const box = await this.boxRepo.findOne({
      where: { id },
      relations: { style: true, items: true },
    });
    if (!box) throw new HttpError(404, "Box not found", "GIFT_BOX_NOT_FOUND");
    return this.priced(box);
  }

  async getActiveBySlug(slug: string) {
    const box = await this.boxRepo.findOne({
      where: { slug, is_active: true },
      relations: { style: true, items: true },
    });
    if (!box) throw new HttpError(404, "Box not found", "GIFT_BOX_NOT_FOUND");
    const now = Date.now();
    if (
      (box.starts_at && box.starts_at.getTime() > now) ||
      (box.expires_at && box.expires_at.getTime() <= now)
    ) {
      throw new HttpError(404, "Box not found", "GIFT_BOX_NOT_FOUND");
    }
    return this.priced(box);
  }

  async listActive(occasionSlug?: string, page = 1, perPage = 24) {
    const qb = this.boxRepo
      .createQueryBuilder("b")
      .leftJoinAndSelect("b.style", "style")
      .where("b.is_active = true")
      .andWhere("(b.starts_at IS NULL OR b.starts_at <= now())")
      .andWhere("(b.expires_at IS NULL OR b.expires_at > now())");
    if (occasionSlug) {
      qb.innerJoin("gift_box_occasions", "gbo", "gbo.gift_box_id = b.id").innerJoin(
        "gift_occasions",
        "occ",
        "occ.id = gbo.occasion_id AND occ.slug = :slug",
        { slug: occasionSlug },
      );
    }
    qb.orderBy("b.created_at", "DESC")
      .skip((page - 1) * perPage)
      .take(perPage);
    const [boxes, total] = await qb.getManyAndCount();
    if (boxes.length) {
      const items = await this.itemRepo.find({
        where: { gift_box_id: In(boxes.map((b) => b.id)) },
        order: { sort_order: "ASC" },
      });
      const byBox = new Map<string, typeof items>();
      for (const it of items) {
        const arr = byBox.get(it.gift_box_id) ?? [];
        arr.push(it);
        byBox.set(it.gift_box_id, arr);
      }
      for (const b of boxes) b.items = byBox.get(b.id) ?? [];
    }
    const priced = await Promise.all(boxes.map((b) => this.priced(b)));
    return { items: priced, total, page, perPage };
  }

  async listForAdmin(page = 1, perPage = 24, search?: string) {
    const qb = this.boxRepo.createQueryBuilder("b").leftJoinAndSelect("b.style", "style");
    if (search?.trim()) {
      qb.where("(b.name ILIKE :q OR b.slug ILIKE :q)", { q: `%${search.trim()}%` });
    }
    qb.orderBy("b.created_at", "DESC")
      .skip((page - 1) * perPage)
      .take(perPage);
    const [boxes, total] = await qb.getManyAndCount();
    if (boxes.length) {
      const items = await this.itemRepo.find({
        where: { gift_box_id: In(boxes.map((b) => b.id)) },
        order: { sort_order: "ASC" },
      });
      const byBox = new Map<string, typeof items>();
      for (const it of items) {
        const arr = byBox.get(it.gift_box_id) ?? [];
        arr.push(it);
        byBox.set(it.gift_box_id, arr);
      }
      for (const b of boxes) b.items = byBox.get(b.id) ?? [];
    }
    const priced = await Promise.all(boxes.map((b) => this.priced(b)));
    return { items: priced, total, page, perPage };
  }

  private async priced(box: GiftBox) {
    const hydrated = await this.hydrateItems(
      (box.items ?? []).map((i) => ({
        product_id: i.product_id,
        variant_id: i.variant_id,
        quantity: i.quantity,
      })),
    );
    const price = computeGiftBoxPrice({
      items: hydrated,
      packagingPrice: box.style?.base_price ?? 0,
      discountPercentage: box.discount_percentage == null ? null : Number(box.discount_percentage),
    });
    return { box, price, hydratedItems: hydrated };
  }
}
