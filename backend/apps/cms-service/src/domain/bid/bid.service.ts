import { config } from "@materialhub/config";
import {
  AppDataSource,
  BidStatus,
  LayoutSection,
  LayoutVersion,
  PageLayout,
  SectionBid,
  SourceMode,
} from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";
import jwt from "jsonwebtoken";
import type { EntityManager, FindOptionsWhere } from "typeorm";

export class BidService {
  private _repo?: ReturnType<typeof AppDataSource.getRepository<SectionBid>>;
  private _sectionRepo?: ReturnType<typeof AppDataSource.getRepository<LayoutSection>>;
  private _layoutRepo?: ReturnType<typeof AppDataSource.getRepository<PageLayout>>;
  private _versionRepo?: ReturnType<typeof AppDataSource.getRepository<LayoutVersion>>;

  private get repo() {
    return this._repo ?? AppDataSource.getRepository(SectionBid);
  }
  private get sectionRepo() {
    return this._sectionRepo ?? AppDataSource.getRepository(LayoutSection);
  }
  private get layoutRepo() {
    return this._layoutRepo ?? AppDataSource.getRepository(PageLayout);
  }
  private get versionRepo() {
    return this._versionRepo ?? AppDataSource.getRepository(LayoutVersion);
  }

  // Direct cross-domain reads (cms-service shares the database with vendor-service).
  // Importing the Vendor entity keeps us schema-coupled at compile time, not runtime.
  private get vendorRepoUnsafe() {
    return AppDataSource;
  }

  // ─── Admin ───────────────────────────────────────────────────────────────

  async listAll(query: {
    section_id?: string;
    vendor_id?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const { page = 1, limit = 20, section_id, vendor_id, status } = query;
    const where: FindOptionsWhere<SectionBid> = {};
    if (section_id) where.section_id = section_id;
    if (vendor_id) where.vendor_id = vendor_id;
    if (status) where.status = status as BidStatus;

    const [bids, total] = await this.repo.findAndCount({
      where,
      order: { created_at: "DESC" },
      skip: (page - 1) * limit,
      take: limit,
    });

    const enriched = await Promise.all(
      bids.map(async (bid) => {
        const [vendor, section, outranked] = await Promise.all([
          this.vendorLookup(bid.vendor_id),
          this.sectionContextLookup(bid.section_id),
          this.computeOutranked(bid),
        ]);
        return { ...bid, vendor, section, outranked };
      }),
    );

    return { data: enriched, total, page, limit };
  }

  async approve(bidId: string) {
    const bid = await this.repo.findOne({ where: { id: bidId } });
    if (!bid) throw new HttpError(404, "Bid not found", "BID_NOT_FOUND");
    if (bid.status !== BidStatus.pending && bid.status !== BidStatus.active) {
      throw new HttpError(400, "Bid cannot be approved in current status", "INVALID_BID_STATUS");
    }
    bid.status = BidStatus.won;
    return this.repo.save(bid);
  }

  async reject(bidId: string) {
    const bid = await this.repo.findOne({ where: { id: bidId } });
    if (!bid) throw new HttpError(404, "Bid not found", "BID_NOT_FOUND");
    bid.status = BidStatus.lost;
    return this.repo.save(bid);
  }

  async issuePreviewToken(
    bidId: string,
    opts: { requestor: "admin" | "vendor"; vendor_id?: string },
  ): Promise<{ token: string; layout_slug: string; expires_at: string }> {
    const bid = await this.repo.findOne({ where: { id: bidId } });
    if (!bid) throw new HttpError(404, "Bid not found", "BID_NOT_FOUND");

    if (opts.requestor === "vendor" && bid.vendor_id !== opts.vendor_id) {
      throw new HttpError(403, "Forbidden: bid does not belong to this vendor", "BID_FORBIDDEN");
    }

    const layoutSlug = await this.resolveLayoutSlugForSection(bid.section_id);
    if (!layoutSlug) {
      throw new HttpError(404, "Section is not on a published layout", "SECTION_NOT_PUBLISHED");
    }

    const expiresInSec = 300;
    const payload: Record<string, unknown> = {
      bid_id: bid.id,
      requestor: opts.requestor,
      aud: "preview",
    };
    if (opts.requestor === "vendor") payload.vendor_id = opts.vendor_id;

    const token = jwt.sign(payload, config.jwt.accessSecret, {
      algorithm: "HS256",
      expiresIn: expiresInSec,
    });

    return {
      token,
      layout_slug: layoutSlug,
      expires_at: new Date(Date.now() + expiresInSec * 1000).toISOString(),
    };
  }

  private async vendorLookup(vendorId: string) {
    const rows = await this.vendorRepoUnsafe.query(
      `SELECT id, name, business_name, slug, logo_url
         FROM vendors WHERE id = $1 AND deleted_at IS NULL`,
      [vendorId],
    );
    return rows[0] ?? null;
  }

  private async sectionContextLookup(sectionId: string) {
    const rows = await this.vendorRepoUnsafe.query(
      `SELECT
         ls.id,
         ls.position,
         ls.bid_config,
         st.name AS type_name,
         st.label AS type_label,
         pl.slug AS layout_slug,
         pl.title AS layout_title
       FROM layout_sections ls
       JOIN section_types st ON st.id = ls.section_type_id
       JOIN layout_versions lv ON lv.id = ls.version_id
       JOIN page_layouts pl ON pl.id = lv.layout_id
       WHERE ls.id = $1 AND pl.deleted_at IS NULL`,
      [sectionId],
    );
    if (!rows[0]) return null;
    const row = rows[0];
    return {
      id: row.id,
      position: row.position,
      type_name: row.type_name,
      type_label: row.type_label,
      layout_slug: row.layout_slug,
      layout_title: row.layout_title,
      slots: row.bid_config?.slots ?? 4,
    };
  }

  private async computeOutranked(bid: SectionBid): Promise<{
    is_outranked: boolean;
    cutoff_bid_amount_fils?: number;
    cutoff_vendor_name?: string;
    slots: number;
  } | null> {
    if (
      bid.status === BidStatus.lost ||
      bid.status === BidStatus.cancelled ||
      bid.status === BidStatus.expired
    ) {
      return null;
    }

    const slots = await this.fetchSectionSlots(bid.section_id);

    const overlapping = await this.fetchOverlappingBids(bid);
    overlapping.sort((a: any, b: any) => b.bid_amount_fils - a.bid_amount_fils);

    const myRankIdx = overlapping.findIndex((b: any) => b.id === bid.id);
    const isOutranked = myRankIdx >= slots;

    if (!isOutranked) {
      return { is_outranked: false, slots };
    }

    const cutoff = overlapping[slots - 1];
    const cutoffName = cutoff ? await this.vendorNameLookup(cutoff.vendor_id) : null;

    return {
      is_outranked: true,
      cutoff_bid_amount_fils: cutoff?.bid_amount_fils,
      cutoff_vendor_name: cutoffName ?? undefined,
      slots,
    };
  }

  private async fetchSectionSlots(sectionId: string): Promise<number> {
    const rows = await this.vendorRepoUnsafe.query(
      "SELECT bid_config FROM layout_sections WHERE id = $1",
      [sectionId],
    );
    return rows[0]?.bid_config?.slots ?? 4;
  }

  private async fetchOverlappingBids(bid: SectionBid) {
    return this.vendorRepoUnsafe.query(
      `SELECT id, vendor_id, bid_amount_fils
         FROM section_bids
        WHERE section_id = $1
          AND status IN ('pending', 'active', 'won')
          AND starts_at <= $3
          AND expires_at >= $2`,
      [bid.section_id, bid.starts_at, bid.expires_at],
    );
  }

  private async vendorNameLookup(vendorId: string): Promise<string | null> {
    const rows = await this.vendorRepoUnsafe.query(
      "SELECT name FROM vendors WHERE id = $1 AND deleted_at IS NULL",
      [vendorId],
    );
    return rows[0]?.name ?? null;
  }

  /**
   * Find the layout slug a section currently sits on. Walks
   * section → version → page_layout. Returns null if the section's version
   * is not the published version of any layout (e.g. it's draft-only).
   */
  private async resolveLayoutSlugForSection(sectionId: string): Promise<string | null> {
    const section = await this.sectionRepo.findOne({ where: { id: sectionId } });
    if (!section) return null;
    const layout = await this.layoutRepo.findOne({
      where: [
        { published_version_id: section.version_id },
        { draft_version_id: section.version_id },
      ],
    });
    return layout?.slug ?? null;
  }

  // ─── Vendor ──────────────────────────────────────────────────────────────

  async listByVendor(vendorId: string) {
    const bids = await this.repo.find({
      where: { vendor_id: vendorId },
      order: { created_at: "DESC" },
    });
    return Promise.all(
      bids.map(async (bid) => {
        const section = await this.sectionContextLookup(bid.section_id);
        return { ...bid, section };
      }),
    );
  }

  async availableSections() {
    const sections = await this.sectionRepo.find({
      where: { source_mode: SourceMode.bidded, enabled: true },
      relations: ["section_type"],
    });

    const enriched = await Promise.all(
      sections.map(async (section) => {
        const [stats, layoutCtx] = await Promise.all([
          this.repo
            .createQueryBuilder("b")
            .select("MAX(b.bid_amount_fils)", "highest_bid_fils")
            .addSelect("COUNT(b.id)", "total_bids")
            .where("b.section_id = :sectionId", { sectionId: section.id })
            .andWhere("b.status IN (:...statuses)", {
              statuses: [BidStatus.pending, BidStatus.active, BidStatus.won],
            })
            .getRawOne(),
          this.sectionContextLookup(section.id),
        ]);

        return {
          ...section,
          bid_stats: {
            highest_bid_fils: stats?.highest_bid_fils ? Number(stats.highest_bid_fils) : null,
            total_bids: Number(stats?.total_bids ?? 0),
          },
          layout_slug: layoutCtx?.layout_slug ?? null,
          layout_title: layoutCtx?.layout_title ?? null,
          position: layoutCtx?.position ?? null,
        };
      }),
    );

    return enriched.filter((s) => s.layout_slug != null);
  }

  async placeBid(
    vendorId: string,
    data: {
      section_id: string;
      bid_amount_fils: number;
      product_id?: string;
      content?: Record<string, unknown>;
      starts_at: string;
      expires_at: string;
    },
  ) {
    const section = await this.sectionRepo.findOne({ where: { id: data.section_id } });
    if (!section || section.source_mode !== SourceMode.bidded) {
      throw new HttpError(400, "Section does not accept bids", "SECTION_NOT_BIDDED");
    }

    const bidConfig = section.bid_config as { min_bid_fils?: number } | null;
    if (bidConfig?.min_bid_fils && data.bid_amount_fils < bidConfig.min_bid_fils) {
      throw new HttpError(400, `Minimum bid is ${bidConfig.min_bid_fils} fils`, "BID_TOO_LOW");
    }

    const bid = this.repo.create({
      section_id: data.section_id,
      vendor_id: vendorId,
      bid_amount_fils: data.bid_amount_fils,
      product_id: data.product_id || null,
      content: data.content || null,
      starts_at: new Date(data.starts_at),
      expires_at: new Date(data.expires_at),
      status: BidStatus.pending,
    });
    return this.repo.save(bid);
  }

  async updateBid(
    bidId: string,
    vendorId: string,
    data: {
      bid_amount_fils?: number;
      content?: Record<string, unknown>;
    },
  ) {
    const bid = await this.repo.findOne({ where: { id: bidId, vendor_id: vendorId } });
    if (!bid) throw new HttpError(404, "Bid not found", "BID_NOT_FOUND");
    if (bid.status !== BidStatus.pending && bid.status !== BidStatus.active) {
      throw new HttpError(400, "Cannot update bid in current status", "INVALID_BID_STATUS");
    }
    Object.assign(bid, data);
    return this.repo.save(bid);
  }

  async cancelBid(bidId: string, vendorId: string) {
    const bid = await this.repo.findOne({ where: { id: bidId, vendor_id: vendorId } });
    if (!bid) throw new HttpError(404, "Bid not found", "BID_NOT_FOUND");
    bid.status = BidStatus.cancelled;
    return this.repo.save(bid);
  }

  /**
   * Cascade-cancel all pending/active/won bids on any section of any version
   * of the given layout. Sets `cancellation_reason = 'layout_retired'`.
   * Caller must wrap in a transaction.
   */
  async cancelBidsForLayout(em: EntityManager, layoutId: string): Promise<number> {
    const result = await em.query(
      `UPDATE section_bids
          SET status = 'cancelled',
              cancellation_reason = 'layout_retired',
              updated_at = NOW()
        WHERE status IN ('pending', 'active', 'won')
          AND section_id IN (
            SELECT ls.id FROM layout_sections ls
            JOIN layout_versions lv ON lv.id = ls.version_id
            WHERE lv.layout_id = $1
          )`,
      [layoutId],
    );
    // node-postgres returns { rowCount } in the second element of the array result
    // when using QueryRunner; for AppDataSource.query, returns an array of rows.
    // Use raw query result count as best-effort:
    return Array.isArray(result) ? ((result as any).length ?? 0) : 0;
  }

  /**
   * Cascade-cancel all pending/active/won bids on a single section.
   * Caller must wrap in a transaction.
   */
  async cancelBidsForSection(em: EntityManager, sectionId: string): Promise<number> {
    const result = await em.query(
      `UPDATE section_bids
          SET status = 'cancelled',
              cancellation_reason = 'section_removed',
              updated_at = NOW()
        WHERE status IN ('pending', 'active', 'won')
          AND section_id = $1`,
      [sectionId],
    );
    return Array.isArray(result) ? ((result as any).length ?? 0) : 0;
  }
}
