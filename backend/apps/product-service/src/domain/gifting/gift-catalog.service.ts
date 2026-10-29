import { AppDataSource, GiftBoxStyle, GiftOccasion } from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";
import { generateSlug } from "@materialhub/utils";

export function buildGiftSlug(name: string, slug?: string): string {
  return generateSlug(slug?.trim() || name);
}

export interface OccasionInput {
  name: string;
  slug?: string;
  image_url?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

export interface StyleInput {
  name: string;
  slug?: string;
  description?: string | null;
  dimensions?: Record<string, unknown> | null;
  max_capacity?: number;
  base_price?: number;
  images?: string[];
  is_active?: boolean;
}

export class GiftCatalogService {
  private get occasionRepo() {
    return AppDataSource.getRepository(GiftOccasion);
  }
  private get styleRepo() {
    return AppDataSource.getRepository(GiftBoxStyle);
  }

  // ── Occasions ──
  async listOccasions(activeOnly = false) {
    return this.occasionRepo.find({
      where: activeOnly ? { is_active: true } : {},
      order: { sort_order: "ASC", name: "ASC" },
    });
  }
  async getOccasionBySlug(slug: string) {
    const o = await this.occasionRepo.findOne({ where: { slug, is_active: true } });
    if (!o) throw new HttpError(404, "Occasion not found", "OCCASION_NOT_FOUND");
    return o;
  }
  async createOccasion(data: OccasionInput) {
    let slug = buildGiftSlug(data.name, data.slug);
    if (await this.occasionRepo.findOne({ where: { slug }, withDeleted: true }))
      slug = `${slug}-${Date.now().toString(36)}`;
    return this.occasionRepo.save(
      this.occasionRepo.create({
        name: data.name,
        slug,
        image_url: data.image_url ?? null,
        sort_order: data.sort_order ?? 0,
        is_active: data.is_active ?? true,
      }),
    );
  }
  async updateOccasion(id: string, data: Partial<OccasionInput>) {
    const o = await this.occasionRepo.findOne({ where: { id } });
    if (!o) throw new HttpError(404, "Occasion not found", "OCCASION_NOT_FOUND");
    Object.assign(o, {
      name: data.name ?? o.name,
      image_url: data.image_url === undefined ? o.image_url : data.image_url,
      sort_order: data.sort_order ?? o.sort_order,
      is_active: data.is_active ?? o.is_active,
    });
    if (data.slug) o.slug = buildGiftSlug(o.name, data.slug);
    return this.occasionRepo.save(o);
  }
  async removeOccasion(id: string) {
    await this.occasionRepo.softDelete(id);
  }

  // ── Styles ──
  async listStyles(activeOnly = false) {
    return this.styleRepo.find({
      where: activeOnly ? { is_active: true } : {},
      order: { name: "ASC" },
    });
  }
  async getStyle(id: string) {
    const s = await this.styleRepo.findOne({ where: { id } });
    if (!s) throw new HttpError(404, "Style not found", "STYLE_NOT_FOUND");
    return s;
  }
  async createStyle(data: StyleInput) {
    let slug = buildGiftSlug(data.name, data.slug);
    if (await this.styleRepo.findOne({ where: { slug }, withDeleted: true }))
      slug = `${slug}-${Date.now().toString(36)}`;
    return this.styleRepo.save(
      this.styleRepo.create({
        name: data.name,
        slug,
        description: data.description ?? null,
        dimensions: (data.dimensions as never) ?? null,
        max_capacity: data.max_capacity ?? 1,
        base_price: data.base_price ?? 0,
        images: data.images ?? [],
        is_active: data.is_active ?? true,
      }),
    );
  }
  async updateStyle(id: string, data: Partial<StyleInput>) {
    const s = await this.getStyle(id);
    Object.assign(s, {
      name: data.name ?? s.name,
      description: data.description === undefined ? s.description : data.description,
      dimensions: data.dimensions === undefined ? s.dimensions : (data.dimensions as never),
      max_capacity: data.max_capacity ?? s.max_capacity,
      base_price: data.base_price ?? s.base_price,
      images: data.images ?? s.images,
      is_active: data.is_active ?? s.is_active,
    });
    if (data.slug) s.slug = buildGiftSlug(s.name, data.slug);
    return this.styleRepo.save(s);
  }
  async removeStyle(id: string) {
    await this.styleRepo.softDelete(id);
  }
}
