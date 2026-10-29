import { config } from "@materialhub/config";
import {
  AppDataSource,
  BidStatus,
  LayoutSection,
  PageLayout,
  SectionBid,
  SourceMode,
  Vendor,
} from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";
import { In, IsNull } from "typeorm";

interface ResolvedSection {
  id: string;
  type: string;
  position: number;
  settings: Record<string, unknown>;
  source_mode: string;
  /**
   * Slug of the collection backing a `query`/`collection` section, when there
   * is one. The rest of `data_source` stays server-side (it carries internal
   * service query shapes); the storefront only needs this to link "View all"
   * at the collection the section was drawn from.
   */
  collection_slug?: string;
  data: { blocks?: unknown[]; items?: unknown[] };
}

/** Reads the collection slug out of a section's data_source, if it has one. */
function collectionSlugOf(dataSource: Record<string, unknown> | null): string | undefined {
  if (!dataSource) return undefined;
  const { type, query } = dataSource as { type?: string; query?: Record<string, unknown> };
  if (type !== "collection") return undefined;
  const slug = query?.collection_slug;
  return typeof slug === "string" && slug.trim() ? slug.trim() : undefined;
}

interface VendorContext {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  banner_url: string | null;
}

export class LayoutResolverService {
  private _layoutRepo?: ReturnType<typeof AppDataSource.getRepository<PageLayout>>;
  private get layoutRepo() {
    return this._layoutRepo ?? AppDataSource.getRepository(PageLayout);
  }
  private _sectionRepo?: ReturnType<typeof AppDataSource.getRepository<LayoutSection>>;
  private get sectionRepo() {
    return this._sectionRepo ?? AppDataSource.getRepository(LayoutSection);
  }
  private _bidRepo?: ReturnType<typeof AppDataSource.getRepository<SectionBid>>;
  private get bidRepo() {
    return this._bidRepo ?? AppDataSource.getRepository(SectionBid);
  }
  private _vendorRepo?: ReturnType<typeof AppDataSource.getRepository<Vendor>>;
  private get vendorRepo() {
    return this._vendorRepo ?? AppDataSource.getRepository(Vendor);
  }

  private async loadVendorContext(vendorId: string): Promise<VendorContext | null> {
    const v = await this.vendorRepo.findOne({
      where: { id: vendorId },
      select: ["id", "slug", "name", "logo_url", "banner_url"],
    });
    if (!v) return null;
    return { id: v.id, slug: v.slug, name: v.name, logo_url: v.logo_url, banner_url: v.banner_url };
  }

  async resolve(
    slug: string,
    locale: string,
    device: string,
    previewBidId?: string,
    contextVendorId?: string,
    previewLayoutId?: string,
  ): Promise<{
    id: string;
    slug: string;
    version: number;
    resolved_at: string;
    ttl: number;
    sections: ResolvedSection[];
    owner?: "vendor" | "admin_template";
    vendor_context?: VendorContext;
  }> {
    let layout: PageLayout | null = null;
    let owner: "vendor" | "admin_template" | undefined;
    let vendorContext: VendorContext | undefined;

    // Draft preview short-circuit: caller has a signed token authorizing them
    // to see the unpublished draft of a specific layout. Resolve directly by
    // id and use draft_version_id below. context_vendor_id is still honored
    // for vendor_context hydration so the storefront chrome looks right.
    if (previewLayoutId) {
      layout = await this.layoutRepo.findOne({
        where: { id: previewLayoutId },
        relations: ["draft_version"],
      });
      if (!layout || layout.slug !== slug) {
        throw new HttpError(404, "Preview layout not found", "PREVIEW_LAYOUT_NOT_FOUND");
      }
      if (!layout.draft_version_id) {
        throw new HttpError(400, "Layout has no draft to preview", "NO_DRAFT");
      }
      if (contextVendorId) {
        vendorContext = (await this.loadVendorContext(contextVendorId)) ?? undefined;
        owner = layout.vendor_id ? "vendor" : "admin_template";
      }
    } else if (contextVendorId) {
      // Verify vendor exists FIRST — short-circuits two layout lookups for nonexistent vendors,
      // and ensures "vendor exists but no layout published" surfaces as LAYOUT_NOT_PUBLISHED
      // (not the misleading VENDOR_NOT_FOUND) at the layout-check below.
      vendorContext = (await this.loadVendorContext(contextVendorId)) ?? undefined;
      if (!vendorContext) {
        throw new HttpError(404, "Vendor not found", "VENDOR_NOT_FOUND");
      }

      // Try vendor-owned layout
      layout = await this.layoutRepo.findOne({
        where: { vendor_id: contextVendorId, slug },
        relations: ["published_version"],
      });
      if (layout?.published_version_id) {
        owner = "vendor";
      } else {
        layout = null;
      }

      if (!layout) {
        // Fallback to admin template
        layout = await this.layoutRepo.findOne({
          where: { vendor_id: IsNull(), slug: "vendor-default" },
          relations: ["published_version"],
        });
        if (layout?.published_version_id) {
          owner = "admin_template";
        }
      }
    } else {
      // Existing platform-page lookup
      layout = await this.layoutRepo.findOne({
        where: { slug, vendor_id: IsNull() },
        relations: ["published_version"],
      });
    }

    if (!layout) {
      throw new HttpError(404, "Published layout not found", "LAYOUT_NOT_PUBLISHED");
    }
    const versionId = previewLayoutId ? layout.draft_version_id : layout.published_version_id;
    if (!versionId) {
      throw new HttpError(404, "Published layout not found", "LAYOUT_NOT_PUBLISHED");
    }

    const allSections = await this.sectionRepo.find({
      where: { version_id: versionId, enabled: true },
      relations: ["section_type"],
      order: { position: "ASC" },
    });

    // Filter by device, targeting, AND scope
    const filtered = allSections.filter((s) => {
      const vis = s.visibility as { mobile?: boolean; web?: boolean };
      if (device === "mobile" && vis.mobile === false) return false;
      if (device === "web" && vis.web === false) return false;
      if (s.targeting) {
        const t = s.targeting as { locales?: string[] };
        if (t.locales?.length && !t.locales.includes(locale)) return false;
      }
      // Scope filter: when on a vendor page, drop platform-only sections.
      // (When NOT on a vendor page, drop vendor-only sections.)
      const sectionScope = s.section_type.scope ?? "platform";
      if (contextVendorId && sectionScope === "platform") return false;
      if (!contextVendorId && sectionScope === "vendor") return false;
      return true;
    });

    const resolvedSections: ResolvedSection[] = [];
    for (const section of filtered) {
      const resolved = await this.resolveSection(section, previewBidId, contextVendorId);
      resolvedSections.push(resolved);
    }

    const versionNumber = previewLayoutId
      ? (layout.draft_version?.version_number ?? 0)
      : layout.published_version!.version_number;

    return {
      id: layout.id,
      slug: layout.slug,
      version: versionNumber,
      resolved_at: new Date().toISOString(),
      ttl: previewLayoutId ? 0 : 300,
      sections: resolvedSections,
      ...(contextVendorId ? { owner, vendor_context: vendorContext } : {}),
    };
  }

  private async resolveSection(
    section: LayoutSection,
    previewBidId?: string,
    contextVendorId?: string,
  ): Promise<ResolvedSection> {
    const base: ResolvedSection = {
      id: section.id,
      type: section.section_type.name,
      position: section.position,
      settings: section.settings,
      source_mode: section.source_mode,
      data: {},
    };

    const collectionSlug = collectionSlugOf(section.data_source);
    if (collectionSlug) base.collection_slug = collectionSlug;

    switch (section.source_mode) {
      case SourceMode.manual:
        base.data = { blocks: section.blocks || [] };
        break;

      case SourceMode.query:
        base.data = { items: await this.resolveQuery(section.data_source, contextVendorId) };
        break;

      case SourceMode.bidded:
        base.data = { items: await this.resolveBidded(section, previewBidId) };
        break;
    }

    return base;
  }

  private async resolveQuery(
    dataSource: Record<string, unknown> | null,
    contextVendorId?: string,
  ): Promise<unknown[]> {
    if (!dataSource) return [];

    const { type, query } = dataSource as { type: string; query: Record<string, unknown> };
    const safeQuery = query || {};

    // Vendor-page query allowlist: only types that semantically scope to a single vendor.
    // The map value is the QUERY-PARAM NAME the upstream service expects — naming differs:
    //   /products            → vendorId       (camelCase, postgres-search.adapter)
    //   /products/flash-deals → vendor_id     (snake_case)
    //   /reels/feed          → vendorId       (camelCase)
    //   /categories/tree     → vendor_id      (snake_case, see category.service.ts)
    // `vendors` (other-vendor lists) and `brands` are intentionally excluded — they have
    // no meaningful vendor-scope and would produce confusing or empty results.
    // When adding a new query type to `serviceMap` below, decide whether it belongs here
    // and confirm the param-name convention of the upstream endpoint.
    const VENDOR_SCOPE_PARAM: Record<string, string | null> = {
      products: "vendorId",
      flash_deals: "vendor_id",
      reels: "vendorId",
      categories: "vendor_id",
      collection: null,
    };
    const vendorScopeParam = contextVendorId ? VENDOR_SCOPE_PARAM[type] : undefined;
    if (contextVendorId && !(type in VENDOR_SCOPE_PARAM)) {
      return [];
    }

    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(safeQuery)) {
      if (type === "collection" && k === "collection_slug") continue;
      params.set(k, String(v));
    }
    if (type === "collection" && safeQuery.limit != null) {
      params.set("perPage", String(safeQuery.limit));
      params.delete("limit");
    }
    if (contextVendorId && vendorScopeParam) {
      params.set(vendorScopeParam, contextVendorId);
    }

    const productHost = config.serviceHost.product;
    const vendorHost = config.serviceHost.vendor;
    const reelsHost = config.serviceHost.reels;
    const collectionSlug =
      typeof safeQuery.collection_slug === "string" ? safeQuery.collection_slug.trim() : "";
    const serviceMap: Record<string, string> = {
      products: `http://${productHost}:${config.port.product}/products`,
      categories: `http://${productHost}:${config.port.product}/categories/tree`,
      vendors: `http://${vendorHost}:${config.port.vendor}/vendors`,
      brands: `http://${productHost}:${config.port.product}/brands`,
      brand_spotlight: `http://${productHost}:${config.port.product}/brands/spotlight`,
      flash_deals: `http://${productHost}:${config.port.product}/products/flash-deals`,
      reels: `http://${reelsHost}:${config.port.reels}/reels/feed`,
      ...(collectionSlug
        ? {
            collection: `http://${productHost}:${config.port.product}/collections/${encodeURIComponent(collectionSlug)}`,
          }
        : {}),
    };

    const baseUrl = serviceMap[type];
    if (!baseUrl) return [];

    try {
      const res = await fetch(`${baseUrl}?${params.toString()}`);
      if (!res.ok) return [];
      const json = (await res.json()) as any;
      if (type === "collection") {
        const items = json.data?.items ?? [];
        return Array.isArray(items) ? items : [];
      }
      const items = json.data?.data ?? json.data ?? [];
      return Array.isArray(items) ? items : [];
    } catch {
      return [];
    }
  }

  private async resolveBidded(section: LayoutSection, previewBidId?: string): Promise<unknown[]> {
    const bidConfig = section.bid_config as {
      slots?: number;
      fallback_query?: Record<string, unknown>;
    } | null;
    const maxSlots = bidConfig?.slots ?? 4;

    const now = new Date();
    const winningBids = await this.bidRepo
      .createQueryBuilder("b")
      .where("b.section_id = :sectionId", { sectionId: section.id })
      .andWhere("b.status = :status", { status: BidStatus.won })
      .andWhere("b.starts_at <= :now", { now })
      .andWhere("b.expires_at >= :now", { now })
      .orderBy("b.bid_amount_fils", "DESC")
      .take(maxSlots)
      .getMany();

    let sponsoredItems: unknown[] = winningBids.map((bid) => ({
      ...(bid.content || {}),
      id: bid.vendor_id,
      sponsored: true,
      bid_id: bid.id,
      product_id: bid.product_id,
    }));

    if (previewBidId) {
      const previewBid = await this.bidRepo.findOne({ where: { id: previewBidId } });
      if (previewBid && previewBid.section_id === section.id) {
        const previewItem = {
          ...(previewBid.content || {}),
          id: previewBid.vendor_id,
          sponsored: true,
          preview: true,
          bid_id: previewBid.id,
          product_id: previewBid.product_id,
        };
        // Drop any existing item with same bid_id (in case the preview bid is already won),
        // then unshift to top, trim to maxSlots.
        sponsoredItems = sponsoredItems.filter((it) => (it as any).bid_id !== previewBid.id);
        sponsoredItems.unshift(previewItem);
        sponsoredItems = sponsoredItems.slice(0, maxSlots);
      }
    }

    if (section.section_type?.name === "vendor_showcase" && sponsoredItems.length) {
      sponsoredItems = await this.hydrateVendorShowcaseItems(sponsoredItems);
    } else if (section.section_type?.name === "product_carousel" && sponsoredItems.length) {
      sponsoredItems = await this.hydrateProductCarouselItems(sponsoredItems);
    }

    const remaining = maxSlots - sponsoredItems.length;
    if (remaining > 0 && bidConfig?.fallback_query) {
      const fallbackItems = await this.resolveQuery({
        ...bidConfig.fallback_query,
        query: { ...(bidConfig.fallback_query as any).query, limit: remaining },
      });
      return [...sponsoredItems, ...fallbackItems];
    }

    return sponsoredItems;
  }

  private async hydrateProductCarouselItems(items: unknown[]): Promise<unknown[]> {
    const productIds = Array.from(
      new Set(
        items
          .map((it) => (it as { product_id?: string }).product_id)
          .filter((id): id is string => !!id),
      ),
    );
    if (!productIds.length) return [];

    const productHost = config.serviceHost.product;
    const url = `http://${productHost}:${config.port.product}/products?ids=${productIds.join(",")}&limit=${productIds.length}`;
    let products: any[] = [];
    try {
      const res = await fetch(url);
      if (!res.ok) return [];
      const json = (await res.json()) as any;
      products = json.data?.data ?? json.data ?? [];
    } catch {
      return [];
    }

    const productMap = new Map<string, any>(products.map((p: any) => [p.id, p]));
    return items.flatMap((it) => {
      const item = it as { product_id?: string; bid_id?: string; sponsored?: boolean };
      const product = item.product_id ? productMap.get(item.product_id) : null;
      if (!product) return [];
      return [
        {
          ...product,
          sponsored: item.sponsored,
          bid_id: item.bid_id,
          product_id: item.product_id,
        },
      ];
    });
  }

  private async hydrateVendorShowcaseItems(items: unknown[]): Promise<unknown[]> {
    const vendorIds = Array.from(
      new Set(items.map((it) => (it as { id?: string }).id).filter((id): id is string => !!id)),
    );
    if (!vendorIds.length) return [];
    const vendors = await this.vendorRepo.find({
      where: { id: In(vendorIds) },
      select: ["id", "slug", "name", "logo_url", "rating_avg", "total_orders", "follower_count"],
    });
    const vendorMap = new Map(vendors.map((v) => [v.id, v]));
    return items.flatMap((it) => {
      const v = vendorMap.get((it as { id: string }).id);
      if (!v) return [];
      return [
        {
          ...(it as object),
          slug: v.slug,
          name: v.name,
          logo_url: v.logo_url,
          rating_avg: v.rating_avg,
          total_orders: v.total_orders,
          follower_count: v.follower_count,
        },
      ];
    });
  }
}
