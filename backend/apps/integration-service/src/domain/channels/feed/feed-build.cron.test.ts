import { describe, expect, it, mock } from "bun:test";
import type {
  ChannelCategoryMapping,
  ChannelFeedRun,
  ChannelListing,
  SalesChannel,
  SalesChannelCode,
} from "@materialhub/database";
import type { Queue } from "bullmq";
import type { Repository } from "typeorm";
import { feedItemsToGoogleRss } from "../serializers/google.serializer.ts";
import type { FeedBuildDeps } from "./feed-build.cron.ts";
import { handleFeedBuildJob, scheduleFeedBuildCron } from "./feed-build.cron.ts";
import type { FeedBuilderService } from "./feed-builder.service.ts";
import type { FeedItem } from "./feed-item.ts";
import type { FeedUploaderService } from "./feed-uploader.service.ts";

// ─── Helpers ────────────────────────────────────────────────────────────────

const baseItem = (overrides: Partial<FeedItem> = {}): FeedItem => ({
  offer_id: "prod-1",
  item_group_id: null,
  title: "Rose Eau de Parfum",
  description: "A floral fragrance.",
  link: "https://www.materialhubuae.com/en/product/rose-edp",
  image_link: "https://cdn.materialhubuae.com/p/1/a.jpg",
  additional_image_links: [],
  availability: "in_stock",
  price_fils: 12000,
  sale_price_fils: null,
  currency: "AED",
  brand: null,
  gtin: null,
  mpn: null,
  condition: "new",
  google_product_category: null,
  product_type: null,
  country_of_origin: null,
  identifier_exists: false,
  ...overrides,
});

const makeChannel = (overrides: Partial<SalesChannel> = {}): SalesChannel =>
  ({
    id: "channel-1",
    code: "google_merchant" as SalesChannelCode,
    display_name: "Google Merchant Center",
    is_enabled: true,
    credentials_encrypted: null,
    config: {},
    feed_url: null,
    feed_format: "xml",
    delta_enabled: true,
    last_full_feed_at: null,
    last_full_feed_status: null,
    last_delta_success_at: null,
    degraded_until: null,
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
    ...overrides,
  }) as unknown as SalesChannel;

interface InMemoryDeps {
  deps: FeedBuildDeps;
  state: {
    channelSaves: SalesChannel[];
    runSaves: ChannelFeedRun[];
    listingSaves: ChannelListing[];
    softDeletes: string[];
    uploadCalls: Array<{ channelCode: string; format: string; body: string }>;
    existingListings: ChannelListing[];
  };
  setBuildResult: (result: Awaited<ReturnType<FeedBuilderService["build"]>>) => void;
  setUploadImpl: (
    impl: (args: {
      channelCode: string;
      format: "xml" | "csv";
      body: string;
    }) => Promise<{ url: string; key: string; bytes: number }>,
  ) => void;
}

function makeDeps(opts: {
  channel: SalesChannel | null;
  existingListings?: ChannelListing[];
  initialBuildResult?: Awaited<ReturnType<FeedBuilderService["build"]>>;
}): InMemoryDeps {
  const state: InMemoryDeps["state"] = {
    channelSaves: [],
    runSaves: [],
    listingSaves: [],
    softDeletes: [],
    uploadCalls: [],
    existingListings: opts.existingListings ?? [],
  };

  let buildResult: Awaited<ReturnType<FeedBuilderService["build"]>> = opts.initialBuildResult ?? {
    items: [],
    itemCount: 0,
    excludedCount: 0,
    skippedCount: 0,
  };

  let uploadImpl: (args: {
    channelCode: string;
    format: "xml" | "csv";
    body: string;
  }) => Promise<{ url: string; key: string; bytes: number }> = (args) =>
    Promise.resolve({
      url: `https://feeds.materialhubuae.com/${args.channelCode}/feed.${args.format}`,
      key: `${args.channelCode}/feed.${args.format}`,
      bytes: Buffer.byteLength(args.body, "utf8"),
    });

  const channel = opts.channel;

  const salesChannelRepo = {
    findOne: mock((_args: unknown) => Promise.resolve(channel)),
    save: mock((row: SalesChannel) => {
      state.channelSaves.push(row);
      return Promise.resolve(row);
    }),
  } as unknown as Repository<SalesChannel>;

  const channelFeedRunRepo = {
    create: mock(
      (input: Partial<ChannelFeedRun>): ChannelFeedRun =>
        ({
          id: `run-${state.runSaves.length + 1}`,
          ...input,
        }) as ChannelFeedRun,
    ),
    save: mock((row: ChannelFeedRun) => {
      state.runSaves.push({ ...row });
      return Promise.resolve(row);
    }),
  } as unknown as Repository<ChannelFeedRun>;

  const channelCategoryMapRepo = {
    find: mock((_args: unknown) => Promise.resolve([] as ChannelCategoryMapping[])),
  } as unknown as Repository<ChannelCategoryMapping>;

  const channelListingRepo = {
    find: mock((args: { where?: { excluded?: boolean } }) => {
      const excluded = args?.where?.excluded;
      if (excluded === true) {
        return Promise.resolve(
          state.existingListings.filter(
            (r) => (r as ChannelListing & { excluded?: boolean }).excluded === true,
          ),
        );
      }
      if (excluded === false) {
        return Promise.resolve(
          state.existingListings.filter(
            (r) => (r as ChannelListing & { excluded?: boolean }).excluded !== true,
          ),
        );
      }
      return Promise.resolve(state.existingListings);
    }),
    create: mock(
      (input: Partial<ChannelListing>): ChannelListing =>
        ({
          id: `listing-${state.listingSaves.length + state.existingListings.length + 1}`,
          ...input,
        }) as ChannelListing,
    ),
    save: mock((row: ChannelListing) => {
      state.listingSaves.push({ ...row });
      return Promise.resolve(row);
    }),
    softDelete: mock((id: string) => {
      state.softDeletes.push(id);
      return Promise.resolve({ affected: 1 } as unknown);
    }),
  } as unknown as Repository<ChannelListing>;

  const feedBuilderService = {
    build: mock((_channel: SalesChannel, _categoryMap: unknown, _excluded: unknown) =>
      Promise.resolve(buildResult),
    ),
  } as unknown as FeedBuilderService;

  const feedUploader = {
    upload: mock((args: { channelCode: string; format: "xml" | "csv"; body: string }) => {
      state.uploadCalls.push({
        channelCode: args.channelCode,
        format: args.format,
        body: args.body,
      });
      return uploadImpl(args);
    }),
  } as unknown as FeedUploaderService;

  return {
    state,
    deps: {
      salesChannelRepo,
      channelListingRepo,
      channelFeedRunRepo,
      channelCategoryMapRepo,
      feedBuilderService,
      feedUploader,
      webBaseUrl: "https://www.materialhubuae.com",
    },
    setBuildResult: (r) => {
      buildResult = r;
    },
    setUploadImpl: (impl) => {
      uploadImpl = impl;
    },
  };
}

const listingRow = (offerId: string, overrides: Partial<ChannelListing> = {}): ChannelListing =>
  ({
    id: `seed-${offerId}`,
    channel_id: "channel-1",
    product_id: offerId,
    variant_id: null,
    offer_id: offerId,
    sync_status: "synced",
    review_status: "pending",
    disapproval_reasons: null,
    content_hash: null,
    excluded: false,
    exclusion_reason: null,
    last_synced_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
    ...overrides,
  }) as unknown as ChannelListing;

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("handleFeedBuildJob — enabled-channel happy path", () => {
  it("writes a success run row, uploads the serialized XML, and updates the channel feed_url", async () => {
    const channel = makeChannel({ is_enabled: true });
    const items = [
      baseItem({ offer_id: "prod-1" }),
      baseItem({ offer_id: "prod-2", title: "Other" }),
    ];
    const harness = makeDeps({
      channel,
      initialBuildResult: {
        items,
        itemCount: items.length,
        excludedCount: 3,
        skippedCount: 1,
      },
    });

    const result = await handleFeedBuildJob(
      { channelCode: channel.code, trigger: "cron" },
      harness.deps,
    );

    expect(result.status).toBe("success");
    expect(result.runId).toBeDefined();

    // Run rows: at least an initial "running" insert and a final "success" save.
    const finalRun = harness.state.runSaves[harness.state.runSaves.length - 1];
    expect(finalRun?.status).toBe("success");
    expect(finalRun?.item_count).toBe(2);
    expect(finalRun?.excluded_count).toBe(3);
    expect(finalRun?.error_count).toBe(1);
    expect(finalRun?.file_url).toBe("https://feeds.materialhubuae.com/google_merchant/feed.xml");
    expect(finalRun?.file_size_bytes).toBeGreaterThan(0);

    // Upload called exactly once with the serialized XML body.
    expect(harness.state.uploadCalls).toHaveLength(1);
    const expectedXml = feedItemsToGoogleRss(items, {
      title: channel.display_name,
      link: harness.deps.webBaseUrl,
      description: "MaterialHub marketplace catalog",
    });
    expect(harness.state.uploadCalls[0]?.body).toBe(expectedXml);
    expect(harness.state.uploadCalls[0]?.channelCode).toBe("google_merchant");
    expect(harness.state.uploadCalls[0]?.format).toBe("xml");

    // Channel was updated with the new feed URL + success status.
    const finalChannelSave = harness.state.channelSaves[harness.state.channelSaves.length - 1];
    expect(finalChannelSave?.feed_url).toBe(
      "https://feeds.materialhubuae.com/google_merchant/feed.xml",
    );
    expect(finalChannelSave?.last_full_feed_status).toBe("success");
    expect(finalChannelSave?.last_full_feed_at).toBeInstanceOf(Date);

    // Two new channel_listings rows (no prior existing).
    expect(harness.state.listingSaves).toHaveLength(2);
  });
});

describe("handleFeedBuildJob — disabled channel skip path", () => {
  it("returns skipped without inserting a run row or calling upload", async () => {
    const channel = makeChannel({ is_enabled: false });
    const harness = makeDeps({ channel });

    const result = await handleFeedBuildJob(
      { channelCode: channel.code, trigger: "cron" },
      harness.deps,
    );

    expect(result.status).toBe("skipped");
    expect(harness.state.runSaves).toHaveLength(0);
    expect(harness.state.uploadCalls).toHaveLength(0);
    expect(harness.state.channelSaves).toHaveLength(0);
  });
});

describe("handleFeedBuildJob — error path", () => {
  it("marks the run as failed, channel last_full_feed_status=failed, and re-throws", async () => {
    const channel = makeChannel({ is_enabled: true });
    const items = [baseItem({ offer_id: "prod-1" })];
    const harness = makeDeps({
      channel,
      initialBuildResult: { items, itemCount: 1, excludedCount: 0, skippedCount: 0 },
    });
    harness.setUploadImpl(() => Promise.reject(new Error("s3_boom")));

    await expect(
      handleFeedBuildJob({ channelCode: channel.code, trigger: "cron" }, harness.deps),
    ).rejects.toThrow("s3_boom");

    const finalRun = harness.state.runSaves[harness.state.runSaves.length - 1];
    expect(finalRun?.status).toBe("failed");
    expect(finalRun?.error_message).toContain("s3_boom");
    expect(finalRun?.finished_at).toBeInstanceOf(Date);

    const finalChannelSave = harness.state.channelSaves[harness.state.channelSaves.length - 1];
    expect(finalChannelSave?.last_full_feed_status).toBe("failed");
  });
});

describe("handleFeedBuildJob — soft-delete stale listings", () => {
  it("soft-deletes channel_listings rows whose offer_id is not in the eligible set", async () => {
    const channel = makeChannel({ is_enabled: true });
    const eligibleItems = [baseItem({ offer_id: "prod-keep" })];
    const ghostRow = listingRow("prod-ghost");
    const harness = makeDeps({
      channel,
      existingListings: [ghostRow],
      initialBuildResult: {
        items: eligibleItems,
        itemCount: 1,
        excludedCount: 0,
        skippedCount: 0,
      },
    });

    const result = await handleFeedBuildJob(
      { channelCode: channel.code, trigger: "cron" },
      harness.deps,
    );

    expect(result.status).toBe("success");
    expect(harness.state.softDeletes).toContain(ghostRow.id);
  });
});

describe("handleFeedBuildJob — variant vs base item mapping", () => {
  it("derives product_id and variant_id correctly for both base products and variants", async () => {
    const channel = makeChannel({ is_enabled: true });
    const baseProductItem = baseItem({
      offer_id: "base-prod-1",
      item_group_id: null,
    });
    const variantItem = baseItem({
      offer_id: "variant-A",
      item_group_id: "parent-prod-2",
      title: "Variant A",
    });
    const harness = makeDeps({
      channel,
      initialBuildResult: {
        items: [baseProductItem, variantItem],
        itemCount: 2,
        excludedCount: 0,
        skippedCount: 0,
      },
    });

    const result = await handleFeedBuildJob(
      { channelCode: channel.code, trigger: "cron" },
      harness.deps,
    );

    expect(result.status).toBe("success");

    const savedBase = harness.state.listingSaves.find((r) => r.offer_id === "base-prod-1");
    expect(savedBase?.product_id).toBe("base-prod-1");
    expect(savedBase?.variant_id).toBeNull();

    const savedVariant = harness.state.listingSaves.find((r) => r.offer_id === "variant-A");
    expect(savedVariant?.product_id).toBe("parent-prod-2");
    expect(savedVariant?.variant_id).toBe("variant-A");
  });
});

describe("handleFeedBuildJob — Meta channel serializer dispatch", () => {
  it("uses the Meta serializer when channelCode is meta_catalog", async () => {
    const metaChannel = {
      id: "ch-meta",
      code: "meta_catalog",
      display_name: "Meta Catalog",
      is_enabled: true,
      credentials_encrypted: null,
    } as unknown as SalesChannel;

    const oneItem: FeedItem = {
      offer_id: "prod-x",
      item_group_id: null,
      title: "T",
      description: "D",
      link: "https://materialhubuae.com/en/product/x",
      image_link: "https://cdn.materialhubuae.com/p/x/a.jpg",
      additional_image_links: [],
      availability: "in_stock",
      price_fils: 10000,
      sale_price_fils: null,
      currency: "AED",
      brand: null,
      gtin: null,
      mpn: null,
      condition: "new",
      google_product_category: null,
      product_type: null,
      country_of_origin: null,
      identifier_exists: false,
    };

    const harness = makeDeps({
      channel: metaChannel,
      initialBuildResult: {
        items: [oneItem],
        itemCount: 1,
        excludedCount: 0,
        skippedCount: 0,
      },
    });

    const result = await handleFeedBuildJob(
      { channelCode: "meta_catalog" as SalesChannelCode, trigger: "cron" },
      harness.deps,
    );

    expect(result.status).toBe("success");
    expect(harness.state.uploadCalls).toHaveLength(1);
    const uploadCall = harness.state.uploadCalls[0]!;
    expect(uploadCall.channelCode).toBe("meta_catalog");
    expect(uploadCall.format).toBe("xml");
    expect(uploadCall.body.startsWith("<?xml")).toBe(true);
    // Meta-specific uppercase NO distinguishes the serializer output
    // (Google emits lowercase "no").
    expect(uploadCall.body).toContain("<g:identifier_exists>NO</g:identifier_exists>");
  });
});

describe("handleFeedBuildJob — TikTok channel serializer dispatch", () => {
  it("uses the TikTok serializer when channelCode is tiktok", async () => {
    const tiktokChannel = {
      id: "ch-tt",
      code: "tiktok",
      display_name: "MaterialHub TikTok",
      is_enabled: true,
      credentials_encrypted: null,
    } as unknown as SalesChannel;

    const oneItem: FeedItem = {
      offer_id: "prod-x",
      item_group_id: null,
      title: "T",
      description: "D",
      link: "https://materialhubuae.com/en/product/x",
      image_link: "https://cdn.materialhubuae.com/p/x/a.jpg",
      additional_image_links: [],
      availability: "in_stock",
      price_fils: 10000,
      sale_price_fils: null,
      currency: "AED",
      brand: null,
      gtin: null,
      mpn: null,
      condition: "new",
      google_product_category: null,
      product_type: null,
      country_of_origin: null,
      identifier_exists: false,
    };

    const harness = makeDeps({
      channel: tiktokChannel,
      initialBuildResult: {
        items: [oneItem],
        itemCount: 1,
        excludedCount: 0,
        skippedCount: 0,
      },
    });

    const result = await handleFeedBuildJob(
      { channelCode: "tiktok" as SalesChannelCode, trigger: "cron" },
      harness.deps,
    );

    expect(result.status).toBe("success");
    expect(harness.state.uploadCalls).toHaveLength(1);
    const uploadCall = harness.state.uploadCalls[0]!;
    expect(uploadCall.channelCode).toBe("tiktok");
    expect(uploadCall.format).toBe("xml");
    // TikTok uses the Google-compatible RSS 2.0 + g: namespace envelope.
    expect(uploadCall.body).toContain(
      '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    );
    // Channel display_name threaded through to the feed channel.title.
    expect(uploadCall.body).toContain("<title>MaterialHub TikTok</title>");
  });
});

describe("scheduleFeedBuildCron — channel iteration", () => {
  it("schedules a feed-build job for tiktok alongside google and meta", async () => {
    const added: Array<{ name: string; data: unknown; opts: Record<string, unknown> }> = [];
    const queue = {
      // biome-ignore lint/suspicious/noExplicitAny: minimal queue mock
      add: async (name: string, data: any, opts: any) => {
        added.push({ name, data, opts });
      },
    } as unknown as Queue;

    await scheduleFeedBuildCron(queue);

    const tiktokJob = added.find((j) => j.name === "feed-build:tiktok");
    expect(tiktokJob).toBeDefined();
    expect((tiktokJob?.data as { channelCode: string }).channelCode).toBe("tiktok");
    expect((tiktokJob?.opts as { jobId: string }).jobId).toBe("feed-build:cron:tiktok");
    // Sanity: the iteration still includes the Phase 1a/2 channels.
    expect(added.find((j) => j.name === "feed-build:google_merchant")).toBeDefined();
    expect(added.find((j) => j.name === "feed-build:meta_catalog")).toBeDefined();
  });
});

describe("handleFeedBuildJob — admin-excluded rows survive cron", () => {
  it("does NOT soft-delete a listing row whose excluded=true (would re-enter feed next run)", async () => {
    // The builder receives excludedOfferIds and drops them from built.items.
    // If the cron then diffed against ALL existing rows, the excluded row would
    // be in `removed` and get soft-deleted — and on the next run, the
    // `excluded: true` query would no longer match it (filtered out by default
    // soft-delete behavior), so the admin's exclusion would silently revert.
    const channel = makeChannel({ is_enabled: true });
    const excludedRow = listingRow("prod-excluded", {
      excluded: true,
      content_hash: "old-hash",
    } as Partial<ChannelListing>);
    const harness = makeDeps({
      channel,
      existingListings: [excludedRow],
      // builder respects excludedOfferIds → built.items is empty for this offer
      initialBuildResult: {
        items: [],
        itemCount: 0,
        excludedCount: 1,
        skippedCount: 0,
      },
    });

    const result = await handleFeedBuildJob(
      { channelCode: channel.code, trigger: "cron" },
      harness.deps,
    );

    expect(result.status).toBe("success");
    expect(harness.state.softDeletes).not.toContain(excludedRow.id);
    expect(harness.state.softDeletes).toHaveLength(0);
  });
});

describe("handleFeedBuildJob — manual trigger", () => {
  it("writes a run row with trigger='manual' when the job carries it", async () => {
    const channel = makeChannel({ is_enabled: true });
    const harness = makeDeps({
      channel,
      initialBuildResult: { items: [baseItem()], itemCount: 1, excludedCount: 0, skippedCount: 0 },
    });
    const result = await handleFeedBuildJob(
      { channelCode: channel.code, trigger: "manual" },
      harness.deps,
    );
    expect(result.status).toBe("success");
    const finalRun = harness.state.runSaves[harness.state.runSaves.length - 1];
    expect(finalRun?.trigger).toBe("manual");
  });
});
