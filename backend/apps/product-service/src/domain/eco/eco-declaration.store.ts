import {
  AppDataSource,
  ECO_ATTRIBUTE_SLUGS,
  Product,
  ProductAttributeValue,
  ProductEcoDeclaration,
} from "@materialhub/database";
import { In, IsNull } from "typeorm";
import type { EcoDeclarationRow, EcoDeclarationStore } from "./eco-declaration.service.ts";

export interface EcoAttributeSummary {
  slug: string;
  name: string;
  values: string[];
}

/** Group a product's eco compliance attribute rows into `{ slug, name, values[] }`. */
export function summariseEcoAttributes(rows: any[]): EcoAttributeSummary[] {
  const bySlug = new Map<string, EcoAttributeSummary>();
  for (const row of rows) {
    const attr = row.attribute;
    if (!attr || !ECO_ATTRIBUTE_SLUGS.includes(attr.slug)) continue;
    const label = row.attributeValue?.display_value ?? row.attributeValue?.value ?? row.text_value;
    if (!label) continue;
    const entry: EcoAttributeSummary = bySlug.get(attr.slug) ?? {
      slug: attr.slug,
      name: attr.name,
      values: [],
    };
    entry.values.push(String(label));
    bySlug.set(attr.slug, entry);
  }
  return ECO_ATTRIBUTE_SLUGS.map((slug) => bySlug.get(slug)).filter(
    (e): e is EcoAttributeSummary => !!e,
  );
}

function toAdminRow(decl: any, attrs: EcoAttributeSummary[]) {
  const { certificate_key, product, vendor, ...rest } = decl;
  return {
    ...rest,
    has_certificate: !!certificate_key,
    product: product
      ? {
          id: product.id,
          name: product.name,
          slug: product.slug,
          status: product.status,
          sku: product.sku,
          category_name: product.category?.name ?? null,
        }
      : null,
    vendor: vendor ? { id: vendor.id, name: vendor.name, slug: vendor.slug } : null,
    eco_attributes: attrs,
  };
}

export class TypeormEcoDeclarationStore implements EcoDeclarationStore {
  private get repo() {
    return AppDataSource.getRepository(ProductEcoDeclaration);
  }

  async findByProduct(productId: string): Promise<EcoDeclarationRow | null> {
    return (await this.repo.findOne({ where: { product_id: productId } })) as any;
  }

  async findById(id: string): Promise<EcoDeclarationRow | null> {
    return (await this.repo.findOne({ where: { id } })) as any;
  }

  async save(row: Partial<EcoDeclarationRow>): Promise<EcoDeclarationRow> {
    return (await this.repo.save(this.repo.create(row as any))) as any;
  }

  async productOwner(productId: string): Promise<string | null> {
    const product = await AppDataSource.getRepository(Product).findOne({
      where: { id: productId },
      select: { id: true, vendor_id: true },
    });
    return product?.vendor_id ?? null;
  }

  private async attributesFor(productIds: string[]): Promise<Map<string, EcoAttributeSummary[]>> {
    const out = new Map<string, EcoAttributeSummary[]>();
    if (!productIds.length) return out;
    const rows = await AppDataSource.getRepository(ProductAttributeValue).find({
      where: { product_id: In(productIds), variant_id: IsNull() },
      relations: ["attribute", "attributeValue"],
    });
    const grouped = new Map<string, any[]>();
    for (const r of rows) grouped.set(r.product_id, [...(grouped.get(r.product_id) ?? []), r]);
    for (const id of productIds) out.set(id, summariseEcoAttributes(grouped.get(id) ?? []));
    return out;
  }

  async adminList(filters: {
    status?: string;
    q?: string;
    page: number;
    limit: number;
  }): Promise<{ items: any[]; total: number }> {
    const qb = this.repo
      .createQueryBuilder("d")
      .leftJoinAndSelect("d.product", "p")
      .leftJoinAndSelect("p.category", "c")
      .leftJoinAndSelect("d.vendor", "v")
      .where("p.deleted_at IS NULL");
    if (filters.status) qb.andWhere("d.status = :status", { status: filters.status });
    if (filters.q) {
      qb.andWhere("(p.name ILIKE :q OR v.name ILIKE :q OR p.sku ILIKE :q)", {
        q: `%${filters.q.replace(/[%_]/g, "\\$&")}%`,
      });
    }
    // Oldest submissions first so the queue is worked in order.
    qb.orderBy("d.submitted_at", "ASC")
      .skip((filters.page - 1) * filters.limit)
      .take(filters.limit);
    const [rows, total] = await qb.getManyAndCount();
    const attrs = await this.attributesFor(rows.map((r) => r.product_id));
    return { items: rows.map((r) => toAdminRow(r, attrs.get(r.product_id) ?? [])), total };
  }

  async adminDetail(id: string): Promise<any | null> {
    const row = await this.repo.findOne({
      where: { id },
      relations: ["product", "product.category", "vendor"],
    });
    if (!row) return null;
    const attrs = await this.attributesFor([row.product_id]);
    return toAdminRow(row, attrs.get(row.product_id) ?? []);
  }
}
