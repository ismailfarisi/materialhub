import { describe, expect, it, mock } from "bun:test";
import type {
  ChannelCategoryMapping,
  ChannelListing,
  SalesChannel,
  SalesChannelCode,
} from "@materialhub/database";
import type { Queue } from "bullmq";
import type { Repository } from "typeorm";
import type { FeedBuilderService } from "../feed/feed-builder.service.ts";
import type { FeedItem } from "../feed/feed-item.ts";
import { computeContentHash } from "../feed/listings-sync.ts";
import type { DeltaScanDeps } from "./delta-scan.cron.ts";
import { handleDeltaScan } from "./delta-scan.cron.ts";

// ─── Helpers ────────────────────────────────────────────────────────────────

const baseItem = (overrides: Partial<FeedItem> = {}): FeedItem => ({
  offer_id: "prod-1",
  item_group_id: null,
  title: "Rose Eau de Parfum",
  description: "A floral fragrance.",
  link: "https://materialhubuae.com/en/product/rose-edp",
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

interface QueueAdd {
  name: string;
  data: { channelId: string; offerId: string; action: "upsert" | "delete"; item: FeedItem | null };
  opts: { jobId?: string; removeOnComplete?: number };
}

interface Harness {
  deps: DeltaScanDeps;
  state: {
    channelSaves: SalesChannel[];
    queueAdds: QueueAdd[];
    existingListings: ChannelListing[];
  };
}

function makeHarness(opts: {
  channel: SalesChannel | null;
  existingListings?: ChannelListing[];
  buildResult?: Awaited<ReturnType<FeedBuilderService["build"]>>;
}): Harness {
  const state: Harness["state"] = {
    channelSaves: [],
    queueAdds: [],
    existingListings: opts.existingListings ?? [],
  };
  const buildResult: Awaited<ReturnType<FeedBuilderService["build"]>> = opts.buildResult ?? {
    items: [],
    itemCount: 0,
    excludedCount: 0,
    skippedCount: 0,
  };
  const channel = opts.channel;

  const salesChannelRepo = {
    findOne: mock((_args: unknown) => Promise.resolve(channel)),
    save: mock((row: SalesChannel) => {
      state.channelSaves.push({ ...row });
      return Promise.resolve(row);
    }),
  } as unknown as Repository<SalesChannel>;

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
  } as unknown as Repository<ChannelListing>;

  const channelCategoryMapRepo = {
    find: mock((_args: unknown) => Promise.resolve([] as ChannelCategoryMapping[])),
  } as unknown as Repository<ChannelCategoryMapping>;

  const feedBuilderService = {
    build: mock((_channel: SalesChannel, _categoryMap: unknown, _excluded: unknown) =>
      Promise.resolve(buildResult),
    ),
  } as unknown as FeedBuilderService;

  const deltaPushQueue = {
    add: mock(
      (
        name: string,
        data: QueueAdd["data"],
        jobOpts: { jobId?: string; removeOnComplete?: number },
      ) => {
        state.queueAdds.push({ name, data, opts: jobOpts });
        return Promise.resolve({ id: jobOpts.jobId ?? `auto-${state.queueAdds.length}` } as never);
      },
    ),
  } as unknown as Queue;

  return {
    state,
    deps: {
      salesChannelRepo,
      channelListingRepo,
      channelCategoryMapRepo,
      feedBuilderService,
      deltaPushQueue,
    },
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("handleDeltaScan — disabled channel", () => {
  it("returns skipped without enqueueing or touching the channel", async () => {
    const harness = makeHarness({ channel: makeChannel({ is_enabled: false }) });

    const result = await handleDeltaScan(
      { channelCode: "google_merchant" as SalesChannelCode },
      harness.deps,
    );

    expect(result).toEqual({ enqueued: 0, status: "skipped" });
    expect(harness.state.queueAdds).toHaveLength(0);
    expect(harness.state.channelSaves).toHaveLength(0);
  });

  it("returns skipped if the channel row is missing entirely", async () => {
    const harness = makeHarness({ channel: null });

    const result = await handleDeltaScan(
      { channelCode: "google_merchant" as SalesChannelCode },
      harness.deps,
    );

    expect(result).toEqual({ enqueued: 0, status: "skipped" });
    expect(harness.state.queueAdds).toHaveLength(0);
  });
});

describe("handleDeltaScan — degraded channel", () => {
  it("returns degraded if degraded_until is in the future", async () => {
    const future = new Date(Date.now() + 60_000);
    const harness = makeHarness({
      channel: makeChannel({ degraded_until: future }),
    });

    const result = await handleDeltaScan(
      { channelCode: "google_merchant" as SalesChannelCode },
      harness.deps,
    );

    expect(result).toEqual({ enqueued: 0, status: "degraded" });
    expect(harness.state.queueAdds).toHaveLength(0);
    expect(harness.state.channelSaves).toHaveLength(0);
  });

  it("proceeds normally if degraded_until is in the past", async () => {
    const past = new Date(Date.now() - 60_000);
    const harness = makeHarness({
      channel: makeChannel({ degraded_until: past }),
      buildResult: { items: [], itemCount: 0, excludedCount: 0, skippedCount: 0 },
    });

    const result = await handleDeltaScan(
      { channelCode: "google_merchant" as SalesChannelCode },
      harness.deps,
    );

    expect(result.status).toBe("ok");
  });
});

describe("handleDeltaScan — happy path enqueues per-item push jobs", () => {
  it("enqueues one upsert per new/changed item and one delete per removed", async () => {
    const channel = makeChannel({ is_enabled: true });
    // Two items: one brand-new ("prod-new"), one whose hash changed
    // ("prod-changed"). One existing row ("prod-gone") is no longer eligible →
    // should be enqueued as a delete. One existing row ("prod-same") has a
    // matching hash → should be left alone.
    const newItem = baseItem({ offer_id: "prod-new", title: "New Item" });
    const changedItem = baseItem({ offer_id: "prod-changed", title: "Changed Title" });
    const sameItem = baseItem({ offer_id: "prod-same", title: "Same" });
    const sameHash = computeContentHash(sameItem);

    const harness = makeHarness({
      channel,
      existingListings: [
        listingRow("prod-changed", { content_hash: "stale-hash" } as Partial<ChannelListing>),
        listingRow("prod-same", { content_hash: sameHash } as Partial<ChannelListing>),
        listingRow("prod-gone", { content_hash: "any-hash" } as Partial<ChannelListing>),
      ],
      buildResult: {
        items: [newItem, changedItem, sameItem],
        itemCount: 3,
        excludedCount: 0,
        skippedCount: 0,
      },
    });

    const result = await handleDeltaScan(
      { channelCode: "google_merchant" as SalesChannelCode },
      harness.deps,
    );

    expect(result.status).toBe("ok");
    expect(result.enqueued).toBe(3); // 2 upserts + 1 delete

    // Two upsert jobs with stable jobIds.
    const upserts = harness.state.queueAdds.filter((q) => q.data.action === "upsert");
    expect(upserts).toHaveLength(2);
    expect(upserts.map((u) => u.data.offerId).sort()).toEqual(["prod-changed", "prod-new"]);
    for (const u of upserts) {
      expect(u.opts.jobId).toBe(`${channel.id}:upsert:${u.data.offerId}`);
      expect(u.data.item).not.toBeNull();
    }

    // One delete job for the gone listing.
    const deletes = harness.state.queueAdds.filter((q) => q.data.action === "delete");
    expect(deletes).toHaveLength(1);
    expect(deletes[0]?.data.offerId).toBe("prod-gone");
    expect(deletes[0]?.opts.jobId).toBe(`${channel.id}:delete:prod-gone`);
    expect(deletes[0]?.data.item).toBeNull();

    // No job for the unchanged item.
    expect(harness.state.queueAdds.find((q) => q.data.offerId === "prod-same")).toBeUndefined();
  });
});

describe("handleDeltaScan — watermark advances on success", () => {
  it("writes scanStart to channel.last_delta_success_at after successful scan", async () => {
    const channel = makeChannel({ is_enabled: true, last_delta_success_at: null });
    const harness = makeHarness({
      channel,
      buildResult: {
        items: [baseItem({ offer_id: "prod-1" })],
        itemCount: 1,
        excludedCount: 0,
        skippedCount: 0,
      },
    });

    const before = new Date();
    await handleDeltaScan({ channelCode: "google_merchant" as SalesChannelCode }, harness.deps);
    const after = new Date();

    expect(harness.state.channelSaves).toHaveLength(1);
    const saved = harness.state.channelSaves[0];
    expect(saved?.last_delta_success_at).toBeInstanceOf(Date);
    const ts = (saved?.last_delta_success_at as Date).getTime();
    expect(ts).toBeGreaterThanOrEqual(before.getTime());
    expect(ts).toBeLessThanOrEqual(after.getTime());
  });
});

describe("handleDeltaScan — admin-excluded rows excluded from existing", () => {
  it("does not enqueue a delete for a listing whose excluded=true (would soft-delete the exclusion)", async () => {
    // Same anti-regression contract as the full-feed cron: the builder drops
    // excluded offers from `built.items`. If the scan diffed against ALL
    // existing rows, the excluded row would appear in `diff.removed` and the
    // worker would soft-delete it — quietly losing the admin exclusion on the
    // following run.
    const channel = makeChannel({ is_enabled: true });
    const excludedRow = listingRow("prod-excluded", {
      excluded: true,
      content_hash: "stale-hash",
    } as Partial<ChannelListing>);
    const harness = makeHarness({
      channel,
      existingListings: [excludedRow],
      buildResult: { items: [], itemCount: 0, excludedCount: 1, skippedCount: 0 },
    });

    const result = await handleDeltaScan(
      { channelCode: "google_merchant" as SalesChannelCode },
      harness.deps,
    );

    expect(result.status).toBe("ok");
    expect(harness.state.queueAdds).toHaveLength(0);
  });
});
