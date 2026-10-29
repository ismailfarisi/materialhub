import { describe, expect, test } from "bun:test";
import { config } from "@materialhub/config";
import jwt from "jsonwebtoken";

import { BidService } from "./bid.service.ts";

describe("BidService.issuePreviewToken", () => {
  test("signs a JWT containing bid_id, requestor and 5min expiry", async () => {
    const service = new BidService();
    // Stub: replace repos with in-memory fakes for unit test.
    (service as any)._repo = {
      findOne: async () => ({
        id: "11111111-1111-1111-1111-111111111111",
        section_id: "22222222-2222-2222-2222-222222222222",
        vendor_id: "33333333-3333-3333-3333-333333333333",
      }),
    };
    (service as any)._sectionRepo = {
      findOne: async () => ({
        id: "22222222-2222-2222-2222-222222222222",
        version_id: "44444444-4444-4444-4444-444444444444",
      }),
    };
    (service as any)._layoutRepo = {
      findOne: async () => ({ slug: "beauty-fragrance" }),
    };

    const result = await service.issuePreviewToken("11111111-1111-1111-1111-111111111111", {
      requestor: "admin",
    });

    expect(result.layout_slug).toBe("beauty-fragrance");
    expect(typeof result.token).toBe("string");
    const payload = jwt.verify(result.token, config.jwt.accessSecret) as Record<string, unknown>;
    expect(payload.bid_id).toBe("11111111-1111-1111-1111-111111111111");
    expect(payload.requestor).toBe("admin");
    expect(payload.aud).toBe("preview");
    expect(typeof payload.exp).toBe("number");
    const expiresInSec = (payload.exp as number) - Math.floor(Date.now() / 1000);
    expect(expiresInSec).toBeLessThanOrEqual(300);
    expect(expiresInSec).toBeGreaterThan(290);
  });

  test("rejects when bid does not exist", async () => {
    const service = new BidService();
    (service as any)._repo = { findOne: async () => null };
    await expect(
      service.issuePreviewToken("00000000-0000-0000-0000-000000000000", { requestor: "admin" }),
    ).rejects.toThrow(/not found/i);
  });

  test("rejects vendor request when bid belongs to another vendor", async () => {
    const service = new BidService();
    (service as any)._repo = {
      findOne: async () => ({
        id: "11111111-1111-1111-1111-111111111111",
        vendor_id: "owner-vendor",
        section_id: "22222222-2222-2222-2222-222222222222",
      }),
    };
    await expect(
      service.issuePreviewToken("11111111-1111-1111-1111-111111111111", {
        requestor: "vendor",
        vendor_id: "different-vendor",
      }),
    ).rejects.toThrow(/forbidden|not found/i);
  });
});

describe("BidService.listAll enrichment", () => {
  test("attaches vendor + section context to each bid", async () => {
    const service = new BidService();
    const bids = [
      {
        id: "b1",
        vendor_id: "v1",
        section_id: "s1",
        bid_amount_fils: 50000,
        starts_at: new Date("2026-04-24"),
        expires_at: new Date("2026-04-30"),
        status: "pending",
      },
    ];
    (service as any)._repo = {
      findAndCount: async () => [bids, 1],
    };
    (service as any).vendorLookup = async () => ({
      id: "v1",
      name: "Acme Beauty",
      business_name: "Acme Trading LLC",
      slug: "acme-beauty",
      logo_url: "https://cdn/acme.png",
    });
    (service as any).sectionContextLookup = async () => ({
      id: "s1",
      position: 3,
      type_name: "promotional_banner",
      type_label: { en: "Promotional Banner" },
      layout_slug: "beauty-fragrance",
      layout_title: { en: "Homepage" },
      slots: 2,
    });
    (service as any).computeOutranked = async () => ({
      is_outranked: false,
      slots: 2,
    });

    const result = await service.listAll({});
    const bid = result.data[0] as any;
    expect(result.total).toBe(1);
    expect(bid.vendor.name).toBe("Acme Beauty");
    expect(bid.section.layout_slug).toBe("beauty-fragrance");
    expect(bid.section.position).toBe(3);
    expect(bid.outranked.is_outranked).toBe(false);
  });
});

describe("BidService.availableSections enrichment", () => {
  test("includes layout_slug, layout_title, position", async () => {
    const service = new BidService();
    (service as any)._sectionRepo = {
      find: async () => [
        {
          id: "s1",
          bid_config: { slots: 2, min_bid_fils: 1000 },
          position: 3,
          section_type: { name: "promotional_banner", label: { en: "Promotional Banner" } },
          version_id: "v1",
          settings: { title: { en: "Homepage Hero" } },
        },
      ],
    };
    (service as any)._repo = {
      createQueryBuilder: () => ({
        select: () => ({
          addSelect: () => ({
            where: () => ({
              andWhere: () => ({
                getRawOne: async () => ({ highest_bid_fils: "5000", total_bids: "2" }),
              }),
            }),
          }),
        }),
      }),
    };
    (service as any).sectionContextLookup = async () => ({
      id: "s1",
      position: 3,
      type_name: "promotional_banner",
      type_label: { en: "Promotional Banner" },
      layout_slug: "beauty-fragrance",
      layout_title: { en: "Homepage" },
      slots: 2,
    });

    const result: any[] = await service.availableSections();
    expect(result[0].layout_slug).toBe("beauty-fragrance");
    expect(result[0].layout_title?.en).toBe("Homepage");
    expect(result[0].position).toBe(3);
  });
});

describe("BidService.computeOutranked", () => {
  test("ranks bid below cutoff when slots=1 and another bid is higher with overlapping window", async () => {
    const service = new BidService();
    const target = {
      id: "b-low",
      section_id: "s1",
      vendor_id: "v-low",
      bid_amount_fils: 10000,
      starts_at: new Date("2026-04-27"),
      expires_at: new Date("2026-04-30"),
      status: "pending" as const,
    };
    (service as any).fetchSectionSlots = async () => 1;
    (service as any).fetchOverlappingBids = async () => [
      { id: "b-high", vendor_id: "v-high", bid_amount_fils: 30000 },
      { id: "b-low", vendor_id: "v-low", bid_amount_fils: 10000 },
    ];
    (service as any).vendorNameLookup = async (id: string) =>
      id === "v-high" ? "Acme Beauty" : "Other Vendor";

    const result = await (service as any).computeOutranked(target);
    expect(result.is_outranked).toBe(true);
    expect(result.cutoff_bid_amount_fils).toBe(30000);
    expect(result.cutoff_vendor_name).toBe("Acme Beauty");
    expect(result.slots).toBe(1);
  });

  test("not outranked when bid is among top-N by amount", async () => {
    const service = new BidService();
    const target = {
      id: "b1",
      section_id: "s1",
      vendor_id: "v1",
      bid_amount_fils: 30000,
      starts_at: new Date("2026-04-27"),
      expires_at: new Date("2026-04-30"),
      status: "won" as const,
    };
    (service as any).fetchSectionSlots = async () => 2;
    (service as any).fetchOverlappingBids = async () => [
      { id: "b1", vendor_id: "v1", bid_amount_fils: 30000 },
      { id: "b2", vendor_id: "v2", bid_amount_fils: 20000 },
    ];
    const result = await (service as any).computeOutranked(target);
    expect(result.is_outranked).toBe(false);
    expect(result.slots).toBe(2);
  });

  test("returns null for terminal-state bids (lost/cancelled/expired)", async () => {
    const service = new BidService();
    const target = {
      id: "b1",
      status: "lost" as const,
      section_id: "s1",
      vendor_id: "v1",
      bid_amount_fils: 1,
      starts_at: new Date(),
      expires_at: new Date(),
    };
    const result = await (service as any).computeOutranked(target);
    expect(result).toBeNull();
  });
});

describe("BidService.cancelBidsForLayout / cancelBidsForSection", () => {
  test("cancelBidsForLayout issues UPDATE with correct status filter and reason", async () => {
    const service = new BidService();
    let captured: { sql: string; params: unknown[] } | null = null;
    const em = {
      query: async (sql: string, params: unknown[]) => {
        captured = { sql, params };
        return [];
      },
    } as any;
    await service.cancelBidsForLayout(em, "layout-123");
    expect(captured!.sql).toMatch(/UPDATE section_bids/);
    expect(captured!.sql).toMatch(/cancellation_reason\s*=\s*'layout_retired'/);
    expect(captured!.sql).toMatch(/status\s+IN\s+\('pending',\s*'active',\s*'won'\)/);
    expect(captured!.params).toEqual(["layout-123"]);
  });

  test("cancelBidsForSection uses section_removed reason and section filter", async () => {
    const service = new BidService();
    let captured: { sql: string; params: unknown[] } | null = null;
    const em = {
      query: async (sql: string, params: unknown[]) => {
        captured = { sql, params };
        return [];
      },
    } as any;
    await service.cancelBidsForSection(em, "section-abc");
    expect(captured!.sql).toMatch(/cancellation_reason\s*=\s*'section_removed'/);
    expect(captured!.sql).toMatch(/section_id\s*=\s*\$1/);
    expect(captured!.params).toEqual(["section-abc"]);
  });
});
