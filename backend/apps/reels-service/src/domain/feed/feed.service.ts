import {
  AppDataSource,
  Category,
  type Reel,
  Reel as ReelEntity,
  ReelStatus,
  type ReelView,
  ReelView as ReelViewEntity,
  UserFollow,
} from "@materialhub/database";
import type { Repository } from "typeorm";
import type { FeedCacheClient } from "./feed-cache.client.ts";

export interface HomeFeedQuery {
  tab: "for_you" | "latest" | "following";
  language: string;
  country: string;
  userId: string | null;
  cursor?: string;
  limit: number;
}

export interface FeedResult {
  reels: Reel[];
  nextCursor: string | null;
}

export class FeedService {
  private viewRepo!: Repository<ReelView>;
  private reelRepo!: Repository<Reel>;

  constructor(
    private readonly cache: FeedCacheClient,
    viewRepo?: Repository<ReelView>,
    reelRepo?: Repository<Reel>,
  ) {
    if (viewRepo) this.viewRepo = viewRepo;
    if (reelRepo) this.reelRepo = reelRepo;
  }

  private getRepos() {
    if (!this.viewRepo) this.viewRepo = AppDataSource.getRepository(ReelViewEntity);
    if (!this.reelRepo) this.reelRepo = AppDataSource.getRepository(ReelEntity);
    return { viewRepo: this.viewRepo, reelRepo: this.reelRepo };
  }

  // In-process cache for category metadata. The RedisLike interface used by
  // FeedCacheClient only exposes ZSET ops, not GET/SET, so a real cross-worker
  // cache would need a separate client. An in-process Map keyed by both
  // `id:<uuid>` and `slug:<slug>` is sufficient: category count is bounded by
  // the real taxonomy (low hundreds) and the TTL keeps entries fresh enough.
  private categoryMeta = new Map<
    string,
    { value: { id: string; path: string }; expiresAt: number }
  >();
  private static readonly META_TTL_MS = 5 * 60 * 1000;
  private static readonly META_CACHE_MAX_ENTRIES = 1000;

  // Exposed for tests; default implementation queries Postgres.
  protected categoryLookup: (ref: { id?: string; slug?: string }) => Promise<{
    id: string;
    slug: string;
    path: string;
  } | null> = async (ref) => {
    const repo = AppDataSource.getRepository(Category);
    const qb = repo
      .createQueryBuilder("c")
      .select(["c.id", "c.slug", "c.path"])
      .where("c.deleted_at IS NULL")
      .limit(1);
    if (ref.id) qb.andWhere("c.id = :id", { id: ref.id });
    else if (ref.slug) qb.andWhere("c.slug = :slug", { slug: ref.slug });
    const row = await qb.getOne();
    if (!row || !row.path) return null;
    return { id: row.id, slug: row.slug, path: row.path };
  };

  protected async resolveCategory(ref: {
    id?: string;
    slug?: string;
  }): Promise<{ id: string; path: string }> {
    const hasId = !!ref.id;
    const hasSlug = !!ref.slug;
    if (hasId && hasSlug) throw new Error("category_ref_exclusive");
    if (!hasId && !hasSlug) throw new Error("category_ref_required");

    const cacheKey = hasId ? `id:${ref.id}` : `slug:${ref.slug}`;
    const now = Date.now();
    const cached = this.categoryMeta.get(cacheKey);
    if (cached && cached.expiresAt > now) return cached.value;

    const row = await this.categoryLookup(ref);
    if (!row) throw new Error("unknown_category");
    const value = { id: row.id, path: row.path };
    const entry = { value, expiresAt: now + FeedService.META_TTL_MS };
    this.setMetaEntry(`id:${row.id}`, entry);
    this.setMetaEntry(`slug:${row.slug}`, entry);
    return value;
  }

  private setMetaEntry(
    key: string,
    entry: { value: { id: string; path: string }; expiresAt: number },
  ): void {
    if (this.categoryMeta.size >= FeedService.META_CACHE_MAX_ENTRIES) {
      const oldest = this.categoryMeta.keys().next().value;
      if (oldest !== undefined) this.categoryMeta.delete(oldest);
    }
    this.categoryMeta.set(key, entry);
  }

  async getHomeFeed(q: HomeFeedQuery): Promise<FeedResult> {
    if (q.tab === "for_you") return this.getForYouFeed(q);
    if (q.tab === "latest") return this.getLatestFeed(q);
    return this.getFollowingFeed(q);
  }

  private async getForYouFeed(q: HomeFeedQuery): Promise<FeedResult> {
    this.getRepos();
    const cohortKey = `home:for_you:${q.language}:${q.country}`;
    const offset = q.cursor ? Number.parseInt(q.cursor, 10) : 0;
    const candidateIds = await this.cache.getCohort(cohortKey, offset, offset + q.limit * 3);

    // When the cohort cache is empty, fall back to a direct DB query
    if (candidateIds.length === 0) {
      const qb = this.reelRepo
        .createQueryBuilder("r")
        .where("r.status = :status", { status: ReelStatus.approved })
        .andWhere("r.deleted_at IS NULL")
        .orderBy("r.ranking_score", "DESC")
        .addOrderBy("r.published_at", "DESC")
        .limit(q.limit + 1);
      if (q.cursor) qb.andWhere("r.published_at < :cursor", { cursor: new Date(q.cursor) });
      const rows = await qb.getMany();
      const items = rows.slice(0, q.limit);
      return {
        reels: items,
        nextCursor:
          rows.length > q.limit ? items[items.length - 1]!.published_at!.toISOString() : null,
      };
    }

    let unseenIds = candidateIds;
    if (q.userId && candidateIds.length > 0) {
      const seenRows = await this.viewRepo
        .createQueryBuilder("v")
        .select("v.reel_id", "reel_id")
        .where("v.user_id = :uid", { uid: q.userId })
        .andWhere("v.reel_id IN (:...ids)", { ids: candidateIds })
        .getRawMany();
      const seenSet = new Set(seenRows.map((r: any) => r.reel_id));
      unseenIds = candidateIds.filter((id) => !seenSet.has(id));
    }

    const slice = unseenIds.slice(0, q.limit);
    const reels = slice.length > 0 ? await (this.reelRepo as any).findByIds(slice as any) : [];
    const reelMap = new Map((reels as Reel[]).map((r: Reel) => [r.id, r] as const));
    const ordered = slice.map((id) => reelMap.get(id)).filter(Boolean) as Reel[];

    const nextCursor = candidateIds.length > 0 ? String(offset + candidateIds.length) : null;
    return { reels: ordered, nextCursor };
  }

  private async getLatestFeed(q: HomeFeedQuery): Promise<FeedResult> {
    this.getRepos();
    const qb = this.reelRepo
      .createQueryBuilder("r")
      .where("r.status = :status", { status: ReelStatus.approved })
      .andWhere("r.deleted_at IS NULL")
      .andWhere("r.language_code = :lang", { lang: q.language })
      .orderBy("r.published_at", "DESC")
      .limit(q.limit + 1);
    if (q.cursor) qb.andWhere("r.published_at < :cursor", { cursor: new Date(q.cursor) });
    const rows = await qb.getMany();
    const items = rows.slice(0, q.limit);
    const nextCursor =
      rows.length > q.limit ? items[items.length - 1]!.published_at!.toISOString() : null;
    return { reels: items, nextCursor };
  }

  private async getFollowingFeed(q: HomeFeedQuery): Promise<FeedResult> {
    if (!q.userId) return { reels: [], nextCursor: null };
    this.getRepos();
    const followRepo = AppDataSource.getRepository(UserFollow);
    const followees = await followRepo.find({
      where: { follower_id: q.userId },
      select: ["followee_id"],
    });
    const followeeIds = followees.map((f) => f.followee_id);
    if (followeeIds.length === 0) return { reels: [], nextCursor: null };

    const qb = this.reelRepo
      .createQueryBuilder("r")
      .where("r.user_id IN (:...ids)", { ids: followeeIds })
      .andWhere("r.status = :status", { status: ReelStatus.approved })
      .andWhere("r.deleted_at IS NULL")
      .orderBy("r.published_at", "DESC")
      .limit(q.limit + 1);
    if (q.cursor) qb.andWhere("r.published_at < :cursor", { cursor: new Date(q.cursor) });
    const rows = await qb.getMany();
    const items = rows.slice(0, q.limit);
    const nextCursor =
      rows.length > q.limit ? items[items.length - 1]!.published_at!.toISOString() : null;
    return { reels: items, nextCursor };
  }

  async getProductFeed(
    productId: string,
    q: {
      userId: string | null;
      cursor?: string;
      limit: number;
      authorKind?: "creator" | "customer" | "house";
    },
  ): Promise<FeedResult> {
    this.getRepos();
    const cohortKey = `product:${productId}${q.authorKind ? `:${q.authorKind}` : ""}`;
    const offset = q.cursor ? Number.parseInt(q.cursor, 10) : 0;

    // When a filter is applied, skip the precomputed cohort cache (which is
    // keyed on the unfiltered cohort) and go straight to the DB. The
    // idx_reels_author_kind_status_published partial index added in PR #138
    // makes this query cheap.
    if (q.authorKind) {
      const rows = await this.reelRepo
        .createQueryBuilder("r")
        .innerJoin("reel_product_tags", "t", "t.reel_id = r.id")
        .where("t.product_id = :pid", { pid: productId })
        .andWhere("r.status = :status", { status: ReelStatus.approved })
        .andWhere("r.author_kind = :ak", { ak: q.authorKind })
        .andWhere("r.deleted_at IS NULL")
        .orderBy("r.ranking_score", "DESC")
        .offset(offset)
        .limit(q.limit + 1)
        .getMany();
      const items = rows.slice(0, q.limit);
      return {
        reels: items,
        nextCursor: rows.length > q.limit ? String(offset + items.length) : null,
      };
    }

    const candidateIds = await this.cache.getCohort(cohortKey, offset, offset + q.limit * 3);
    if (candidateIds.length === 0) {
      const rows = await this.reelRepo
        .createQueryBuilder("r")
        .innerJoin("reel_product_tags", "t", "t.reel_id = r.id")
        .where("t.product_id = :pid", { pid: productId })
        .andWhere("r.status = :status", { status: ReelStatus.approved })
        .orderBy("r.ranking_score", "DESC")
        .limit(q.limit + 1)
        .getMany();
      const items = rows.slice(0, q.limit);
      return {
        reels: items,
        nextCursor: rows.length > q.limit ? String(items.length) : null,
      };
    }
    return this.dedupAndFetch(candidateIds, q.userId, q.limit, offset, candidateIds.length);
  }

  async getBrandFeed(
    brandId: string,
    q: { userId: string | null; cursor?: string; limit: number },
  ): Promise<FeedResult> {
    return this.scopedFeed("brand", brandId, q);
  }

  async getVendorFeed(
    vendorId: string,
    q: { userId: string | null; cursor?: string; limit: number },
  ): Promise<FeedResult> {
    return this.scopedFeed("vendor", vendorId, q);
  }

  private async scopedFeed(
    scope: "brand" | "vendor",
    targetId: string,
    q: { userId: string | null; cursor?: string; limit: number },
  ): Promise<FeedResult> {
    this.getRepos();
    const cohortKey = `${scope}:${targetId}`;
    const offset = q.cursor ? Number.parseInt(q.cursor, 10) : 0;
    const candidateIds = await this.cache.getCohort(cohortKey, offset, offset + q.limit * 3);
    if (candidateIds.length === 0) {
      const joinCol = scope === "brand" ? "p.brand_id" : "p.vendor_id";
      const rows = await this.reelRepo
        .createQueryBuilder("r")
        .innerJoin("reel_product_tags", "t", "t.reel_id = r.id")
        .innerJoin("products", "p", "p.id = t.product_id")
        .where(`${joinCol} = :tid`, { tid: targetId })
        .andWhere("r.status = :status", { status: ReelStatus.approved })
        .orderBy("r.ranking_score", "DESC")
        .limit(q.limit + 1)
        .getMany();
      const items = rows.slice(0, q.limit);
      return {
        reels: items,
        nextCursor: rows.length > q.limit ? String(items.length) : null,
      };
    }
    return this.dedupAndFetch(candidateIds, q.userId, q.limit, offset, candidateIds.length);
  }

  async getUserFeed(userId: string, q: { cursor?: string; limit: number }): Promise<FeedResult> {
    this.getRepos();
    const qb = this.reelRepo
      .createQueryBuilder("r")
      .where("r.user_id = :uid", { uid: userId })
      .andWhere("r.status = :status", { status: ReelStatus.approved })
      .andWhere("r.deleted_at IS NULL")
      .orderBy("r.published_at", "DESC")
      .limit(q.limit + 1);
    if (q.cursor) qb.andWhere("r.published_at < :c", { c: new Date(q.cursor) });
    const rows = await qb.getMany();
    const items = rows.slice(0, q.limit);
    const nextCursor =
      rows.length > q.limit ? items[items.length - 1]!.published_at!.toISOString() : null;
    return { reels: items, nextCursor };
  }

  async getCategoryFeed(
    categoryRef: { id?: string; slug?: string },
    q: {
      userId: string | null;
      cursor?: string;
      limit: number;
      language: string;
      country: string;
    },
  ): Promise<FeedResult> {
    this.getRepos();
    const { id, path } = await this.resolveCategory(categoryRef);
    const cohortKey = `category:${id}:${q.language}:${q.country}`;
    const offset = q.cursor ? Number.parseInt(q.cursor, 10) : 0;
    const candidateIds = await this.cache.getCohort(cohortKey, offset, offset + q.limit * 3);

    if (candidateIds.length === 0) {
      return this.liveCategoryQuery(path, q);
    }
    return this.dedupAndFetch(candidateIds, q.userId, q.limit, offset, candidateIds.length);
  }

  protected async liveCategoryQuery(
    path: string,
    q: {
      userId: string | null;
      limit: number;
      language: string;
      country: string;
      cursor?: string;
    },
  ): Promise<FeedResult> {
    this.getRepos();
    const offset = q.cursor ? Number.parseInt(q.cursor, 10) : 0;
    const qb = this.reelRepo
      .createQueryBuilder("r")
      .innerJoin("reel_product_tags", "t", "t.reel_id = r.id")
      .innerJoin("products", "p", "p.id = t.product_id AND p.deleted_at IS NULL")
      .innerJoin("categories", "c", "c.id = p.category_id AND c.deleted_at IS NULL")
      .where("r.status = :status", { status: ReelStatus.approved })
      .andWhere("r.deleted_at IS NULL")
      .andWhere("r.language_code = :lang", { lang: q.language })
      .andWhere("c.path LIKE :path", { path: `${path}%` })
      .groupBy("r.id")
      .orderBy("MAX(r.ranking_score)", "DESC")
      .limit(q.limit + 1);
    if (q.cursor) qb.offset(offset);
    const rows = await qb.getMany();
    const items = rows.slice(0, q.limit);
    const nextCursor = rows.length > q.limit ? String(offset + items.length) : null;
    return { reels: items, nextCursor };
  }

  private async dedupAndFetch(
    candidateIds: string[],
    userId: string | null,
    limit: number,
    offset: number,
    cohortLen: number,
  ): Promise<FeedResult> {
    this.getRepos();
    let unseenIds = candidateIds;
    if (userId && candidateIds.length > 0) {
      const seenRows = await this.viewRepo
        .createQueryBuilder("v")
        .select("v.reel_id", "reel_id")
        .where("v.user_id = :uid", { uid: userId })
        .andWhere("v.reel_id IN (:...ids)", { ids: candidateIds })
        .getRawMany();
      const seenSet = new Set(seenRows.map((r: any) => r.reel_id));
      unseenIds = candidateIds.filter((id) => !seenSet.has(id));
    }
    const slice = unseenIds.slice(0, limit);
    const reels = slice.length > 0 ? await (this.reelRepo as any).findByIds(slice as any) : [];
    const reelMap = new Map((reels as Reel[]).map((r: Reel) => [r.id, r] as const));
    const ordered = slice.map((id) => reelMap.get(id)).filter(Boolean) as Reel[];
    return {
      reels: ordered,
      nextCursor: cohortLen > 0 ? String(offset + cohortLen) : null,
    };
  }
}
