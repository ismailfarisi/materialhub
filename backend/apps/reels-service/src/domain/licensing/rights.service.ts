import {
  AppDataSource,
  Reel,
  ReelFeaturePlacement,
  ReelLicenseDownload,
  ReelLicenseFeature,
  ReelLicenseGrant,
  ReelLicenseRightsScope,
  SiteSetting,
} from "@materialhub/database";
import { BadRequestError, ForbiddenError, NotFoundError } from "@materialhub/plugins";
import { IsNull } from "typeorm";
import type { DownloadProvider } from "./download-provider.ts";

const SETTING = { downloadTtl: "reels_license_download_ttl_seconds" };
const DEFAULTS = { downloadTtl: 3600 };

export interface PinInput {
  placement: ReelFeaturePlacement;
  productId?: string | null;
  position?: number;
}

export class RightsService {
  constructor(private readonly downloads: DownloadProvider) {}

  private async setting(key: string, fallback: number): Promise<number> {
    const row = await AppDataSource.getRepository(SiteSetting).findOne({ where: { key } });
    const n = Number(row?.value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  /** Load a grant and assert it belongs to the vendor and is currently active (not revoked/expired). */
  private async loadActiveGrant(vendorId: string, grantId: string): Promise<ReelLicenseGrant> {
    const grant = await AppDataSource.getRepository(ReelLicenseGrant).findOne({
      where: { id: grantId },
    });
    if (!grant) throw new NotFoundError("grant_not_found");
    if (grant.vendor_id !== vendorId) throw new ForbiddenError("not_your_grant");
    if (grant.revoked_at) throw new BadRequestError("grant_not_active");
    if (grant.expires_at && grant.expires_at.getTime() <= Date.now()) {
      throw new BadRequestError("grant_not_active");
    }
    return grant;
  }

  private scopeAllowsPin(scope: ReelLicenseRightsScope): boolean {
    return scope === ReelLicenseRightsScope.in_platform || scope === ReelLicenseRightsScope.both;
  }
  private scopeAllowsDownload(scope: ReelLicenseRightsScope): boolean {
    return scope === ReelLicenseRightsScope.off_platform || scope === ReelLicenseRightsScope.both;
  }

  /** Pin a licensed reel to a product PDP or the vendor storefront (idempotent restore). */
  async pinFeature(
    vendorId: string,
    grantId: string,
    input: PinInput,
  ): Promise<ReelLicenseFeature> {
    const grant = await this.loadActiveGrant(vendorId, grantId);
    if (!this.scopeAllowsPin(grant.scope)) throw new BadRequestError("scope_denies_pin");
    const productId =
      input.placement === ReelFeaturePlacement.product ? (input.productId ?? null) : null;
    if (input.placement === ReelFeaturePlacement.product && !productId) {
      throw new BadRequestError("product_required_for_product_placement");
    }
    const repo = AppDataSource.getRepository(ReelLicenseFeature);

    // Idempotent restore: revive a soft-deleted matching feature instead of inserting a duplicate.
    const existing = await repo.findOne({
      where: {
        grant_id: grant.id,
        placement: input.placement,
        product_id: productId === null ? IsNull() : productId,
      },
      withDeleted: true,
    });
    if (existing) {
      existing.deleted_at = null;
      if (input.position !== undefined) existing.position = input.position;
      return repo.save(existing);
    }
    // Storefront has no partial-unique guard (NULL product_id) — enforce single live pin in code.
    if (input.placement === ReelFeaturePlacement.storefront) {
      const liveStorefront = await repo.findOne({
        where: {
          grant_id: grant.id,
          placement: ReelFeaturePlacement.storefront,
          deleted_at: IsNull(),
        },
      });
      if (liveStorefront) return liveStorefront;
    }
    try {
      return await repo.save(
        repo.create({
          grant_id: grant.id,
          reel_id: grant.reel_id,
          vendor_id: vendorId,
          placement: input.placement,
          product_id: productId,
          position: input.position ?? 0,
        }),
      );
    } catch (e) {
      // Concurrent double-pin lost the race to the partial-unique index (uq_rlf_surface for a product,
      // uq_rlf_storefront for the storefront). Resolve idempotently: return the live row the winner created.
      if (this.isUniqueViolation(e)) {
        const live = await repo.findOne({
          where: {
            grant_id: grant.id,
            placement: input.placement,
            product_id: productId === null ? IsNull() : productId,
            deleted_at: IsNull(),
          },
        });
        if (live) return live;
      }
      throw e;
    }
  }

  private isUniqueViolation(e: unknown): boolean {
    return typeof e === "object" && e !== null && (e as { code?: string }).code === "23505";
  }

  /** Unpin (soft-delete) a feature the vendor owns. */
  async unpinFeature(vendorId: string, featureId: string): Promise<void> {
    const repo = AppDataSource.getRepository(ReelLicenseFeature);
    const feature = await repo.findOne({ where: { id: featureId } });
    if (!feature) throw new NotFoundError("feature_not_found");
    if (feature.vendor_id !== vendorId) throw new ForbiddenError("not_your_feature");
    await repo.softDelete({ id: featureId });
  }

  /** Mint a signed download URL for an off-platform-licensed reel + write one audit row. */
  async requestDownload(
    vendorId: string,
    grantId: string,
  ): Promise<{ url: string; expiresAt: Date }> {
    const grant = await this.loadActiveGrant(vendorId, grantId);
    if (!this.scopeAllowsDownload(grant.scope)) throw new BadRequestError("scope_denies_download");
    const reel = await AppDataSource.getRepository(Reel).findOne({ where: { id: grant.reel_id } });
    if (!reel) throw new NotFoundError("reel_not_found");
    const ttl = await this.setting(SETTING.downloadTtl, DEFAULTS.downloadTtl);
    const minted = await this.downloads.mintDownloadUrl(reel.video_asset_id, ttl); // throws ServiceUnavailableError on failure (no audit row)
    const auditRepo = AppDataSource.getRepository(ReelLicenseDownload);
    await auditRepo.save(
      auditRepo.create({
        grant_id: grant.id,
        requested_by: vendorId,
        url_expires_at: minted.expiresAt,
      }),
    );
    return minted;
  }

  /** A vendor's grants (most recent first) with an `active` flag for the dashboard. */
  async listGrants(vendorId: string): Promise<Array<ReelLicenseGrant & { active: boolean }>> {
    const grants = await AppDataSource.getRepository(ReelLicenseGrant).find({
      where: { vendor_id: vendorId },
      order: { granted_at: "DESC" },
      take: 100,
    });
    const now = Date.now();
    return grants.map((g) => ({
      ...g,
      active: !g.revoked_at && (!g.expires_at || g.expires_at.getTime() > now),
    }));
  }

  /** Live (un-unpinned) features for a grant the vendor owns. */
  async listFeaturesForGrant(vendorId: string, grantId: string): Promise<ReelLicenseFeature[]> {
    const grant = await AppDataSource.getRepository(ReelLicenseGrant).findOne({
      where: { id: grantId },
    });
    if (!grant) throw new NotFoundError("grant_not_found");
    if (grant.vendor_id !== vendorId) throw new ForbiddenError("not_your_grant");
    return AppDataSource.getRepository(ReelLicenseFeature).find({
      where: { grant_id: grantId, deleted_at: IsNull() },
      order: { position: "ASC", created_at: "ASC" },
    });
  }

  /**
   * Public read: licensed reels a vendor has featured on a product PDP (productId) or storefront
   * (vendorId). Only surfaces features whose grant is still active and in-platform-scoped, ordered
   * by position. Exactly one of productId/vendorId must be provided.
   */
  async listFeaturedReels(args: { productId?: string; vendorId?: string }): Promise<
    Array<{
      feature_id: string;
      reel_id: string;
      position: number;
      video_playback_url: string;
      thumbnail_url: string | null;
      featured: true;
    }>
  > {
    if ((!args.productId && !args.vendorId) || (args.productId && args.vendorId)) {
      throw new BadRequestError("product_id_or_vendor_id_required");
    }
    const qb = AppDataSource.getRepository(ReelLicenseFeature)
      .createQueryBuilder("f")
      .innerJoin(ReelLicenseGrant, "g", "g.id = f.grant_id")
      .innerJoin(Reel, "r", "r.id = f.reel_id")
      .where("f.deleted_at IS NULL")
      .andWhere("r.deleted_at IS NULL")
      .andWhere("g.revoked_at IS NULL")
      .andWhere("(g.expires_at IS NULL OR g.expires_at > now())")
      .andWhere("g.scope IN (:...scopes)", {
        scopes: [ReelLicenseRightsScope.in_platform, ReelLicenseRightsScope.both],
      });
    if (args.productId) {
      qb.andWhere("f.placement = :pl", { pl: ReelFeaturePlacement.product }).andWhere(
        "f.product_id = :pid",
        { pid: args.productId },
      );
    } else {
      qb.andWhere("f.placement = :pl", { pl: ReelFeaturePlacement.storefront }).andWhere(
        "f.vendor_id = :vid",
        { vid: args.vendorId },
      );
    }
    const rows = await qb
      .orderBy("f.position", "ASC")
      .addOrderBy("f.created_at", "ASC")
      .select([
        "f.id AS feature_id",
        "f.reel_id AS reel_id",
        "f.position AS position",
        "r.video_playback_url AS video_playback_url",
        "r.thumbnail_url AS thumbnail_url",
      ])
      .getRawMany();
    return rows.map((x) => ({
      feature_id: x.feature_id,
      reel_id: x.reel_id,
      position: Number(x.position),
      video_playback_url: x.video_playback_url,
      thumbnail_url: x.thumbnail_url ?? null,
      featured: true as const,
    }));
  }
}
