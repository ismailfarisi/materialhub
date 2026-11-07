import { AppDataSource, Brand, BrandStatus, BrandTranslation } from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";
import { generateSlug } from "@materialhub/utils";

export class BrandService {
  private get repo() {
    return AppDataSource.getRepository(Brand);
  }
  private get translationRepo() {
    return AppDataSource.getRepository(BrandTranslation);
  }

  async create(data: { name: string; logo_url?: string; description?: string; website?: string }) {
    let slug = generateSlug(data.name);
    const existing = await this.repo.findOne({ where: { slug }, withDeleted: true });
    if (existing) slug = `${slug}-${Date.now().toString(36)}`;
    return this.repo.save(this.repo.create({ ...data, slug, is_active: true }));
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      logo_url: string;
      description: string;
      website: string;
      is_active: boolean;
    }>,
  ) {
    const brand = await this.repo.findOne({ where: { id } });
    if (!brand) throw new HttpError(404, "Brand not found", "BRAND_NOT_FOUND");
    Object.assign(brand, data);
    return this.repo.save(brand);
  }

  async remove(id: string) {
    const brand = await this.repo.findOne({ where: { id } });
    if (!brand) throw new HttpError(404, "Brand not found", "BRAND_NOT_FOUND");
    if ((brand.product_count ?? 0) > 0) {
      throw new HttpError(409, "Cannot delete brand with active products", "HAS_PRODUCTS");
    }
    await this.repo.softRemove(brand);
  }

  async listForAdmin(page = 1, limit = 20, search?: string) {
    const qb = this.repo
      .createQueryBuilder("b")
      .orderBy("b.name", "ASC")
      .skip((page - 1) * limit)
      .take(limit);

    const q = search?.trim();
    if (q) {
      // Substring match on name or slug; storefront-style ILIKE so "ord"
      // matches "The Ordinary". Postgres ILIKE is case-insensitive.
      qb.where("(b.name ILIKE :q OR b.slug ILIKE :q)", { q: `%${q}%` });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  // Recompute `brands.product_count` from the live `products` table. Used as a
  // manual escape hatch from the admin UI; the durable path is the
  // `sync_brand_product_count_on_change` trigger installed in migration
  // 1779900000000. Returns the number of brand rows whose counter changed.
  async recomputeProductCounts(): Promise<{ updated: number; total: number }> {
    const total = await this.repo.count();
    const result = await AppDataSource.query(`
      UPDATE brands b
         SET product_count = COALESCE(sub.cnt, 0)
        FROM brands b2
        LEFT JOIN (
          SELECT brand_id, COUNT(*)::int AS cnt
            FROM products
           WHERE brand_id IS NOT NULL
             AND deleted_at IS NULL
             AND status = 'published'
           GROUP BY brand_id
        ) sub ON sub.brand_id = b2.id
       WHERE b.id = b2.id
         AND b.deleted_at IS NULL
         AND b.product_count IS DISTINCT FROM COALESCE(sub.cnt, 0)
      RETURNING b.id;
    `);
    // UPDATE ... RETURNING resolves to [rows, rowCount], not rows.
    const updated = Array.isArray(result) ? Number(result[1] ?? 0) : 0;
    return { updated, total };
  }

  // ─── Vendor submission & moderation ──────────────────────────────────────

  /**
   * A vendor submits a brand the catalogue is missing.
   *
   * The row is created immediately as `pending` so the vendor can attach it to
   * products right away; `listPublic` and `getPublicBySlug` keep it off the
   * storefront until an admin approves it.
   *
   * A name that already exists returns the existing brand rather than creating
   * a duplicate — the vendor's problem ("I can't find my brand") is solved
   * either way, and the alternative is a review queue full of near-duplicates.
   * An existing *rejected* brand is the one case that raises: re-submitting it
   * would silently reopen a decision an admin already made.
   */
  async submitForVendor(
    vendorId: string,
    data: { name: string; logo_url?: string; description?: string; website_url?: string },
  ) {
    const name = data.name.trim();
    const slug = generateSlug(name);

    const existing = await this.repo.findOne({ where: { slug } });
    if (existing) {
      if (existing.status === BrandStatus.rejected) {
        throw new HttpError(
          409,
          "This brand was reviewed and rejected. Contact support if that was a mistake.",
          "BRAND_REJECTED",
        );
      }
      return existing;
    }

    return this.repo.save(
      this.repo.create({
        name,
        slug,
        logo_url: data.logo_url ?? null,
        description: data.description ?? null,
        website_url: data.website_url ?? null,
        is_active: true,
        status: BrandStatus.pending,
        submitted_by_vendor_id: vendorId,
        submitted_at: new Date(),
      }),
    );
  }

  /**
   * The brand picker for one vendor: every approved brand, plus the vendor's
   * own pending and rejected submissions so they can see where they stand.
   * Another vendor's pending brand is deliberately absent — it is not catalogue
   * data yet.
   */
  async listForVendor(vendorId: string, opts: { q?: string; limit?: number } = {}) {
    const qb = this.repo
      .createQueryBuilder("b")
      .where("b.is_active = :active", { active: true })
      .andWhere("(b.status = :approved OR b.submitted_by_vendor_id = :vendorId)", {
        approved: BrandStatus.approved,
        vendorId,
      })
      .select([
        "b.id",
        "b.name",
        "b.slug",
        "b.logo_url",
        "b.product_count",
        "b.status",
        "b.rejection_reason",
      ])
      // Pending first: the vendor's own submissions are what they came to check.
      .orderBy("CASE WHEN b.status = 'pending' THEN 0 ELSE 1 END", "ASC")
      .addOrderBy("b.name", "ASC");

    if (opts.q?.trim()) {
      qb.andWhere("b.name ILIKE :q", { q: `%${opts.q.trim()}%` });
    }
    qb.take(Math.min(Math.max(opts.limit ?? 50, 1), 100));

    return qb.getMany();
  }

  /** The admin review queue. Defaults to pending — the only actionable state. */
  async listSubmissions(opts: { status?: BrandStatus; page?: number; limit?: number } = {}) {
    const page = Math.max(1, Math.trunc(Number(opts.page)) || 1);
    const limit = opts.limit ?? 20;
    const qb = this.repo
      .createQueryBuilder("b")
      .where("b.status = :status", { status: opts.status ?? BrandStatus.pending })
      .andWhere("b.submitted_by_vendor_id IS NOT NULL")
      .orderBy("b.submitted_at", "ASC")
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async approveSubmission(id: string, reviewerUserId: string) {
    const brand = await this.repo.findOne({ where: { id } });
    if (!brand) throw new HttpError(404, "Brand not found", "BRAND_NOT_FOUND");
    if (brand.status !== BrandStatus.pending) {
      throw new HttpError(409, "This brand is not awaiting review", "BRAND_NOT_PENDING");
    }
    brand.status = BrandStatus.approved;
    brand.reviewed_by_user_id = reviewerUserId;
    brand.reviewed_at = new Date();
    brand.rejection_reason = null;
    return this.repo.save(brand);
  }

  /**
   * Rejecting keeps the row: products the vendor already attached to it must
   * not lose their brand_id, and the vendor needs to see the reason. The brand
   * simply never becomes public.
   */
  async rejectSubmission(id: string, reviewerUserId: string, reason: string) {
    const trimmed = reason.trim();
    if (!trimmed) {
      throw new HttpError(400, "A rejection reason is required", "REASON_REQUIRED");
    }
    const brand = await this.repo.findOne({ where: { id } });
    if (!brand) throw new HttpError(404, "Brand not found", "BRAND_NOT_FOUND");
    if (brand.status !== BrandStatus.pending) {
      throw new HttpError(409, "This brand is not awaiting review", "BRAND_NOT_PENDING");
    }
    brand.status = BrandStatus.rejected;
    brand.reviewed_by_user_id = reviewerUserId;
    brand.reviewed_at = new Date();
    brand.rejection_reason = trimmed;
    return this.repo.save(brand);
  }

  async listPublic(opts: { q?: string; ids?: string[]; limit?: number } = {}) {
    const qb = this.repo
      .createQueryBuilder("b")
      .where("b.is_active = :active", { active: true })
      // Unreviewed and rejected brands are not catalogue data.
      .andWhere("b.status = :status", { status: BrandStatus.approved })
      .select(["b.id", "b.name", "b.slug", "b.logo_url", "b.product_count"])
      .orderBy("b.name", "ASC");

    if (opts.ids?.length) {
      qb.andWhere("b.id IN (:...ids)", { ids: opts.ids });
    } else if (opts.q?.trim()) {
      // ILIKE prefix-only would miss e.g. "the ordinary" when user types "ord";
      // use a substring match. Postgres ILIKE is case-insensitive.
      qb.andWhere("b.name ILIKE :q", { q: `%${opts.q.trim()}%` });
    }

    if (opts.limit) qb.take(Math.min(Math.max(opts.limit, 1), 50));

    return qb.getMany();
  }

  // Public brand detail by slug — backs the storefront `/brand/[slug]` landing
  // page (mirrors `/categories/:slug`). Returns the editorial fields the page
  // needs and 404s on an unknown or deactivated brand.
  async getPublicBySlug(slug: string) {
    const brand = await this.repo.findOne({
      where: { slug, is_active: true, status: BrandStatus.approved },
      select: ["id", "name", "slug", "logo_url", "description", "product_count"],
    });
    if (!brand) throw new HttpError(404, "Brand not found", "BRAND_NOT_FOUND");
    return brand;
  }
}
