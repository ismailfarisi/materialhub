/**
 * Live-DB test for the TypeORM declaration store + service. Runs only with
 * DATABASE_URL set and the seed applied (needs the demo eco supplier).
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";

const hasDb = !!process.env.DATABASE_URL;
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb("eco declarations (live DB)", () => {
  let db: typeof import("@materialhub/database");
  let service: import("./eco-declaration.service.ts").EcoDeclarationService;
  let productId = "";
  let vendorId = "";
  const reindexed: string[] = [];

  beforeAll(async () => {
    db = await import("@materialhub/database");
    await db.ensureDatabase();
    const { EcoDeclarationService } = await import("./eco-declaration.service.ts");
    const { TypeormEcoDeclarationStore } = await import("./eco-declaration.store.ts");
    const vendor = await db.AppDataSource.getRepository(db.Vendor).findOneOrFail({
      where: { slug: "materialhub-eco-supply" },
    });
    vendorId = vendor.id;
    const cat = await db.AppDataSource.getRepository(db.Category).findOneOrFail({
      where: { slug: "paper-cups-lids" },
    });
    const product = await db.AppDataSource.getRepository(db.Product).save(
      db.AppDataSource.getRepository(db.Product).create({
        vendor_id: vendorId,
        category_id: cat.id,
        name: "Integration test paper cup",
        slug: `it-paper-cup-${Date.now()}`,
        price: 1000,
      }),
    );
    productId = product.id;
    service = new EcoDeclarationService({
      store: new TypeormEcoDeclarationStore(),
      reindex: async (id) => {
        reindexed.push(id);
      },
      signedUrl: async (key) => ({ url: key, expiresAt: new Date() }),
    });
  });

  afterAll(async () => {
    if (productId) await db.AppDataSource.query("DELETE FROM products WHERE id = $1", [productId]);
  });

  it("declare → list pending → approve → reject round trip", async () => {
    const declared: any = await service.declare(productId, vendorId, vendorId, {
      confirm: true,
      statement: "Paperboard only",
    });
    expect(declared.status).toBe("pending");

    const queue = await service.adminList({ status: "pending", q: "Integration test paper cup" });
    const row = queue.items.find((i: any) => i.product_id === productId);
    expect(row).toBeTruthy();
    expect(row.product.name).toBe("Integration test paper cup");
    expect(row.vendor.slug).toBe("materialhub-eco-supply");
    expect(row.certificate_key).toBeUndefined();

    const approved: any = await service.approve(row.id, vendorId);
    expect(approved.status).toBe("approved");
    expect(reindexed).toContain(productId);

    const rejected: any = await service.reject(row.id, vendorId, "Lid listing has a PE film.");
    expect(rejected.status).toBe("rejected");
    const again: any = await service.getForVendor(productId, vendorId);
    expect(again.rejection_reason).toBe("Lid listing has a PE film.");
  });

  it("seeded demo data exposes approved declarations on the product relation", async () => {
    const p = await db.AppDataSource.getRepository(db.Product).findOneOrFail({
      where: { slug: "single-wall-paper-cup-8oz-240ml-carton-1000" },
      relations: ["ecoDeclaration"],
    });
    expect(p.ecoDeclaration?.status).toBe(db.EcoDeclarationStatus.approved);
  });
});
