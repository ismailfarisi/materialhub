import { describe, expect, it } from "bun:test";
import { CouponAdminService } from "./coupon-admin.service.ts";

// The create-path guard runs before any DataSource access, so we can exercise it
// with stub repositories/dataSource. We assert that a specific_collection coupon
// without a collection_id is rejected before any transaction is opened.
function makeService(): CouponAdminService {
  const fail = () => {
    throw new Error("DataSource should not be touched when the guard rejects");
  };
  const stubDataSource = {
    transaction: fail,
  } as any;
  const stubRepo = {} as any;
  return new CouponAdminService(
    stubDataSource,
    stubRepo,
    stubRepo,
    stubRepo,
    stubRepo,
    stubRepo,
    stubRepo,
  );
}

describe("CouponAdminService.create — specific_collection guard", () => {
  it("throws a 400 when applicable_to is specific_collection but collection_id is missing", async () => {
    const service = makeService();

    let caught: any;
    try {
      await service.create({
        code: "COLL10",
        name: "Collection coupon",
        applicable_to: "specific_collection",
        discount_value: 1000,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught.statusCode).toBe(400);
    expect(caught.message).toContain("collection_id");
  });
});

describe("CouponAdminService.create — discount_value guard & defaults", () => {
  it("throws a 400 when a value-bearing type has no discount_value", async () => {
    const service = makeService();

    let caught: any;
    try {
      await service.create({ code: "SAVE20", type: "percentage" });
    } catch (err) {
      caught = err;
    }

    expect(caught.statusCode).toBe(400);
    expect(caught.message).toContain("discount_value");
  });

  it("allows free_shipping without discount_value and defaults name to the code", async () => {
    let savedData: any;
    const manager = {
      create: (_target: any, data: any) => data,
      save: (data: any) => {
        savedData = data;
        return Promise.resolve({ ...data, id: "cp-1" });
      },
      delete: () => Promise.resolve(),
      insert: () => Promise.resolve(),
    };
    const stubDataSource = { transaction: (fn: any) => fn(manager) } as any;
    const stubRepo = { target: class {} } as any;
    const service = new CouponAdminService(
      stubDataSource,
      stubRepo,
      stubRepo,
      stubRepo,
      stubRepo,
      stubRepo,
      stubRepo,
    );

    const coupon = await service.create({ code: "shipfree", type: "free_shipping" });
    expect(coupon.id).toBe("cp-1");
    expect(savedData.discount_value).toBe(0);
    expect(savedData.code).toBe("SHIPFREE");
    expect(savedData.name).toBe("shipfree"); // defaults to the code
  });
});
