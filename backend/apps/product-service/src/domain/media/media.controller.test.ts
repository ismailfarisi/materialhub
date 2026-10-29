import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { AppDataSource } from "@materialhub/database";
import type { AuthUser } from "@materialhub/guards";
import { MediaController } from "./media.controller.ts";

class FakeMedia {
  calls: unknown[] = [];
  async generatePresignedUrlForAsset(input: unknown) {
    this.calls.push(input);
    return { uploadUrl: "u", key: "k", expiresAt: new Date() };
  }
  async generatePresignedUrl() {
    throw new Error("legacy method should not be called by new flow");
  }
  async processImage(): Promise<Record<string, never>> {
    return {};
  }
}
class FakeRepo {
  async findByProductId() {
    return [];
  }
  storedImages: Record<
    string,
    {
      id: string;
      product_id: string;
      alt_text: string | null;
      focal_x: string | null;
      focal_y: string | null;
      variant_id: string | null;
    }
  > = {};
  async findById(id: string) {
    return (this.storedImages[id] as unknown) ?? null;
  }
  async save(x: unknown) {
    return x;
  }
  async softRemove() {}
  // Default — overridable per test
  productOwners: Record<string, string | null> = {};
  async findProductOwner(productId: string): Promise<string | null> {
    return this.productOwners[productId] ?? null;
  }
  updateFieldsCalls: unknown[] = [];
  async updateFields(id: string, fields: unknown) {
    this.updateFieldsCalls.push({ id, fields });
    const img = this.storedImages[id];
    if (img) Object.assign(img, fields);
  }
  async findByIdIncludingDeleted() {
    return null;
  }
  async hardDelete() {}
  async findCandidatesByOriginalId() {
    return [];
  }
}
class FakeVendorLookup {
  // Maps user.id -> vendor.id (or null)
  map: Record<string, string | null> = {
    "user-self": "v-42",
    "user-no-vendor": null,
  };
  async findVendorIdByUserId(userId: string) {
    return this.map[userId] ?? null;
  }
}
class FakeVideoRepo {
  async findByProductId() {
    return [];
  }
  async findById() {
    return null;
  }
  async create(x: unknown) {
    return x;
  }
  async updateFields() {}
  async softRemove() {}
  async maxSortOrder() {
    return 0;
  }
  async findProductOwner() {
    return null;
  }
}

const fakeVideoQueue = { add: async () => {} } as any;

// biome-ignore lint/suspicious/noExplicitAny: test stub
const fakeAiEnhance = {
  enhance: async () => ({ noChangeDetected: false, processed: {} as any, candidateRawKey: "" }),
};
// biome-ignore lint/suspicious/noExplicitAny: test stub
const fakeAiSettings = {
  get: async () => ({
    enabled: false,
    model: "gemini-2.5-flash-image",
    prompt: "",
    per_vendor_monthly_cap: 200,
    per_vendor_per_minute_cap: 5,
  }),
  update: async () => {},
};
// biome-ignore lint/suspicious/noExplicitAny: test stub
const fakeAiUsage = {
  getMonthCount: async () => 0,
  increment: async () => {},
  decrement: async () => {},
};

describe("MediaController.getKycSignedUrl", () => {
  test("rejects non-admin roles", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test fake cast to real service type
    const media = new FakeMedia() as any;
    media.getKycSignedUrl = async () => ({ url: "u", expiresAt: new Date() });
    const ctl = new MediaController(
      media,
      // biome-ignore lint/suspicious/noExplicitAny: test fake cast to real repo type
      new FakeRepo() as any,
      // biome-ignore lint/suspicious/noExplicitAny: test fake cast to real lookup type
      new FakeVendorLookup() as any,
      // biome-ignore lint/suspicious/noExplicitAny: test fake cast to real repo type
      new FakeVideoRepo() as any,
      fakeVideoQueue,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      fakeAiEnhance as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      fakeAiSettings as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      fakeAiUsage as any,
    );
    await expect(ctl.getKycSignedUrl("vendor", "private/kyc/v/x.pdf")).rejects.toThrow(/admin/i);
    await expect(ctl.getKycSignedUrl("customer", "private/kyc/v/x.pdf")).rejects.toThrow(/admin/i);
  });

  test("allows admin and super_admin", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test fake cast to real service type
    const media = new FakeMedia() as any;
    media.getKycSignedUrl = async () => ({ url: "u", expiresAt: new Date() });
    const ctl = new MediaController(
      media,
      // biome-ignore lint/suspicious/noExplicitAny: test fake cast to real repo type
      new FakeRepo() as any,
      // biome-ignore lint/suspicious/noExplicitAny: test fake cast to real lookup type
      new FakeVendorLookup() as any,
      // biome-ignore lint/suspicious/noExplicitAny: test fake cast to real repo type
      new FakeVideoRepo() as any,
      fakeVideoQueue,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      fakeAiEnhance as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      fakeAiSettings as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      fakeAiUsage as any,
    );
    await expect(ctl.getKycSignedUrl("admin", "private/kyc/v/x.pdf")).resolves.toBeDefined();
    await expect(ctl.getKycSignedUrl("super_admin", "private/kyc/v/x.pdf")).resolves.toBeDefined();
  });
});

describe("MediaController.generatePresignedUrl", () => {
  let media: FakeMedia;
  let lookup: FakeVendorLookup;
  let ctl: MediaController;

  beforeEach(() => {
    media = new FakeMedia();
    lookup = new FakeVendorLookup();
    ctl = new MediaController(
      // biome-ignore lint/suspicious/noExplicitAny: test fake cast to real service type
      media as any,
      // biome-ignore lint/suspicious/noExplicitAny: test fake cast to real repo type
      new FakeRepo() as any,
      // biome-ignore lint/suspicious/noExplicitAny: test fake cast to real lookup type
      lookup as any,
      // biome-ignore lint/suspicious/noExplicitAny: test fake cast to real repo type
      new FakeVideoRepo() as any,
      fakeVideoQueue,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      fakeAiEnhance as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      fakeAiSettings as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      fakeAiUsage as any,
    );
  });

  const guestUser: AuthUser = { id: "u", email: "e", role: "guest" };
  const adminUser: AuthUser = { id: "admin-1", email: "a", role: "admin" };
  // Phase 3a: vendor owners carry role="customer" + vm JWT claim
  const vendorUser: AuthUser = { id: "user-self", email: "v", role: "customer" };

  test("rejects unauthenticated callers", async () => {
    await expect(
      ctl.generatePresignedUrl(
        "guest",
        {
          asset_type: "brand_logo",
          filename: "x.png",
          content_type: "image/png",
        },
        guestUser,
      ),
    ).rejects.toThrow(/permission|forbidden/i);
  });

  test("forwards filename + content type for non-vendor-scoped assets", async () => {
    await ctl.generatePresignedUrl(
      "admin",
      {
        asset_type: "brand_logo",
        filename: "logo.png",
        content_type: "image/png",
      },
      adminUser,
    );
    expect(media.calls[0]).toMatchObject({
      assetType: "brand_logo",
      filename: "logo.png",
      contentType: "image/png",
    });
  });

  test("derives vendorId from the DB lookup for vendor self-upload of vendor_logo", async () => {
    await ctl.generatePresignedUrl(
      "vendor",
      {
        asset_type: "vendor_logo",
        filename: "logo.png",
        content_type: "image/png",
      },
      vendorUser,
    );
    expect((media.calls[0] as Record<string, unknown>).vendorId).toBe("v-42");
  });

  test("rejects vendor uploading another vendor's KYC", async () => {
    await expect(
      ctl.generatePresignedUrl(
        "vendor",
        {
          asset_type: "kyc_document",
          filename: "x.pdf",
          content_type: "application/pdf",
          vendor_id: "v-other",
        },
        vendorUser,
      ),
    ).rejects.toThrow(/another vendor|forbidden/i);
  });

  test("admin must supply vendor_id when uploading vendor_logo", async () => {
    await expect(
      ctl.generatePresignedUrl(
        "admin",
        {
          asset_type: "vendor_logo",
          filename: "logo.png",
          content_type: "image/png",
        },
        adminUser,
      ),
    ).rejects.toThrow(/vendor_id/i);
  });

  test("admin uses body.vendor_id for vendor-scoped uploads", async () => {
    await ctl.generatePresignedUrl(
      "admin",
      {
        asset_type: "vendor_banner",
        filename: "b.png",
        content_type: "image/png",
        vendor_id: "v-99",
      },
      adminUser,
    );
    expect((media.calls[0] as Record<string, unknown>).vendorId).toBe("v-99");
  });
});

describe("MediaController.processImage ownership", () => {
  test("rejects vendor processing an image for a product they do not own", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test fake cast to real service type
    const media = new FakeMedia() as any;
    media.processImage = async () => ({
      large: { url: "L", width: 1, height: 1, fileSize: 1, key: "k1" },
      medium: { url: "M", width: 1, height: 1, fileSize: 1, key: "k2" },
      card: { url: "C", width: 1, height: 1, fileSize: 1, key: "k4" },
      thumb: { url: "T", width: 1, height: 1, fileSize: 1, key: "k3" },
    });
    const repo = new FakeRepo();
    repo.productOwners.p1 = "v-other";
    const lookup = new FakeVendorLookup();
    // user-self maps to v-42 in the existing FakeVendorLookup
    // biome-ignore lint/suspicious/noExplicitAny: test fake cast to real repo type
    const ctl = new MediaController(
      media,
      repo as any,
      lookup as any,
      new FakeVideoRepo() as any,
      fakeVideoQueue,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      fakeAiEnhance as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      fakeAiSettings as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      fakeAiUsage as any,
    );
    // Phase 3a: vendor owners carry role="customer" + vm JWT claim
    const vendorUser: AuthUser = {
      id: "user-self",
      email: "v",
      role: "customer",
    };
    await expect(
      ctl.processImage("vendor", { key: "k", product_id: "p1" }, vendorUser),
    ).rejects.toThrow(/own|forbidden/i);
  });

  test("allows admin to process for any product (no ownership check)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test fake cast to real service type
    const media = new FakeMedia() as any;
    media.processImage = async () => ({
      large: { url: "L", width: 1, height: 1, fileSize: 1, key: "k1" },
      medium: { url: "M", width: 1, height: 1, fileSize: 1, key: "k2" },
      card: { url: "C", width: 1, height: 1, fileSize: 1, key: "k4" },
      thumb: { url: "T", width: 1, height: 1, fileSize: 1, key: "k3" },
    });
    const repo = new FakeRepo();
    repo.productOwners.p1 = "v-other";
    const ctl = new MediaController(
      media,
      // biome-ignore lint/suspicious/noExplicitAny: test fake cast to real repo type
      repo as any,
      // biome-ignore lint/suspicious/noExplicitAny: test fake cast to real lookup type
      new FakeVendorLookup() as any,
      // biome-ignore lint/suspicious/noExplicitAny: test fake cast to real repo type
      new FakeVideoRepo() as any,
      fakeVideoQueue,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      fakeAiEnhance as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      fakeAiSettings as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      fakeAiUsage as any,
    );
    const adminUser: AuthUser = { id: "admin-1", email: "a", role: "admin" };
    await expect(
      ctl.processImage("admin", { key: "k", product_id: "p1" }, adminUser),
    ).resolves.toBeDefined();
  });
});

describe("MediaController.updateImage", () => {
  const vendorUser: AuthUser = { id: "user-self", email: "v", role: "customer" };
  const adminUser: AuthUser = { id: "admin-1", email: "a", role: "admin" };

  function makeCtl(repo: FakeRepo, lookup?: FakeVendorLookup) {
    return new MediaController(
      // biome-ignore lint/suspicious/noExplicitAny: test fake cast to real service type
      new FakeMedia() as any,
      // biome-ignore lint/suspicious/noExplicitAny: test fake cast to real repo type
      repo as any,
      // biome-ignore lint/suspicious/noExplicitAny: test fake cast to real lookup type
      (lookup ?? new FakeVendorLookup()) as any,
      // biome-ignore lint/suspicious/noExplicitAny: test fake cast to real repo type
      new FakeVideoRepo() as any,
      fakeVideoQueue,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      fakeAiEnhance as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      fakeAiSettings as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      fakeAiUsage as any,
    );
  }

  test("vendor success — owns product, updateFields called with correct values", async () => {
    const repo = new FakeRepo();
    // vendor v-42 owns product p1
    repo.productOwners.p1 = "v-42";
    // seed a stored image belonging to p1
    repo.storedImages["img-1"] = {
      id: "img-1",
      product_id: "p1",
      alt_text: null,
      focal_x: null,
      focal_y: null,
      variant_id: null,
    };
    const ctl = makeCtl(repo);

    const result = await ctl.updateImage(
      "vendor",
      "p1",
      "img-1",
      { alt_text: "A cat", focal_x: 0.5, variant_id: "var-1" },
      vendorUser,
    );

    expect(result).toBeDefined();
    expect(repo.updateFieldsCalls).toHaveLength(1);
    const call = repo.updateFieldsCalls[0] as { id: string; fields: Record<string, unknown> };
    expect(call.id).toBe("img-1");
    expect(call.fields.alt_text).toBe("A cat");
    expect(call.fields.focal_x).toBe("0.5");
    expect(call.fields.variant_id).toBe("var-1");
  });

  test("vendor non-owner — throws ForbiddenError", async () => {
    const repo = new FakeRepo();
    // product p2 is owned by a different vendor
    repo.productOwners.p2 = "v-other";
    repo.storedImages["img-2"] = {
      id: "img-2",
      product_id: "p2",
      alt_text: null,
      focal_x: null,
      focal_y: null,
      variant_id: null,
    };
    const ctl = makeCtl(repo);

    // vendorUser resolves to v-42 but product owner is v-other
    await expect(
      ctl.updateImage("vendor", "p2", "img-2", { alt_text: "x" }, vendorUser),
    ).rejects.toThrow(/own|forbidden/i);
  });

  test("image-not-in-product — throws NotFoundError", async () => {
    const repo = new FakeRepo();
    // admin skips ownership check; image belongs to a different product
    repo.storedImages["img-3"] = {
      id: "img-3",
      product_id: "p-other",
      alt_text: null,
      focal_x: null,
      focal_y: null,
      variant_id: null,
    };
    const ctl = makeCtl(repo);

    await expect(
      ctl.updateImage("admin", "p1", "img-3", { alt_text: "y" }, adminUser),
    ).rejects.toThrow(/not found/i);
  });
});

describe("MediaController.reorderMedia", () => {
  const adminUser: AuthUser = { id: "admin-1", email: "a", role: "admin" };
  const vendorUser: AuthUser = { id: "user-self", email: "v", role: "customer" };

  // Stub AppDataSource.transaction to capture manager.update calls without a real DB
  const txCalls: Array<{ table: string; criteria: unknown; values: unknown }> = [];
  const original = AppDataSource.transaction;

  beforeAll(() => {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    (AppDataSource as any).transaction = async (cb: any) => {
      await cb({
        update: (entity: any, criteria: any, values: any) => {
          txCalls.push({ table: entity?.name ?? entity, criteria, values });
        },
      });
    };
  });

  afterAll(() => {
    // biome-ignore lint/suspicious/noExplicitAny: test stub restore
    (AppDataSource as any).transaction = original;
  });

  function makeCtl(repoOverrides?: Partial<FakeRepo>) {
    const repo = Object.assign(new FakeRepo(), repoOverrides ?? {});
    return new MediaController(
      // biome-ignore lint/suspicious/noExplicitAny: test fake cast to real service type
      new FakeMedia() as any,
      // biome-ignore lint/suspicious/noExplicitAny: test fake cast to real repo type
      repo as any,
      // biome-ignore lint/suspicious/noExplicitAny: test fake cast to real lookup type
      new FakeVendorLookup() as any,
      // biome-ignore lint/suspicious/noExplicitAny: test fake cast to real repo type
      new FakeVideoRepo() as any,
      fakeVideoQueue,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      fakeAiEnhance as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      fakeAiSettings as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      fakeAiUsage as any,
    );
  }

  test("role check — customer without vendor membership throws ForbiddenError", async () => {
    txCalls.length = 0;
    const ctl = makeCtl();
    // adminUser (id="admin-1") has no entry in FakeVendorLookup → no vendor record.
    // Phase 3a+: "customer" passes the outer role gate but is rejected at the
    // inner findVendorIdByUserId check with "No vendor record for this user".
    await expect(
      ctl.reorderMedia(
        "customer",
        "p1",
        [{ id: "img-1", kind: "image", sort_order: 0 }],
        adminUser,
      ),
    ).rejects.toThrow(/permission|forbidden|no vendor record/i);
  });

  test("vendor non-owner — throws ForbiddenError", async () => {
    txCalls.length = 0;
    // product p1 is owned by v-other, but vendorUser maps to v-42
    const ctl = makeCtl({ productOwners: { p1: "v-other" } });
    await expect(
      ctl.reorderMedia("vendor", "p1", [{ id: "img-1", kind: "image", sort_order: 0 }], vendorUser),
    ).rejects.toThrow(/own|forbidden/i);
  });

  test("image at sort_order 0 → is_primary true; video also updated", async () => {
    txCalls.length = 0;
    const ctl = makeCtl({ productOwners: { p1: "v-42" } });
    const result = await ctl.reorderMedia(
      "admin",
      "p1",
      [
        { id: "img-1", kind: "image", sort_order: 0 },
        { id: "vid-1", kind: "video", sort_order: 1 },
      ],
      adminUser,
    );

    expect(result).toEqual({ ok: true });
    expect(txCalls).toHaveLength(2);

    // First call: ProductImage updated with is_primary: true
    expect(txCalls[0]!.table).toBe("ProductImage");
    expect(txCalls[0]!.criteria).toMatchObject({ id: "img-1", product_id: "p1" });
    expect(txCalls[0]!.values).toMatchObject({ sort_order: 0, is_primary: true });

    // Second call: ProductVideo updated (no is_primary)
    expect(txCalls[1]!.table).toBe("ProductVideo");
    expect(txCalls[1]!.criteria).toMatchObject({ id: "vid-1", product_id: "p1" });
    expect(txCalls[1]!.values).toMatchObject({ sort_order: 1 });
  });
});
