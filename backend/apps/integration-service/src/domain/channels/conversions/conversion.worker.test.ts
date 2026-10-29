import { describe, expect, it, mock } from "bun:test";
import type { ChannelDelivery, Order, OrderItem, SalesChannel, User } from "@materialhub/database";
import { EncryptionService } from "@materialhub/utils";
import type { Repository } from "typeorm";
import type { GoogleAdsAdapter } from "../adapters/google-ads.adapter.ts";
import type { MetaAdapter } from "../adapters/meta.adapter.ts";
import type { TiktokAdapter } from "../adapters/tiktok.adapter.ts";
import { type ConversionWorkerDeps, handleConversion } from "./conversion.worker.ts";

// ─── Helpers ────────────────────────────────────────────────────────────────

// Valid 32-byte hex key for AES-256-GCM.
const TEST_KEY = "00".repeat(32);
const realEncryption = new EncryptionService(TEST_KEY);

const validGoogleAdsBlob = {
  developerToken: "dev-token",
  customerId: "1112223333",
  conversionActionId: "9876543210",
  oauthClient: {
    clientId: "ci",
    clientSecret: "cs",
    refreshToken: "rt",
  },
};

const validMerchantCenterBlob = {
  merchantId: "1234567",
  serviceAccount: {
    client_email: "test@svc.iam.gserviceaccount.com",
    private_key: "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----",
  },
};

const encryptedFullBlob = realEncryption.encryptObject({
  merchantCenter: validMerchantCenterBlob,
  googleAds: validGoogleAdsBlob,
} as unknown as Record<string, unknown>);

const encryptedNoAdsBlob = realEncryption.encryptObject({
  merchantCenter: validMerchantCenterBlob,
  googleAds: null,
} as unknown as Record<string, unknown>);

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: "user-1",
    email: "buyer@example.com",
    phone: "+971501234567",
    first_name: "Ada",
    last_name: "Lovelace",
    ...overrides,
  }) as unknown as User;

const makeItem = (overrides: Partial<OrderItem> = {}): OrderItem =>
  ({
    id: `item-${Math.random().toString(36).slice(2, 8)}`,
    product_id: "prod-1",
    variant_id: null,
    quantity: 1,
    unit_price: 12000,
    vendor_id: "vendor-1",
    ...overrides,
  }) as unknown as OrderItem;

const makeOrder = (overrides: Partial<Order> = {}): Order =>
  ({
    id: "order-1",
    user_id: "user-1",
    user: makeUser(),
    items: [makeItem()],
    subtotal: 12000,
    discount_total: 0,
    shipping_total: 0,
    tax_total: 600,
    grand_total: 12600,
    refund_total: 0,
    currency: "AED",
    payment_status: "captured",
    created_at: new Date("2026-05-23T17:00:00.000Z"),
    ...overrides,
  }) as unknown as Order;

const makeChannel = (overrides: Partial<SalesChannel> = {}): SalesChannel =>
  ({
    id: "channel-1",
    code: "google_merchant",
    display_name: "Google Merchant Center",
    is_enabled: true,
    credentials_encrypted: encryptedFullBlob,
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

interface HarnessState {
  deliverySaves: ChannelDelivery[];
  uploadCalls: Array<{
    creds: typeof validGoogleAdsBlob;
    payload: { order_id: string; value_fils: number; items: unknown[] };
  }>;
  metaUploadCalls: Array<{ creds: unknown; payload: unknown }>;
  tiktokUploadCalls: Array<{ creds: unknown; payload: unknown }>;
}

interface Harness {
  deps: ConversionWorkerDeps;
  state: HarnessState;
  setUploadImpl: (impl: () => Promise<{ status: number; body: unknown }>) => void;
  setMetaUploadImpl: (impl: () => Promise<{ status: number; body: unknown }>) => void;
  setTiktokUploadImpl: (impl: () => Promise<{ status: number; body: unknown }>) => void;
}

function makeHarness(opts: {
  order: Order | null;
  channels: SalesChannel[];
}): Harness {
  const state: HarnessState = {
    deliverySaves: [],
    uploadCalls: [],
    metaUploadCalls: [],
    tiktokUploadCalls: [],
  };

  let uploadImpl: () => Promise<{ status: number; body: unknown }> = () =>
    Promise.resolve({ status: 200, body: { ok: true } });
  let metaUploadImpl: () => Promise<{ status: number; body: unknown }> = () =>
    Promise.resolve({ status: 200, body: { events_received: 1 } });
  let tiktokUploadImpl: () => Promise<{ status: number; body: unknown }> = () =>
    Promise.resolve({ status: 200, body: { code: 0 } });

  const orderRepo = {
    findOne: mock((_args: unknown) => Promise.resolve(opts.order)),
  } as unknown as Repository<Order>;

  const userRepo = {
    findOne: mock((_args: unknown) => Promise.resolve(null)),
  } as unknown as Repository<User>;

  const salesChannelRepo = {
    find: mock((_args: unknown) => Promise.resolve(opts.channels)),
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

  const googleAdsAdapter = {
    uploadEnhancedConversion: mock(
      (
        creds: typeof validGoogleAdsBlob,
        payload: { order_id: string; value_fils: number; items: unknown[] },
      ) => {
        state.uploadCalls.push({ creds, payload });
        return uploadImpl();
      },
    ),
  } as unknown as GoogleAdsAdapter;

  const metaAdapter = {
    uploadConversion: mock((creds: unknown, payload: unknown) => {
      state.metaUploadCalls.push({ creds, payload });
      return metaUploadImpl();
    }),
  } as unknown as MetaAdapter;

  const tiktokAdapter = {
    uploadConversion: mock((creds: unknown, payload: unknown) => {
      state.tiktokUploadCalls.push({ creds, payload });
      return tiktokUploadImpl();
    }),
  } as unknown as TiktokAdapter;

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
      orderRepo,
      userRepo,
      salesChannelRepo,
      channelDeliveryRepo,
      encryption,
      googleAdsAdapter,
      metaAdapter,
      tiktokAdapter,
    },
    setUploadImpl: (impl) => {
      uploadImpl = impl;
    },
    setMetaUploadImpl: (impl) => {
      metaUploadImpl = impl;
    },
    setTiktokUploadImpl: (impl) => {
      tiktokUploadImpl = impl;
    },
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("handleConversion — skip paths", () => {
  it("returns skipped when the order is not found", async () => {
    const harness = makeHarness({ order: null, channels: [makeChannel()] });

    const result = await handleConversion({ orderId: "missing" }, 0, harness.deps);

    expect(result.status).toBe("skipped");
    expect(harness.state.deliverySaves).toHaveLength(0);
    expect(harness.state.uploadCalls).toHaveLength(0);
  });

  it("returns skipped when the order is refunded", async () => {
    const order = makeOrder({
      payment_status: "refunded",
    } as unknown as Partial<Order>);
    const harness = makeHarness({ order, channels: [makeChannel()] });

    const result = await handleConversion({ orderId: order.id }, 0, harness.deps);

    expect(result.status).toBe("skipped");
    expect(harness.state.deliverySaves).toHaveLength(0);
    expect(harness.state.uploadCalls).toHaveLength(0);
  });

  it("returns skipped when there are no enabled channels", async () => {
    const order = makeOrder();
    const harness = makeHarness({ order, channels: [] });

    const result = await handleConversion({ orderId: order.id }, 0, harness.deps);

    expect(result.status).toBe("skipped");
    expect(harness.state.deliverySaves).toHaveLength(0);
    expect(harness.state.uploadCalls).toHaveLength(0);
  });

  it("returns skipped when the enabled channel has no googleAds credentials", async () => {
    const order = makeOrder();
    const channel = makeChannel({ credentials_encrypted: encryptedNoAdsBlob });
    const harness = makeHarness({ order, channels: [channel] });

    const result = await handleConversion({ orderId: order.id }, 0, harness.deps);

    expect(result.status).toBe("skipped");
    expect(harness.state.deliverySaves).toHaveLength(0);
    expect(harness.state.uploadCalls).toHaveLength(0);
  });

  it("skips channels without credentials_encrypted at all", async () => {
    const order = makeOrder();
    const channel = makeChannel({ credentials_encrypted: null });
    const harness = makeHarness({ order, channels: [channel] });

    const result = await handleConversion({ orderId: order.id }, 0, harness.deps);

    expect(result.status).toBe("skipped");
    expect(harness.state.uploadCalls).toHaveLength(0);
  });
});

describe("handleConversion — success path", () => {
  it("writes a channel_deliveries row with kind=conversion, status=success, dedup_event_id=order.id", async () => {
    const order = makeOrder();
    const channel = makeChannel();
    const harness = makeHarness({ order, channels: [channel] });

    const result = await handleConversion({ orderId: order.id }, 0, harness.deps);

    expect(result.status).toBe("success");
    expect(harness.state.uploadCalls).toHaveLength(1);
    expect(harness.state.uploadCalls[0]?.creds.customerId).toBe(validGoogleAdsBlob.customerId);
    expect(harness.state.uploadCalls[0]?.payload.order_id).toBe(order.id);
    expect(harness.state.uploadCalls[0]?.payload.value_fils).toBe(order.grand_total);

    // Two saves: initial "running" insert, then update to "success".
    expect(harness.state.deliverySaves.length).toBe(2);
    const final = harness.state.deliverySaves[1];
    expect(final?.status).toBe("success");
    // `kind` is typed as `ChannelDeliveryKind` enum; cast the string literal
    // through the enum-narrowing window so the matcher matches the union.
    expect(final?.kind as string).toBe("conversion");
    expect(final?.event_name).toBe("Purchase");
    expect(final?.order_id).toBe(order.id);
    expect(final?.dedup_event_id).toBe(order.id);
    expect(final?.response_status).toBe(200);
    expect(final?.latency_ms).toBeGreaterThanOrEqual(0);
    expect(final?.attempt).toBe(1);
  });

  it("hydrates the payload with customer + items + currency", async () => {
    const order = makeOrder({
      currency: "USD",
      grand_total: 50000,
      items: [
        makeItem({ product_id: "prod-A", variant_id: "var-A1", quantity: 2, unit_price: 15000 }),
        makeItem({ product_id: "prod-B", variant_id: null, quantity: 1, unit_price: 20000 }),
      ],
    } as unknown as Partial<Order>);
    const harness = makeHarness({ order, channels: [makeChannel()] });

    await handleConversion({ orderId: order.id }, 0, harness.deps);

    const payload = harness.state.uploadCalls[0]?.payload as unknown as {
      currency: string;
      value_fils: number;
      customer: { email: string; phone: string; first_name: string; last_name: string };
      items: Array<{ offer_id: string; quantity: number; price_fils: number }>;
      gclid: string | null;
    };
    expect(payload.currency).toBe("USD");
    expect(payload.value_fils).toBe(50000);
    expect(payload.customer.email).toBe("buyer@example.com");
    expect(payload.customer.phone).toBe("+971501234567");
    expect(payload.customer.first_name).toBe("Ada");
    expect(payload.customer.last_name).toBe("Lovelace");
    expect(payload.items).toEqual([
      { offer_id: "var-A1", quantity: 2, price_fils: 15000 },
      { offer_id: "prod-B", quantity: 1, price_fils: 20000 },
    ]);
    // Phase 1b: gclid is null until checkout plumbs it through.
    expect(payload.gclid).toBeNull();
  });

  it("uses attemptsMade + 1 for the attempt column", async () => {
    const order = makeOrder();
    const harness = makeHarness({ order, channels: [makeChannel()] });

    await handleConversion({ orderId: order.id }, 3, harness.deps);

    const final = harness.state.deliverySaves[harness.state.deliverySaves.length - 1];
    expect(final?.attempt).toBe(4);
  });
});

describe("handleConversion — failure path", () => {
  it("writes a failed delivery and re-throws so BullMQ retries", async () => {
    const order = makeOrder();
    const harness = makeHarness({ order, channels: [makeChannel()] });
    harness.setUploadImpl(() =>
      Promise.reject(Object.assign(new Error("ads-down"), { status: 503 })),
    );

    await expect(handleConversion({ orderId: order.id }, 0, harness.deps)).rejects.toThrow(
      "ads-down",
    );

    expect(harness.state.deliverySaves.length).toBe(2);
    const final = harness.state.deliverySaves[1];
    expect(final?.status).toBe("failed");
    expect(final?.error_message).toContain("ads-down");
    expect(final?.latency_ms).toBeGreaterThanOrEqual(0);
  });
});

describe("handleConversion — partial outcome", () => {
  it("returns 'partial' (does not throw) when one of two channels succeeds and one fails", async () => {
    const order = makeOrder();
    const channelA = makeChannel({ id: "channel-A" });
    const channelB = makeChannel({ id: "channel-B" });
    const harness = makeHarness({ order, channels: [channelA, channelB] });

    let call = 0;
    harness.setUploadImpl(() => {
      call += 1;
      if (call === 1) return Promise.resolve({ status: 200, body: { ok: true } });
      return Promise.reject(new Error("second-failed"));
    });

    const result = await handleConversion({ orderId: order.id }, 0, harness.deps);

    expect(result.status).toBe("partial");
    expect(harness.state.uploadCalls).toHaveLength(2);
    // 4 saves: running+success for A, running+failed for B.
    expect(harness.state.deliverySaves).toHaveLength(4);
    const statuses = harness.state.deliverySaves.map((d) => d.status);
    expect(statuses).toEqual(["running", "success", "running", "failed"]);
  });
});

describe("handleConversion — all-failed throws", () => {
  it("throws the first error when every eligible channel fails", async () => {
    const order = makeOrder();
    const channelA = makeChannel({ id: "channel-A" });
    const channelB = makeChannel({ id: "channel-B" });
    const harness = makeHarness({ order, channels: [channelA, channelB] });

    let call = 0;
    harness.setUploadImpl(() => {
      call += 1;
      return Promise.reject(new Error(call === 1 ? "first-failed" : "second-failed"));
    });

    await expect(handleConversion({ orderId: order.id }, 0, harness.deps)).rejects.toThrow(
      "first-failed",
    );

    expect(harness.state.uploadCalls).toHaveLength(2);
    expect(harness.state.deliverySaves).toHaveLength(4);
    const finalStatuses = harness.state.deliverySaves
      .filter((_, i) => i % 2 === 1)
      .map((d) => d.status);
    expect(finalStatuses).toEqual(["failed", "failed"]);
  });
});

describe("handleConversion — Meta + multi-channel fan-out", () => {
  it("fires CAPI for meta_catalog when only Meta is enabled and credentialed", async () => {
    const metaChannel = makeChannel({
      id: "ch-meta",
      code: "meta_catalog",
      credentials_encrypted: "encrypted-meta",
    } as unknown as Partial<SalesChannel>);
    const harness = makeHarness({
      order: makeOrder({ id: "ord-1", payment_status: "captured" } as unknown as Partial<Order>),
      channels: [metaChannel],
    });
    (
      harness.deps.encryption.decryptObject as unknown as ReturnType<typeof mock>
    ).mockImplementation(() => ({
      pixelId: "p",
      catalogId: "c",
      businessId: "b",
      accessToken: "tok",
    }));

    const result = await handleConversion({ orderId: "ord-1" }, 0, harness.deps);

    expect(result.status).toBe("success");
    expect(harness.state.metaUploadCalls).toHaveLength(1);
    expect(harness.state.uploadCalls).toHaveLength(0);
    // The delivery row is keyed by order.id for both browser-Pixel + CAPI dedup.
    const deliveryCreated = harness.state.deliverySaves[0];
    expect(deliveryCreated?.kind as string).toBe("conversion");
    expect(deliveryCreated?.event_name).toBe("Purchase");
    expect(deliveryCreated?.order_id).toBe("ord-1");
    expect(deliveryCreated?.dedup_event_id).toBe("ord-1");
    const finalDelivery = harness.state.deliverySaves.at(-1);
    expect(finalDelivery?.status).toBe("success");
  });

  it("fans out to BOTH google_merchant and meta_catalog when both are enabled and credentialed", async () => {
    const googleChannel = makeChannel({
      id: "ch-google",
      code: "google_merchant",
      credentials_encrypted: "encrypted-google",
    } as unknown as Partial<SalesChannel>);
    const metaChannel = makeChannel({
      id: "ch-meta",
      code: "meta_catalog",
      credentials_encrypted: "encrypted-meta",
    } as unknown as Partial<SalesChannel>);
    const harness = makeHarness({
      order: makeOrder({ id: "ord-2", payment_status: "captured" } as unknown as Partial<Order>),
      channels: [googleChannel, metaChannel],
    });
    // Per-ciphertext decrypt dispatch.
    (
      harness.deps.encryption.decryptObject as unknown as ReturnType<typeof mock>
    ).mockImplementation((blob: string) => {
      if (blob === "encrypted-google") {
        return {
          merchantCenter: {
            merchantId: "1",
            serviceAccount: { client_email: "a@b", private_key: "pk" },
          },
          googleAds: {
            developerToken: "dev",
            customerId: "111",
            conversionActionId: "999",
            oauthClient: { clientId: "c", clientSecret: "s", refreshToken: "r" },
          },
        };
      }
      return { pixelId: "p", catalogId: "c", businessId: "b", accessToken: "tok" };
    });

    const result = await handleConversion({ orderId: "ord-2" }, 0, harness.deps);

    expect(result.status).toBe("success");
    expect(harness.state.uploadCalls).toHaveLength(1); // Google fired
    expect(harness.state.metaUploadCalls).toHaveLength(1); // Meta fired
    // Two channels → 4 saves total (running + success per channel).
    expect(harness.state.deliverySaves).toHaveLength(4);
    expect(harness.state.deliverySaves.filter((d) => d.status === "success")).toHaveLength(2);
  });

  it("returns 'partial' when Google succeeds but Meta fails", async () => {
    const googleChannel = makeChannel({
      id: "ch-google",
      code: "google_merchant",
      credentials_encrypted: "encrypted-google",
    } as unknown as Partial<SalesChannel>);
    const metaChannel = makeChannel({
      id: "ch-meta",
      code: "meta_catalog",
      credentials_encrypted: "encrypted-meta",
    } as unknown as Partial<SalesChannel>);
    const harness = makeHarness({
      order: makeOrder({ id: "ord-3", payment_status: "captured" } as unknown as Partial<Order>),
      channels: [googleChannel, metaChannel],
    });
    (
      harness.deps.encryption.decryptObject as unknown as ReturnType<typeof mock>
    ).mockImplementation((blob: string) =>
      blob === "encrypted-google"
        ? {
            merchantCenter: {
              merchantId: "1",
              serviceAccount: { client_email: "a@b", private_key: "k" },
            },
            googleAds: {
              developerToken: "d",
              customerId: "111",
              conversionActionId: "9",
              oauthClient: { clientId: "c", clientSecret: "s", refreshToken: "r" },
            },
          }
        : { pixelId: "p", catalogId: "c", businessId: "b", accessToken: "t" },
    );
    harness.setMetaUploadImpl(() =>
      Promise.reject(Object.assign(new Error("meta_capi_failed 500"), { status: 500, body: {} })),
    );

    const result = await handleConversion({ orderId: "ord-3" }, 0, harness.deps);
    expect(result.status).toBe("partial");
    expect(harness.state.uploadCalls).toHaveLength(1);
    expect(harness.state.metaUploadCalls).toHaveLength(1);
  });

  it("skips meta_catalog channels with no credentials (does not throw)", async () => {
    const metaChannel = makeChannel({
      id: "ch-meta",
      code: "meta_catalog",
      credentials_encrypted: null,
    } as unknown as Partial<SalesChannel>);
    const harness = makeHarness({
      order: makeOrder({ id: "ord-4", payment_status: "captured" } as unknown as Partial<Order>),
      channels: [metaChannel],
    });

    const result = await handleConversion({ orderId: "ord-4" }, 0, harness.deps);

    expect(result.status).toBe("skipped");
    expect(harness.state.metaUploadCalls).toHaveLength(0);
    expect(harness.state.uploadCalls).toHaveLength(0);
  });

  it("skips meta_catalog channels with malformed credentials (does not throw, no BullMQ retry storm)", async () => {
    const metaChannel = makeChannel({
      id: "ch-meta",
      code: "meta_catalog",
      credentials_encrypted: "encrypted-bad-blob",
    } as unknown as Partial<SalesChannel>);
    const harness = makeHarness({
      order: makeOrder({ id: "ord-bad", payment_status: "captured" } as unknown as Partial<Order>),
      channels: [metaChannel],
    });
    (
      harness.deps.encryption.decryptObject as unknown as ReturnType<typeof mock>
    ).mockImplementation(
      // Wrong shape — e.g. someone uploaded a Google-shape blob to meta_catalog.
      () => ({ merchantId: "1", serviceAccount: { client_email: "a", private_key: "b" } }),
    );

    const result = await handleConversion({ orderId: "ord-bad" }, 0, harness.deps);

    // Result is "skipped" because outcomes.length === 0 — the channel was
    // silently bypassed instead of throwing and triggering BullMQ retries.
    expect(result.status).toBe("skipped");
    expect(harness.state.metaUploadCalls).toHaveLength(0);
  });
});

describe("handleConversion — tiktok channel", () => {
  it("dispatches tiktok adapter when a tiktok channel has valid creds", async () => {
    const tiktokChannel = makeChannel({
      id: "ch-tt",
      code: "tiktok" as SalesChannel["code"],
      credentials_encrypted: "encrypted-tt-blob",
    } as unknown as Partial<SalesChannel>);
    const harness = makeHarness({
      order: makeOrder({ id: "ord-tt-1", payment_status: "captured" } as unknown as Partial<Order>),
      channels: [tiktokChannel],
    });
    (
      harness.deps.encryption.decryptObject as unknown as ReturnType<typeof mock>
    ).mockImplementation(() => ({
      pixelCode: "CK2X",
      catalogId: "ttcat",
      accessToken: "ttkn",
    }));

    const result = await handleConversion({ orderId: "ord-tt-1" }, 0, harness.deps);

    expect(result.status).toBe("success");
    expect(harness.state.tiktokUploadCalls).toHaveLength(1);
    // Delivery row written and finalized successful.
    const tiktokDeliveries = harness.state.deliverySaves.filter((d) => d.channel_id === "ch-tt");
    // Two saves per channel: running + success.
    expect(tiktokDeliveries).toHaveLength(2);
    const finalTiktok = tiktokDeliveries[1];
    expect(finalTiktok?.status).toBe("success");
    expect(finalTiktok?.dedup_event_id).toBe("ord-tt-1");
    expect(finalTiktok?.event_name).toBe("Purchase");
  });

  it("malformed tiktok creds short-circuit silently (no dispatch, no delivery row, no BullMQ retry storm)", async () => {
    const tiktokChannel = makeChannel({
      id: "ch-tt",
      code: "tiktok" as SalesChannel["code"],
      credentials_encrypted: "encrypted-tt-blob",
    } as unknown as Partial<SalesChannel>);
    const harness = makeHarness({
      order: makeOrder({ id: "ord-tt-2", payment_status: "captured" } as unknown as Partial<Order>),
      channels: [tiktokChannel],
    });
    (harness.deps.encryption.decryptObject as unknown as ReturnType<typeof mock>)
      // Wrong shape — missing required fields. Mirrors Phase 2's malformed-Meta
      // test: result is "skipped" because outcomes.length === 0 (silent bypass,
      // not throw → no BullMQ retry storm on operator error).
      .mockImplementation(() => ({ wrongShape: true }));

    const result = await handleConversion({ orderId: "ord-tt-2" }, 0, harness.deps);

    expect(result.status).toBe("skipped");
    expect(harness.state.tiktokUploadCalls).toHaveLength(0);
    // No delivery row at all — the channel was bypassed before runChannelDispatch.
    expect(harness.state.deliverySaves.filter((d) => d.channel_id === "ch-tt")).toHaveLength(0);
  });

  it("multi-channel fan-out fires all three channels for one order", async () => {
    const googleChannel = makeChannel({
      id: "ch-g",
      code: "google_merchant",
      credentials_encrypted: "g-blob",
    } as unknown as Partial<SalesChannel>);
    const metaChannel = makeChannel({
      id: "ch-m",
      code: "meta_catalog" as SalesChannel["code"],
      credentials_encrypted: "m-blob",
    } as unknown as Partial<SalesChannel>);
    const tiktokChannel = makeChannel({
      id: "ch-tt",
      code: "tiktok" as SalesChannel["code"],
      credentials_encrypted: "tt-blob",
    } as unknown as Partial<SalesChannel>);
    const harness = makeHarness({
      order: makeOrder({
        id: "ord-multi",
        payment_status: "captured",
      } as unknown as Partial<Order>),
      channels: [googleChannel, metaChannel, tiktokChannel],
    });
    (
      harness.deps.encryption.decryptObject as unknown as ReturnType<typeof mock>
    ).mockImplementation((blob: string) => {
      if (blob === "g-blob") {
        return {
          merchantCenter: {
            merchantId: "mc-1",
            serviceAccount: { client_email: "x@y", private_key: "p" },
          },
          googleAds: {
            developerToken: "dev",
            customerId: "1234567890",
            conversionActionId: "9876543210",
            oauthClient: { clientId: "c", clientSecret: "s", refreshToken: "r" },
          },
        };
      }
      if (blob === "m-blob") {
        return {
          pixelId: "1",
          catalogId: "2",
          businessId: "3",
          accessToken: "tok",
        };
      }
      return { pixelCode: "CK2X", catalogId: "ttcat", accessToken: "ttkn" };
    });

    const result = await handleConversion({ orderId: "ord-multi" }, 0, harness.deps);

    expect(result.status).toBe("success");
    expect(harness.state.uploadCalls).toHaveLength(1);
    expect(harness.state.metaUploadCalls).toHaveLength(1);
    expect(harness.state.tiktokUploadCalls).toHaveLength(1);
    // Three channels × 2 saves each (running + success) = 6 total.
    expect(harness.state.deliverySaves).toHaveLength(6);
    expect(harness.state.deliverySaves.filter((d) => d.status === "success")).toHaveLength(3);
  });

  it("returns 'partial' when tiktok fails but google succeeds", async () => {
    const googleChannel = makeChannel({
      id: "ch-g",
      code: "google_merchant",
      credentials_encrypted: "g-blob",
    } as unknown as Partial<SalesChannel>);
    const tiktokChannel = makeChannel({
      id: "ch-tt",
      code: "tiktok" as SalesChannel["code"],
      credentials_encrypted: "tt-blob",
    } as unknown as Partial<SalesChannel>);
    const harness = makeHarness({
      order: makeOrder({
        id: "ord-mixed",
        payment_status: "captured",
      } as unknown as Partial<Order>),
      channels: [googleChannel, tiktokChannel],
    });
    (
      harness.deps.encryption.decryptObject as unknown as ReturnType<typeof mock>
    ).mockImplementation((blob: string) =>
      blob === "g-blob"
        ? {
            merchantCenter: {
              merchantId: "mc",
              serviceAccount: { client_email: "x@y", private_key: "p" },
            },
            googleAds: {
              developerToken: "dev",
              customerId: "1",
              conversionActionId: "2",
              oauthClient: { clientId: "c", clientSecret: "s", refreshToken: "r" },
            },
          }
        : { pixelCode: "CK2X", catalogId: "ttcat", accessToken: "ttkn" },
    );
    harness.setTiktokUploadImpl(() =>
      Promise.reject(
        Object.assign(new Error("tiktok_events_api_failed 502"), {
          status: 502,
          body: { code: 50000, message: "Internal error" },
        }),
      ),
    );

    const result = await handleConversion({ orderId: "ord-mixed" }, 0, harness.deps);

    expect(result.status).toBe("partial");
    expect(harness.state.uploadCalls).toHaveLength(1);
    expect(harness.state.tiktokUploadCalls).toHaveLength(1);
    expect(harness.state.deliverySaves.filter((d) => d.status === "success")).toHaveLength(1);
    expect(harness.state.deliverySaves.filter((d) => d.status === "failed")).toHaveLength(1);
  });
});
