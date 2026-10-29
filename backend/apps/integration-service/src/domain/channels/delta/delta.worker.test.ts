import { describe, expect, it, mock } from "bun:test";
import type { ChannelDelivery, ChannelListing, SalesChannel } from "@materialhub/database";
import { EncryptionService } from "@materialhub/utils";
import type { RedisClientType } from "redis";
import type { Repository, SelectQueryBuilder } from "typeorm";
import type { GoogleAdapter, GoogleMerchantCenterCredentials } from "../adapters/google.adapter.ts";
import type { MetaAdapter } from "../adapters/meta.adapter.ts";
import type { FeedItem } from "../feed/feed-item.ts";
import type { DeltaPushJob } from "./delta-scan.cron.ts";
import { handleDeltaPush } from "./delta.worker.ts";

// ─── Helpers ────────────────────────────────────────────────────────────────

// Valid 32-byte hex key for AES-256-GCM.
const TEST_KEY = "00".repeat(32);

const realEncryption = new EncryptionService(TEST_KEY);
const testCreds: GoogleMerchantCenterCredentials = {
  merchantId: "1234567",
  serviceAccount: {
    client_email: "test@svc.iam.gserviceaccount.com",
    private_key: "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----",
  },
};
const encryptedCreds = realEncryption.encryptObject(
  testCreds as unknown as Record<string, unknown>,
);

const baseItem = (overrides: Partial<FeedItem> = {}): FeedItem => ({
  offer_id: "prod-1",
  item_group_id: null,
  title: "Rose Eau de Parfum",
  description: "A floral fragrance.",
  link: "https://www.materialhubuae.com/en/product/rose-edp",
  image_link: "https://cdn.materialhubuae.com/p/1/a.jpg",
  additional_image_links: ["https://cdn.materialhubuae.com/p/1/b.jpg"],
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
    code: "google_merchant",
    display_name: "Google Merchant Center",
    is_enabled: true,
    credentials_encrypted: encryptedCreds,
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

// In-memory sorted-set emulation good enough for the worker's failure tracker.
function makeFakeRedis(): {
  redis: RedisClientType;
  state: { entries: Array<{ score: number; value: string }>; deleted: number };
  prefill: (timestamps: number[]) => void;
} {
  const state = {
    entries: [] as Array<{ score: number; value: string }>,
    deleted: 0,
  };

  const redis = {
    zAdd: mock((_key: string, args: { score: number; value: string }) => {
      state.entries.push({ score: args.score, value: args.value });
      return Promise.resolve(1);
    }),
    zRemRangeByScore: mock((_key: string, min: number, max: number) => {
      const before = state.entries.length;
      state.entries = state.entries.filter((e) => !(e.score >= min && e.score <= max));
      state.deleted += before - state.entries.length;
      return Promise.resolve(before - state.entries.length);
    }),
    zRange: mock((_key: string, _min: number, _max: number) => {
      // Sorted ascending by score, return values only (the worker encodes the
      // timestamp into the value as `${ts}-${uuid}` and parses it back).
      return Promise.resolve(
        [...state.entries].sort((a, b) => a.score - b.score).map((e) => e.value),
      );
    }),
  } as unknown as RedisClientType;

  return {
    redis,
    state,
    prefill: (timestamps) => {
      for (const ts of timestamps) {
        state.entries.push({ score: ts, value: `${ts}-${crypto.randomUUID()}` });
      }
    },
  };
}

interface Harness {
  deps: import("./delta.worker.ts").DeltaWorkerDeps;
  state: {
    channelSaves: SalesChannel[];
    deliverySaves: ChannelDelivery[];
    softDeleteWhere: Array<{ sql: string; params: Record<string, unknown> }>;
    redis: ReturnType<typeof makeFakeRedis>;
    upsertCalls: Array<{ creds: GoogleMerchantCenterCredentials; item: FeedItem }>;
    deleteCalls: Array<{ creds: GoogleMerchantCenterCredentials; offerId: string }>;
    metaPushCalls: Array<{ requests: unknown[] }>;
  };
  setUpsertImpl: (impl: () => Promise<{ status: number; body?: unknown }>) => void;
  setDeleteImpl: (impl: () => Promise<{ status: number }>) => void;
  setMetaPushImpl: (impl: () => Promise<{ status: number; body?: unknown }>) => void;
}

function makeHarness(opts: { channel: SalesChannel }): Harness {
  const state: Harness["state"] = {
    channelSaves: [],
    deliverySaves: [],
    softDeleteWhere: [],
    redis: makeFakeRedis(),
    upsertCalls: [],
    deleteCalls: [],
    metaPushCalls: [],
  };
  const channel = opts.channel;

  let upsertImpl: () => Promise<{ status: number; body?: unknown }> = () =>
    Promise.resolve({ status: 200, body: { ok: true } });
  let deleteImpl: () => Promise<{ status: number }> = () => Promise.resolve({ status: 204 });
  let metaPushImpl: () => Promise<{ status: number; body?: unknown }> = () =>
    Promise.resolve({ status: 200, body: { handles: ["h"] } });

  const salesChannelRepo = {
    findOneOrFail: mock((_args: unknown) => Promise.resolve(channel)),
    save: mock((row: SalesChannel) => {
      state.channelSaves.push({ ...row });
      // Mutate the underlying channel so subsequent reads observe new state
      // (mirrors TypeORM's in-place save behavior closely enough for tests).
      Object.assign(channel, row);
      return Promise.resolve(row);
    }),
  } as unknown as Repository<SalesChannel>;

  const channelDeliveryRepo = {
    create: mock((input: Partial<ChannelDelivery>): ChannelDelivery => {
      return {
        id: `delivery-${state.deliverySaves.length + 1}`,
        ...input,
      } as unknown as ChannelDelivery;
    }),
    save: mock((row: ChannelDelivery) => {
      state.deliverySaves.push({ ...row });
      return Promise.resolve(row);
    }),
  } as unknown as Repository<ChannelDelivery>;

  // Minimal QueryBuilder chain that captures the parameterized WHERE so the
  // delete-path test can assert what got soft-deleted.
  const qb = {
    softDelete: mock(() => qb),
    where: mock((sql: string, params: Record<string, unknown>) => {
      state.softDeleteWhere.push({ sql, params });
      return qb;
    }),
    execute: mock(() => Promise.resolve({ affected: 1 })),
  };
  const channelListingRepo = {
    createQueryBuilder: mock(() => qb as unknown as SelectQueryBuilder<ChannelListing>),
  } as unknown as Repository<ChannelListing>;

  const googleAdapter = {
    upsertProduct: mock((creds: GoogleMerchantCenterCredentials, item: FeedItem) => {
      state.upsertCalls.push({ creds, item });
      return upsertImpl();
    }),
    deleteProduct: mock((creds: GoogleMerchantCenterCredentials, offerId: string) => {
      state.deleteCalls.push({ creds, offerId });
      return deleteImpl();
    }),
  } as unknown as GoogleAdapter;

  const metaAdapter = {
    pushBatch: mock((_creds: unknown, requests: unknown[]) => {
      state.metaPushCalls.push({ requests });
      return metaPushImpl();
    }),
  } as unknown as MetaAdapter;

  // Wrap `decryptObject` so individual tests can override the decrypted result
  // (e.g. Meta tests need a Meta-shaped credentials blob without re-encrypting).
  // Default behavior delegates to the real EncryptionService so existing
  // Google-shape tests keep round-tripping through real AES-GCM.
  const encryption = {
    encryptObject: realEncryption.encryptObject.bind(realEncryption),
    decryptObject: mock(<T>(ciphertext: string): T => realEncryption.decryptObject<T>(ciphertext)),
  } as unknown as EncryptionService;

  return {
    state,
    deps: {
      salesChannelRepo,
      channelListingRepo,
      channelDeliveryRepo,
      encryption,
      googleAdapter,
      metaAdapter,
      redis: state.redis.redis,
    },
    setUpsertImpl: (impl) => {
      upsertImpl = impl;
    },
    setDeleteImpl: (impl) => {
      deleteImpl = impl;
    },
    setMetaPushImpl: (impl) => {
      metaPushImpl = impl;
    },
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("handleDeltaPush — success path", () => {
  it("writes channel_deliveries with status=success and calls upsert on the adapter", async () => {
    const channel = makeChannel();
    const harness = makeHarness({ channel });
    const item = baseItem({ offer_id: "prod-1" });

    const result = await handleDeltaPush(
      { channelId: channel.id, offerId: item.offer_id, action: "upsert", item },
      0,
      harness.deps,
    );

    expect(result.status).toBe("success");
    expect(harness.state.upsertCalls).toHaveLength(1);
    expect(harness.state.upsertCalls[0]?.item.offer_id).toBe("prod-1");

    // Two saves: initial "running" row, then final "success" row.
    expect(harness.state.deliverySaves.length).toBeGreaterThanOrEqual(2);
    const final = harness.state.deliverySaves[harness.state.deliverySaves.length - 1];
    expect(final?.status).toBe("success");
    expect(final?.response_status).toBe(200);
    expect(final?.event_name).toBe("product.upsert");
    expect(final?.latency_ms).toBeGreaterThanOrEqual(0);
    expect(final?.attempt).toBe(1);

    // No failures recorded.
    expect(harness.state.redis.state.entries).toHaveLength(0);
    // Channel not flipped to degraded.
    expect(harness.state.channelSaves).toHaveLength(0);
  });
});

describe("handleDeltaPush — failure path", () => {
  it("writes channel_deliveries with status=failed, records a failure in Redis, and re-throws", async () => {
    const channel = makeChannel();
    const harness = makeHarness({ channel });
    harness.setUpsertImpl(() => Promise.reject(Object.assign(new Error("boom"), { status: 503 })));
    const item = baseItem({ offer_id: "prod-1" });

    await expect(
      handleDeltaPush(
        { channelId: channel.id, offerId: item.offer_id, action: "upsert", item },
        0,
        harness.deps,
      ),
    ).rejects.toThrow("boom");

    const final = harness.state.deliverySaves[harness.state.deliverySaves.length - 1];
    expect(final?.status).toBe("failed");
    expect(final?.response_status).toBe(503);
    expect(final?.error_message).toContain("boom");

    expect(harness.state.redis.state.entries).toHaveLength(1);
    // Single failure: nowhere near the threshold, so channel not degraded.
    expect(harness.state.channelSaves).toHaveLength(0);
  });
});

describe("handleDeltaPush — circuit-breaker trip", () => {
  it("sets channel.degraded_until after the 20th failure in the window", async () => {
    const channel = makeChannel();
    const harness = makeHarness({ channel });
    // Prefill 19 recent failures; the 20th (this call) should trip.
    const now = Date.now();
    harness.state.redis.prefill(Array.from({ length: 19 }, (_, i) => now - i * 1000));
    harness.setUpsertImpl(() => Promise.reject(new Error("upstream-down")));
    const item = baseItem();

    await expect(
      handleDeltaPush(
        { channelId: channel.id, offerId: item.offer_id, action: "upsert", item },
        0,
        harness.deps,
      ),
    ).rejects.toThrow("upstream-down");

    expect(harness.state.redis.state.entries.length).toBeGreaterThanOrEqual(20);
    expect(harness.state.channelSaves).toHaveLength(1);
    const saved = harness.state.channelSaves[0];
    expect(saved?.degraded_until).toBeInstanceOf(Date);
    expect((saved?.degraded_until as Date).getTime()).toBeGreaterThan(Date.now());
  });
});

describe("handleDeltaPush — delete path", () => {
  it("calls deleteProduct and soft-deletes the matching channel_listings row", async () => {
    const channel = makeChannel();
    const harness = makeHarness({ channel });

    const result = await handleDeltaPush(
      { channelId: channel.id, offerId: "prod-gone", action: "delete", item: null },
      0,
      harness.deps,
    );

    expect(result.status).toBe("success");
    expect(harness.state.deleteCalls).toHaveLength(1);
    expect(harness.state.deleteCalls[0]?.offerId).toBe("prod-gone");

    expect(harness.state.softDeleteWhere).toHaveLength(1);
    expect(harness.state.softDeleteWhere[0]?.params).toEqual({
      c: channel.id,
      o: "prod-gone",
    });

    const final = harness.state.deliverySaves[harness.state.deliverySaves.length - 1];
    expect(final?.status).toBe("success");
    expect(final?.event_name).toBe("product.delete");
  });
});

describe("handleDeltaPush — degraded channel rejection", () => {
  it("throws before calling the adapter when degraded_until is in the future", async () => {
    const future = new Date(Date.now() + 60_000);
    const channel = makeChannel({ degraded_until: future });
    const harness = makeHarness({ channel });

    await expect(
      handleDeltaPush(
        { channelId: channel.id, offerId: "prod-1", action: "upsert", item: baseItem() },
        0,
        harness.deps,
      ),
    ).rejects.toThrow("channel_degraded");

    expect(harness.state.upsertCalls).toHaveLength(0);
    expect(harness.state.deliverySaves).toHaveLength(0);
  });
});

describe("handleDeltaPush — disabled channel", () => {
  it("writes a skipped delivery row and returns failed (no adapter call)", async () => {
    const channel = makeChannel({ is_enabled: false });
    const harness = makeHarness({ channel });

    const result = await handleDeltaPush(
      { channelId: channel.id, offerId: "prod-1", action: "upsert", item: baseItem() },
      0,
      harness.deps,
    );

    expect(result.status).toBe("failed");
    expect(harness.state.upsertCalls).toHaveLength(0);
    // Audit trail: a "skipped" delivery row is written so ops can see why this
    // queued job never reached Google. Mirrors dispatcher.worker.ts.
    expect(harness.state.deliverySaves).toHaveLength(1);
    const skipped = harness.state.deliverySaves[0];
    expect(skipped?.status).toBe("skipped");
    expect((skipped?.payload as { reason?: string })?.reason).toBe("channel_disabled");
  });
});

describe("handleDeltaPush — tiktok short-circuit", () => {
  it("writes a skipped delivery row and returns failed without throwing or tripping the circuit breaker", async () => {
    // TikTok is XML-poll-based — no per-product push. If anything ever enqueues
    // a tiktok delta job (manual ops, stale cron, mis-routed admin action), the
    // worker must short-circuit BEFORE the dispatch chain's else-throw, which
    // would otherwise count as a failure and trip the circuit breaker.
    const tiktokChannel = makeChannel({
      id: "ch-tiktok",
      code: "tiktok",
      credentials_encrypted: "encrypted-tiktok-blob",
    } as unknown as Partial<SalesChannel>);
    const harness = makeHarness({ channel: tiktokChannel });

    const result = await handleDeltaPush(
      { channelId: tiktokChannel.id, offerId: "prod-1", action: "upsert", item: baseItem() },
      0,
      harness.deps,
    );

    expect(result.status).toBe("failed");
    // No adapter calls (neither Google nor Meta were exercised).
    expect(harness.state.upsertCalls).toHaveLength(0);
    expect(harness.state.deleteCalls).toHaveLength(0);
    expect(harness.state.metaPushCalls).toHaveLength(0);
    // Exactly one skipped delivery row for audit, with the tiktok-specific reason.
    expect(harness.state.deliverySaves).toHaveLength(1);
    const skipped = harness.state.deliverySaves[0];
    expect(skipped?.status).toBe("skipped");
    expect(skipped?.event_name).toBe("product.upsert");
    expect((skipped?.payload as { reason?: string })?.reason).toBe("tiktok_no_delta_push");
    // Critical: NO entry in the failure counter — the throw would have
    // recorded one, which is exactly what the short-circuit prevents.
    expect(harness.state.redis.state.entries).toHaveLength(0);
    // Channel never flipped to degraded.
    expect(harness.state.channelSaves).toHaveLength(0);
  });
});

describe("handleDeltaPush — credentials shape compatibility", () => {
  // The default fixtures (`testCreds` / `encryptedCreds` above) are the
  // Phase 1a FLAT shape `{ merchantId, serviceAccount }`. Every other test in
  // this file exercises that shape end-to-end, which proves the legacy-flat
  // back-compat path through `readGoogleChannelCredentials`. This test adds
  // explicit coverage for the new Phase 1b nested shape.
  it("decrypts a nested-shape credentials blob and passes merchantCenter to the adapter", async () => {
    const nestedBlob = {
      merchantCenter: testCreds,
      googleAds: {
        developerToken: "dev-token",
        customerId: "1112223333",
        conversionActionId: "9876543210",
        oauthClient: {
          clientId: "ci",
          clientSecret: "cs",
          refreshToken: "rt",
        },
      },
    };
    const encryptedNested = realEncryption.encryptObject(
      nestedBlob as unknown as Record<string, unknown>,
    );
    const channel = makeChannel({ credentials_encrypted: encryptedNested });
    const harness = makeHarness({ channel });
    const item = baseItem({ offer_id: "prod-nested" });

    const result = await handleDeltaPush(
      { channelId: channel.id, offerId: item.offer_id, action: "upsert", item },
      0,
      harness.deps,
    );

    expect(result.status).toBe("success");
    expect(harness.state.upsertCalls).toHaveLength(1);
    // Adapter receives ONLY the Merchant Center section, not the full nested
    // blob (it has no use for googleAds and shouldn't see it).
    const call = harness.state.upsertCalls[0]!;
    expect(call.creds.merchantId).toBe(testCreds.merchantId);
    expect(call.creds.serviceAccount.client_email).toBe(testCreds.serviceAccount.client_email);
    expect((call.creds as unknown as Record<string, unknown>).googleAds).toBeUndefined();
  });
});

describe("handleDeltaPush — sanitizeForLog (via payload)", () => {
  it("strips image_link, additional_image_links, and link from the logged payload", async () => {
    const channel = makeChannel();
    const harness = makeHarness({ channel });
    const item = baseItem({
      offer_id: "prod-keep",
      image_link: "https://cdn.materialhubuae.com/p/k/a.jpg",
      additional_image_links: ["https://cdn.materialhubuae.com/p/k/b.jpg"],
      link: "https://materialhubuae.com/en/product/keep",
    });

    await handleDeltaPush(
      { channelId: channel.id, offerId: item.offer_id, action: "upsert", item },
      0,
      harness.deps,
    );

    // First saved delivery is the "running" insert that owns the payload field.
    const initial = harness.state.deliverySaves[0];
    expect(initial?.payload).toBeDefined();
    const payload = initial?.payload as Record<string, unknown>;
    expect(payload.image_link).toBeUndefined();
    expect(payload.additional_image_links).toBeUndefined();
    expect(payload.link).toBeUndefined();
    // But useful identifying fields survived.
    expect(payload.offerId).toBe("prod-keep");
    expect(payload.title).toBe(item.title);
    expect(payload.price_fils).toBe(item.price_fils);
  });

  it("logs only offerId for delete jobs (no item payload)", async () => {
    const channel = makeChannel();
    const harness = makeHarness({ channel });

    await handleDeltaPush(
      { channelId: channel.id, offerId: "prod-gone", action: "delete", item: null },
      0,
      harness.deps,
    );

    const initial = harness.state.deliverySaves[0];
    expect(initial?.payload).toEqual({ offerId: "prod-gone" });
  });
});

describe("handleDeltaPush — Meta channel dispatch", () => {
  it("dispatches to MetaAdapter.pushBatch with UPDATE when channel.code is meta_catalog (upsert)", async () => {
    const metaChannel = makeChannel({
      id: "ch-meta",
      code: "meta_catalog",
      credentials_encrypted: "encrypted-meta-blob",
    } as unknown as Partial<SalesChannel>);
    const harness = makeHarness({ channel: metaChannel });

    // The encryption mock in makeHarness decrypts to whatever is configured;
    // override it to return a Meta credentials blob.
    (
      harness.deps.encryption.decryptObject as unknown as ReturnType<typeof mock>
    ).mockImplementation(() => ({
      pixelId: "p",
      catalogId: "c",
      businessId: "b",
      accessToken: "tok",
    }));

    const job: DeltaPushJob = {
      channelId: metaChannel.id,
      offerId: "var-1",
      action: "upsert",
      item: baseItem({ offer_id: "var-1" }),
    };

    const result = await handleDeltaPush(job, 0, harness.deps);

    expect(result.status).toBe("success");
    expect(harness.state.metaPushCalls).toHaveLength(1);
    const requests = harness.state.metaPushCalls[0]!.requests as Array<{
      method: string;
      retailerId: string;
      item?: unknown;
    }>;
    expect(requests).toHaveLength(1);
    expect(requests[0]!.method).toBe("UPDATE");
    expect(requests[0]!.retailerId).toBe("var-1");
    expect(requests[0]!.item).toBeDefined();
  });

  it("dispatches DELETE method when channel is meta_catalog and action is delete", async () => {
    const metaChannel = makeChannel({
      id: "ch-meta",
      code: "meta_catalog",
      credentials_encrypted: "encrypted-meta-blob",
    } as unknown as Partial<SalesChannel>);
    const harness = makeHarness({ channel: metaChannel });
    (
      harness.deps.encryption.decryptObject as unknown as ReturnType<typeof mock>
    ).mockImplementation(() => ({
      pixelId: "p",
      catalogId: "c",
      businessId: "b",
      accessToken: "t",
    }));

    const job: DeltaPushJob = {
      channelId: metaChannel.id,
      offerId: "var-1",
      action: "delete",
      item: null,
    };

    await handleDeltaPush(job, 0, harness.deps);

    const requests = harness.state.metaPushCalls[0]!.requests as Array<{
      method: string;
      retailerId: string;
      item?: unknown;
    }>;
    expect(requests[0]!.method).toBe("DELETE");
    expect(requests[0]!.retailerId).toBe("var-1");
    expect(requests[0]!.item).toBeUndefined();

    expect(harness.state.softDeleteWhere).toHaveLength(1);
    expect(harness.state.softDeleteWhere[0]).toEqual({
      sql: "channel_id = :c AND offer_id = :o",
      params: { c: metaChannel.id, o: "var-1" },
    });
  });
});
