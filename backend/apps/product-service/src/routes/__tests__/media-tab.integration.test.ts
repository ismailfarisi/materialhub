/**
 * Integration tests — media tab endpoints (admin & vendor).
 *
 * Pattern: self-contained Elysia apps built with mock service stubs.
 * No real DB, Redis, S3, or BullMQ required — all dependencies are
 * injected as in-memory fakes, matching the convention from
 * internal-products.integration.test.ts and internal-inventory.integration.test.ts.
 *
 * Auth (admin tests): tokens signed via @elysiajs/jwt with the same secret read by
 * jwtAuth (config.jwt.accessSecret — defaults to "dev-access-secret" in dev/test).
 *
 * Vendor tests: bypass jwtAuth (vendor role is not in JWT VALID_ROLES per Phase 3a),
 * injecting member context directly via .derive() — mirrors how the real vendor routes
 * use vendorMembership guard.
 *
 * AppDataSource.transaction: mocked via bun:test mock.module so reorderMediaInternal
 * does not require a live Postgres connection.
 */

import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { Elysia, t } from "elysia";
import { MediaController } from "../../domain/media/media.controller.ts";

// ─── Mock AppDataSource.transaction so reorderMediaInternal doesn't need Postgres ─

// We intercept the transaction call and execute the callback with a fake manager
// that records calls, so the controller logic can run without a real DB.
const fakeManagerUpdates: Array<{
  entity: string;
  criteria: any;
  values: any;
}> = [];
const fakeManager = {
  update: mock(async (Entity: any, criteria: any, values: any) => {
    fakeManagerUpdates.push({
      entity: Entity?.name ?? String(Entity),
      criteria,
      values,
    });
  }),
};

// Reversible monkey-patch on AppDataSource — `mock.module` would pollute the
// module cache for the entire test process, breaking unrelated test files (e.g.
// product.service.search.test.ts) that import entity classes from this module.
import { AppDataSource } from "@materialhub/database";

// biome-ignore lint/suspicious/noExplicitAny: capture for restore in afterAll
const originalTransaction = (AppDataSource as any).transaction;
// biome-ignore lint/suspicious/noExplicitAny: capture for restore in afterAll
const originalQuery = (AppDataSource as any).query;

beforeAll(() => {
  // biome-ignore lint/suspicious/noExplicitAny: deliberate patch for test
  (AppDataSource as any).transaction = async (cb: (manager: any) => Promise<void>) => {
    fakeManagerUpdates.length = 0;
    await cb(fakeManager);
  };
  // biome-ignore lint/suspicious/noExplicitAny: deliberate patch for test
  (AppDataSource as any).query = async () => [];
});

afterAll(() => {
  // biome-ignore lint/suspicious/noExplicitAny: restore originals to keep module cache clean
  (AppDataSource as any).transaction = originalTransaction;
  // biome-ignore lint/suspicious/noExplicitAny: restore originals to keep module cache clean
  (AppDataSource as any).query = originalQuery;
});

// ─── Shared fake UUIDs ────────────────────────────────────────────────────────

const PRODUCT_ID = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const VENDOR_ID = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const USER_ID = "cccccccc-cccc-4ccc-cccc-cccccccccccc";
const IMG_ID_0 = "dddddddd-dddd-4ddd-dddd-dddddddddddd";
const IMG_ID_1 = "eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee";
const IMG_ID_2 = "ffffffff-ffff-4fff-ffff-ffffffffffff";

// ─── Fake service / repo stubs ────────────────────────────────────────────────

function makeImages() {
  return [
    {
      id: IMG_ID_0,
      product_id: PRODUCT_ID,
      sort_order: 0,
      is_primary: true,
      url: "https://cdn.example.com/img0.webp",
      thumbnail_url: null,
      card_url: null,
      medium_url: null,
      alt_text: null,
      focal_x: null,
      focal_y: null,
      variant_id: null,
      ai_source_image_id: null,
      width: 800,
      height: 600,
      mime_type: "image/webp",
      file_size: 12345,
    },
    {
      id: IMG_ID_1,
      product_id: PRODUCT_ID,
      sort_order: 1,
      is_primary: false,
      url: "https://cdn.example.com/img1.webp",
      thumbnail_url: null,
      card_url: null,
      medium_url: null,
      alt_text: null,
      focal_x: null,
      focal_y: null,
      variant_id: null,
      ai_source_image_id: null,
      width: 800,
      height: 600,
      mime_type: "image/webp",
      file_size: 12345,
    },
    {
      id: IMG_ID_2,
      product_id: PRODUCT_ID,
      sort_order: 2,
      is_primary: false,
      url: "https://cdn.example.com/img2.webp",
      thumbnail_url: null,
      card_url: null,
      medium_url: null,
      alt_text: null,
      focal_x: null,
      focal_y: null,
      variant_id: null,
      ai_source_image_id: null,
      width: 800,
      height: 600,
      mime_type: "image/webp",
      file_size: 12345,
    },
  ];
}

function makeImageRepo(images = makeImages()) {
  const store = images.map((i) => ({ ...i }));
  return {
    findByProductId: mock(async (_productId: string) => [...store]),
    findById: mock(async (id: string) => store.find((i) => i.id === id) ?? null),
    findProductOwner: mock(async (_productId: string) => VENDOR_ID),
    save: mock(async (data: any) => ({ id: crypto.randomUUID(), ...data })),
    softRemove: mock(async () => {}),
    updateFields: mock(async (id: string, fields: any) => {
      const img = store.find((i) => i.id === id);
      if (img) Object.assign(img, fields);
    }),
    findByIdIncludingDeleted: mock(async () => null),
    hardDelete: mock(async () => {}),
    _store: store,
  };
}

function makeVideoRepo() {
  const store: any[] = [];
  return {
    findByProductId: mock(async () => []),
    findById: mock(async (id: string) => store.find((v) => v.id === id) ?? null),
    maxSortOrder: mock(async () => 0),
    create: mock(async (data: any) => {
      const row = { id: crypto.randomUUID(), ...data };
      store.push(row);
      return row;
    }),
    updateFields: mock(async () => {}),
    softRemove: mock(async () => {}),
    findProductOwner: mock(async () => VENDOR_ID),
    _store: store,
  };
}

function makeMediaService() {
  return {
    processImage: mock(async (_key: string) => ({
      large: {
        url: "https://cdn.example.com/large.webp",
        width: 800,
        height: 600,
        fileSize: 100,
      },
      thumb: {
        url: "https://cdn.example.com/thumb.webp",
        width: 80,
        height: 60,
        fileSize: 10,
      },
      card: {
        url: "https://cdn.example.com/card.webp",
        width: 400,
        height: 300,
        fileSize: 50,
      },
      medium: {
        url: "https://cdn.example.com/medium.webp",
        width: 400,
        height: 300,
        fileSize: 50,
      },
    })),
    processImageWithCrop: mock(async () => ({
      large: {
        url: "https://cdn.example.com/large.webp",
        width: 800,
        height: 600,
        fileSize: 100,
      },
      thumb: {
        url: "https://cdn.example.com/thumb.webp",
        width: 80,
        height: 60,
        fileSize: 10,
      },
      card: {
        url: "https://cdn.example.com/card.webp",
        width: 400,
        height: 300,
        fileSize: 50,
      },
      medium: {
        url: "https://cdn.example.com/medium.webp",
        width: 400,
        height: 300,
        fileSize: 50,
      },
    })),
    generatePresignedUrlForAsset: mock(async () => ({
      uploadUrl: "https://s3.example.com/upload",
      key: "pending/test.jpg",
      expiresAt: new Date(),
    })),
    generateVideoPresignedUrl: mock(async () => ({
      uploadUrl: "https://s3.example.com/upload-video",
      key: "pending-video/test.mp4",
      expiresAt: new Date(),
    })),
    deleteMediaByPrefix: mock(async () => {}),
    extractKeyFromPublicUrl: mock((_url: string) => "processed/uuid/large.webp"),
    getKycSignedUrl: mock(async () => ({
      url: "https://s3.example.com/kyc",
      expiresAt: new Date(),
    })),
    processAssetImage: mock(async () => ({
      url: "https://cdn.example.com/asset.webp",
    })),
  };
}

function makeVendorLookup() {
  return {
    findVendorIdByUserId: mock(async (_userId: string) => VENDOR_ID),
  };
}

function makeVideoQueue() {
  return { add: mock(async () => {}) };
}

function makeAiEnhance() {
  return {
    enhance: mock(async () => ({
      noChangeDetected: false,
      processed: {
        large: {
          url: "https://cdn.example.com/enh-large.webp",
          width: 800,
          height: 600,
          fileSize: 100,
        },
        thumb: {
          url: "https://cdn.example.com/enh-thumb.webp",
          width: 80,
          height: 60,
          fileSize: 10,
        },
        card: {
          url: "https://cdn.example.com/enh-card.webp",
          width: 400,
          height: 300,
          fileSize: 50,
        },
        medium: {
          url: "https://cdn.example.com/enh-medium.webp",
          width: 400,
          height: 300,
          fileSize: 50,
        },
      },
      candidateRawKey: "pending/candidate.jpg",
    })),
  };
}

function makeAiSettings(enabled = true) {
  return {
    get: mock(async () => ({
      enabled,
      model: "gemini-2.5-flash-image",
      prompt: "enhance this",
      per_vendor_monthly_cap: 200,
      per_vendor_per_minute_cap: 5,
    })),
    update: mock(async () => {}),
  };
}

function makeAiUsage() {
  return {
    getMonthCount: mock(async () => 0),
    increment: mock(async () => {}),
    decrement: mock(async () => {}),
  };
}

// ─── App builders ──────────────────────────────────────────────────────────────

/**
 * Admin app — uses jwtAuth for real JWT verification.
 * Adds an onError hook that maps errors with a numeric statusCode property
 * (e.g. the 503 thrown by enhanceImageInternal when AI is disabled) to the
 * correct HTTP status code.
 */
function buildAdminApp(opts: { aiEnabled?: boolean; images?: ReturnType<typeof makeImages> } = {}) {
  const imageRepo = makeImageRepo(opts.images);
  const videoRepo = makeVideoRepo();
  const mediaService = makeMediaService();
  const vendorLookup = makeVendorLookup();
  const videoQueue = makeVideoQueue();
  const aiEnhance = makeAiEnhance();
  const aiSettings = makeAiSettings(opts.aiEnabled ?? true);
  const aiUsage = makeAiUsage();

  const mediaController = new MediaController(
    mediaService as any,
    imageRepo as any,
    vendorLookup as any,
    videoRepo as any,
    videoQueue as any,
    aiEnhance as any,
    aiSettings as any,
    aiUsage as any,
  );

  // Inject the admin user via .derive() — bypasses jwtAuth to avoid cross-test
  // module pollution where another test (typesense-search.adapter.test.ts) mocks
  // `@materialhub/config` and leaves jwtAuth's secret in an undefined state for the
  // remainder of the Bun test process.
  const app = new Elysia()
    .derive(() => ({
      user: { id: USER_ID, email: "admin@materialhubuae.com", role: "admin" as const },
    }))
    .decorate("mediaController", mediaController)
    // Unified error handler: covers HttpError (400/403/404), plain errors with
    // a statusCode property (503 when AI disabled, 429 for rate limits), and
    // Elysia VALIDATION errors — matching what errorHandler from @materialhub/plugins does.
    .onError(({ code, error, set }) => {
      // biome-ignore lint/suspicious/noExplicitAny: mapped error shape
      const e = error as any;
      if (typeof e?.statusCode === "number") {
        set.status = e.statusCode;
        return {
          statusCode: e.statusCode,
          error: e.code ?? e.message,
          message: e.message,
          timestamp: new Date().toISOString(),
        };
      }
      const statusCode =
        code === "NOT_FOUND" ? 404 : code === "VALIDATION" ? 400 : code === "PARSE" ? 400 : 500;
      set.status = statusCode;
      return {
        statusCode,
        error: code,
        message: statusCode === 500 ? "Internal server error" : (e?.message ?? "Error"),
        timestamp: new Date().toISOString(),
      };
    })

    // GET /admin/products/:id/media
    .get(
      "/admin/products/:id/media",
      async ({ params, mediaController: mc }: any) => {
        const data = await mc.getProductMedia(params.id);
        return { statusCode: 200, data, timestamp: new Date().toISOString() };
      },
      { params: t.Object({ id: t.String() }) },
    )

    // PATCH /admin/products/:id/media/reorder
    .patch(
      "/admin/products/:id/media/reorder",
      async ({ params, body, user, mediaController: mc }: any) => {
        await mc.reorderMedia(user!.role, params.id, body.items, user!);
        return {
          statusCode: 200,
          message: "Reordered",
          timestamp: new Date().toISOString(),
        };
      },
      {
        params: t.Object({ id: t.String() }),
        body: t.Object({
          items: t.Array(
            t.Object({
              id: t.String(),
              kind: t.Union([t.Literal("image"), t.Literal("video")]),
              sort_order: t.Number({ minimum: 0 }),
            }),
          ),
        }),
      },
    )

    // POST /admin/products/:id/images/:imageId/enhance
    .post(
      "/admin/products/:id/images/:imageId/enhance",
      async ({ params, user, mediaController: mc }: any) => {
        const data = await mc.enhanceImage(user!.role, params.id, params.imageId, user!);
        return { statusCode: 200, data, timestamp: new Date().toISOString() };
      },
      { params: t.Object({ id: t.String(), imageId: t.String() }) },
    );

  return {
    app,
    imageRepo,
    videoRepo,
    mediaService,
    videoQueue,
    aiEnhance,
    aiSettings,
  };
}

/**
 * Vendor app — bypasses jwtAuth entirely and injects member context via .derive().
 * Mirrors how the real vendor product routes call ...Internal controller methods
 * (Phase 3a: vendor users carry role='customer', access gated by vendorMembership).
 * Calling ...Internal directly is the correct pattern for these tests.
 */
function buildVendorApp(opts: { ownerOfProduct?: boolean } = {}) {
  const imageRepo = makeImageRepo();
  // Make findProductOwner return VENDOR_ID or a different ID based on opts
  if (opts.ownerOfProduct === false) {
    imageRepo.findProductOwner = mock(async () => "other-vendor-id");
  }

  const videoRepo = makeVideoRepo();
  const mediaService = makeMediaService();
  const vendorLookup = makeVendorLookup();
  const videoQueue = makeVideoQueue();
  const aiEnhance = makeAiEnhance();
  const aiSettings = makeAiSettings(true);
  const aiUsage = makeAiUsage();

  const mediaController = new MediaController(
    mediaService as any,
    imageRepo as any,
    vendorLookup as any,
    videoRepo as any,
    videoQueue as any,
    aiEnhance as any,
    aiSettings as any,
    aiUsage as any,
  );

  const app = new Elysia()
    // Inline error handler — covers HttpError statusCode (400/403/404) and plain
    // errors with attached numeric statusCode. Avoids depending on the @materialhub/plugins
    // errorHandler whose `as: "scoped"` semantics don't propagate correctly to this
    // ad-hoc test app under Bun's test runner.
    .onError(({ code, error, set }) => {
      // biome-ignore lint/suspicious/noExplicitAny: mapped error shape
      const e = error as any;
      if (typeof e?.statusCode === "number") {
        set.status = e.statusCode;
        return {
          statusCode: e.statusCode,
          error: e.code ?? e.message,
          message: e.message,
          timestamp: new Date().toISOString(),
        };
      }
      const statusCode =
        code === "NOT_FOUND" ? 404 : code === "VALIDATION" ? 400 : code === "PARSE" ? 400 : 500;
      set.status = statusCode;
      return {
        statusCode,
        error: code,
        message: statusCode === 500 ? "Internal server error" : (e?.message ?? "Error"),
        timestamp: new Date().toISOString(),
      };
    })
    // Inject member context (no JWT needed — mirrors vendorMembership guard pattern)
    .derive(() => ({
      member: { vid: VENDOR_ID, r: "owner" as const },
    }))
    .decorate("mediaController", mediaController)

    // POST /vendor/products/:id/videos/process
    .post(
      "/vendor/products/:id/videos/process",
      async ({ params, body, member, mediaController: mc, set }: any) => {
        const data = await mc.processVideoInternal(params.id, member.vid, body);
        set.status = 202;
        return { statusCode: 202, data, timestamp: new Date().toISOString() };
      },
      {
        params: t.Object({ id: t.String() }),
        body: t.Object({ key: t.String({ minLength: 1 }) }),
      },
    )

    // POST /vendor/products/:id/videos/presign
    .post(
      "/vendor/products/:id/videos/presign",
      async ({ params, body, member, mediaController: mc }: any) => {
        const data = await mc.presignVideoInternal(params.id, member.vid, body);
        return { statusCode: 200, data, timestamp: new Date().toISOString() };
      },
      {
        params: t.Object({ id: t.String() }),
        body: t.Object({
          filename: t.String({ minLength: 1 }),
          content_type: t.String({ minLength: 1 }),
          size_bytes: t.Number({ minimum: 1 }),
        }),
      },
    );

  return { app, imageRepo, videoRepo, mediaService, videoQueue };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Media tab integration", () => {
  it("GET /admin/products/:id/media returns 3 ordered items", async () => {
    const { app } = buildAdminApp();

    const res = await app.handle(
      new Request(`http://localhost/admin/products/${PRODUCT_ID}/media`),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.items).toHaveLength(3);
    // Items are sorted by sort_order; the first image item should be sort_order 0
    const imageItems = body.data.items.filter((i: any) => i.kind === "image");
    expect(imageItems[0].sort_order).toBe(0);
  });

  it("PATCH /admin/products/:id/media/reorder changes sort_order and primary", async () => {
    const { app } = buildAdminApp();

    // Reverse order: previously-last image (IMG_ID_2) becomes sort_order 0
    const reorderPayload = {
      items: [
        { id: IMG_ID_2, kind: "image", sort_order: 0 },
        { id: IMG_ID_1, kind: "image", sort_order: 1 },
        { id: IMG_ID_0, kind: "image", sort_order: 2 },
      ],
    };

    const res = await app.handle(
      new Request(`http://localhost/admin/products/${PRODUCT_ID}/media/reorder`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(reorderPayload),
      }),
    );

    expect(res.status).toBe(200);

    // fakeManager.update records the transactional updates
    // The first call should set sort_order=0, is_primary=true for IMG_ID_2
    const img2Update = fakeManagerUpdates.find(
      (u) => u.criteria?.id === IMG_ID_2 && u.criteria?.product_id === PRODUCT_ID,
    );
    expect(img2Update).toBeDefined();
    expect(img2Update!.values.sort_order).toBe(0);
    expect(img2Update!.values.is_primary).toBe(true);
  });

  it("keeps the first image primary when a video occupies sort_order 0", async () => {
    const { app } = buildAdminApp();
    const VIDEO_ID = "11111111-1111-4111-1111-111111111111";

    const res = await app.handle(
      new Request(`http://localhost/admin/products/${PRODUCT_ID}/media/reorder`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items: [
            { id: VIDEO_ID, kind: "video", sort_order: 0 },
            { id: IMG_ID_1, kind: "image", sort_order: 1 },
            { id: IMG_ID_0, kind: "image", sort_order: 2 },
          ],
        }),
      }),
    );

    expect(res.status).toBe(200);

    const updateFor = (id: string) => fakeManagerUpdates.find((u) => u.criteria?.id === id);

    // The earliest image, not the item at sort_order 0, owns the primary flag.
    expect(updateFor(IMG_ID_1)!.values.is_primary).toBe(true);
    expect(updateFor(IMG_ID_0)!.values.is_primary).toBe(false);
    // Videos carry no primary flag at all.
    expect(updateFor(VIDEO_ID)!.values.is_primary).toBeUndefined();
  });

  it("POST /vendor/products/:id/videos/process returns 202 with placeholder", async () => {
    const { app, videoQueue } = buildVendorApp();

    const res = await app.handle(
      new Request(`http://localhost/vendor/products/${PRODUCT_ID}/videos/process`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: "pending-video/raw.mp4" }),
      }),
    );

    expect(res.status).toBe(202);
    const body = (await res.json()) as any;
    expect(body.data.video).toBeDefined();
    expect(body.data.video.status).toBe("processing");

    // BullMQ queue.add should have been called once with transcode job
    expect(videoQueue.add).toHaveBeenCalledTimes(1);
    const [queueName, payload] = (videoQueue.add as ReturnType<typeof mock>).mock.calls[0] as [
      string,
      any,
    ];
    expect(queueName).toBe("transcode");
    expect(payload.raw_key).toBe("pending-video/raw.mp4");
  });

  it("POST /vendor/products/:id/videos/presign rejects video > 50MB by size_bytes", async () => {
    const { app } = buildVendorApp();

    const oversizeBytes = 51 * 1024 * 1024; // 51 MB

    const res = await app.handle(
      new Request(`http://localhost/vendor/products/${PRODUCT_ID}/videos/presign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filename: "large.mp4",
          content_type: "video/mp4",
          size_bytes: oversizeBytes,
        }),
      }),
    );

    expect(res.status).toBe(400);
  });

  it("POST /admin/products/:id/images/:imageId/enhance returns 503 when AI disabled", async () => {
    const { app } = buildAdminApp({ aiEnabled: false });

    const res = await app.handle(
      new Request(`http://localhost/admin/products/${PRODUCT_ID}/images/${IMG_ID_0}/enhance`, {
        method: "POST",
      }),
    );

    expect(res.status).toBe(503);
  });
});
