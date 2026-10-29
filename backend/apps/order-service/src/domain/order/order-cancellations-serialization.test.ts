// order-cancellations-serialization.test.ts
//
// Task 6: verify the audience-scoped `cancellations` array attached to the
// three order-detail read paths (customer getById, admin adminGetById,
// vendor getForVendor).
//
// Status-filter fix (final review): a cancellation row can be left in
// status = "pending" if the Stripe refund permanently fails (it's
// pre-persisted before the gateway call). Customer/vendor views must only
// ever surface "completed" rows; the admin view is unchanged (still sees
// pending/failed rows for support/audit).
import { describe, expect, it, mock } from "bun:test";
import { OrderQueryService } from "./order.service.ts";
import { VendorOrderService } from "./vendor-order.service.ts";

describe("order-detail cancellations serialization", () => {
  describe("OrderQueryService", () => {
    const makeQb = (order: any) => {
      const qb: any = {
        leftJoinAndSelect: mock(() => qb),
        leftJoin: mock(() => qb),
        addSelect: mock(() => qb),
        where: mock(() => qb),
        andWhere: mock(() => qb),
        getOne: mock(() => Promise.resolve(order)),
      };
      return qb;
    };

    const sampleCancellation = {
      id: "c1",
      order_id: "o1",
      admin_id: "admin-1",
      reason: "damaged in transit",
      refund_amount: 5000,
      currency: "AED",
      refund_method: "stripe",
      gateway_refund_id: "re_123",
      status: "completed",
      items: [{ order_item_id: "oi1", vendor_order_id: "vo1", quantity: 1, refund_amount: 5000 }],
      created_at: new Date("2026-07-01T00:00:00Z"),
    };

    // A cancellation row left pending because the Stripe refund gateway call
    // permanently failed after the row was pre-persisted. Never-completed —
    // no money actually moved.
    const pendingCancellation = {
      ...sampleCancellation,
      id: "c2",
      reason: "stripe refund failed permanently",
      gateway_refund_id: null,
      status: "pending",
      created_at: new Date("2026-07-02T00:00:00Z"),
    };

    // Mirrors how a real repo.find({ where: { status: "completed" } }) would
    // behave: filters the fixture rows by status when the query includes it,
    // otherwise (admin path) returns everything.
    const makeCancellationRepo = (rows: any[]) => ({
      find: mock((opts: any) =>
        Promise.resolve(
          opts?.where?.status ? rows.filter((r) => r.status === opts.where.status) : rows,
        ),
      ),
    });

    it("getById (customer) exposes items/refund_amount/refund_method but omits admin_id and gateway_refund_id, and excludes non-completed rows", async () => {
      const order: any = { id: "o1", user_id: "u1", vendorOrders: [] };
      const mockOrderRepo: any = { createQueryBuilder: mock(() => makeQb(order)) };
      const mockCancellationRepo: any = makeCancellationRepo([
        sampleCancellation,
        pendingCancellation,
      ]);
      const service = new OrderQueryService(mockOrderRepo, mockCancellationRepo);

      const result = await service.getById("o1", "u1");

      expect(result).toBeTruthy();
      const cancellations = (result as any).cancellations;
      expect(cancellations).toHaveLength(1);
      expect(cancellations[0].id).toBe("c1");
      expect(cancellations[0].items).toEqual(sampleCancellation.items);
      expect(cancellations[0].refund_amount).toBe(5000);
      expect(cancellations[0].refund_method).toBe("stripe");
      expect(cancellations[0].admin_id).toBeUndefined();
      expect(cancellations[0].gateway_refund_id).toBeUndefined();
      expect(mockCancellationRepo.find).toHaveBeenCalledWith({
        where: { order_id: "o1", status: "completed" },
      });
    });

    it("returns null (no cancellations lookup) when order not found", async () => {
      const mockOrderRepo: any = { createQueryBuilder: mock(() => makeQb(null)) };
      const mockCancellationRepo: any = { find: mock(() => Promise.resolve([])) };
      const service = new OrderQueryService(mockOrderRepo, mockCancellationRepo);

      const result = await service.getById("missing", "u1");

      expect(result).toBeNull();
      expect(mockCancellationRepo.find).not.toHaveBeenCalled();
    });

    it("adminGetById includes admin_id, gateway_refund_id, reason, created_at, and still returns pending rows (unfiltered)", async () => {
      const order: any = { id: "o1", vendorOrders: [] };
      const mockOrderRepo: any = { createQueryBuilder: mock(() => makeQb(order)) };
      const mockCancellationRepo: any = makeCancellationRepo([
        sampleCancellation,
        pendingCancellation,
      ]);
      const service = new OrderQueryService(mockOrderRepo, mockCancellationRepo);

      const result = await service.adminGetById("o1");

      const cancellations = (result as any).cancellations;
      expect(cancellations).toHaveLength(2);

      const completed = cancellations.find((c: any) => c.id === "c1");
      expect(completed.admin_id).toBe("admin-1");
      expect(completed.gateway_refund_id).toBe("re_123");
      expect(completed.reason).toBe("damaged in transit");
      expect(completed.created_at).toBe(sampleCancellation.created_at);
      expect(completed.refund_amount).toBe(5000);
      expect(completed.refund_method).toBe("stripe");
      expect(completed.status).toBe("completed");
      expect(completed.items).toEqual(sampleCancellation.items);

      // Unchanged admin behavior: the pending (never-completed) row still
      // surfaces for support/audit purposes.
      const pending = cancellations.find((c: any) => c.id === "c2");
      expect(pending).toBeTruthy();
      expect(pending.status).toBe("pending");
      expect(pending.reason).toBe("stripe refund failed permanently");

      expect(mockCancellationRepo.find).toHaveBeenCalledWith({ where: { order_id: "o1" } });
    });
  });

  describe("VendorOrderService", () => {
    // Mirrors how a real repo.find({ where: { status: "completed" } }) would
    // behave: filters the fixture rows by status when the query includes it.
    const makeCancellationRepo = (rows: any[]) => ({
      find: mock((opts: any) =>
        Promise.resolve(
          opts?.where?.status ? rows.filter((r) => r.status === opts.where.status) : rows,
        ),
      ),
    });

    it("getForVendor scopes cancellations to this vendor_order's items, omits gateway_refund_id, and excludes non-completed rows", async () => {
      const vo: any = {
        id: "vo1",
        vendor_id: "v1",
        order_id: "o1",
        items: [{ id: "oi1" }, { id: "oi2" }],
        order: { id: "o1", shipping_address: {} },
        shipments: [],
      };
      const mockVendorOrderRepo: any = {
        findOne: mock(() => Promise.resolve(vo)),
      };
      const mockGiftOrderRepo: any = { findOne: mock(() => Promise.resolve(null)) };
      const mockWarehouseRepo: any = { findOne: mock(() => Promise.resolve(null)) };
      const mockCancellationRepo: any = makeCancellationRepo([
        {
          id: "c1",
          order_id: "o1",
          admin_id: "admin-1",
          reason: "damaged in transit",
          refund_amount: 5000,
          currency: "AED",
          refund_method: "stripe",
          gateway_refund_id: "re_123",
          status: "completed",
          items: [
            { order_item_id: "oi1", vendor_order_id: "vo1", quantity: 1, refund_amount: 2000 },
            { order_item_id: "oi9", vendor_order_id: "vo9", quantity: 1, refund_amount: 3000 },
          ],
          created_at: new Date("2026-07-01T00:00:00Z"),
        },
        {
          id: "c2",
          order_id: "o1",
          admin_id: "admin-1",
          reason: "other vendor only",
          refund_amount: 1000,
          currency: "AED",
          refund_method: "stripe",
          gateway_refund_id: "re_999",
          status: "completed",
          items: [
            { order_item_id: "oi9", vendor_order_id: "vo9", quantity: 1, refund_amount: 1000 },
          ],
          created_at: new Date("2026-07-02T00:00:00Z"),
        },
        // Left pending because the Stripe refund gateway call permanently
        // failed after the row was pre-persisted. Touches this vendor
        // order's own item (oi1) — must still be excluded, never completed.
        {
          id: "c3",
          order_id: "o1",
          admin_id: "admin-1",
          reason: "stripe refund failed permanently",
          refund_amount: 2000,
          currency: "AED",
          refund_method: "stripe",
          gateway_refund_id: null,
          status: "pending",
          items: [
            { order_item_id: "oi1", vendor_order_id: "vo1", quantity: 1, refund_amount: 2000 },
          ],
          created_at: new Date("2026-07-03T00:00:00Z"),
        },
      ]);

      const service = new VendorOrderService(
        mockVendorOrderRepo,
        mockGiftOrderRepo,
        mockWarehouseRepo,
        mockCancellationRepo,
      );

      const result = await service.getForVendor("vo1", "v1");

      expect(result).toBeTruthy();
      const cancellations = (result as any).cancellations;
      // c2 touches only oi9 (not one of this vendor_order's items) -> dropped
      // entirely. c3 is pending -> excluded by the repo-level status filter
      // before item-scoping even runs.
      expect(cancellations).toHaveLength(1);
      expect(cancellations[0].id).toBe("c1");
      // Only the oi1 entry survives filtering; oi9 (another vendor's item) is stripped.
      expect(cancellations[0].items).toEqual([
        { order_item_id: "oi1", vendor_order_id: "vo1", quantity: 1, refund_amount: 2000 },
      ]);
      expect(cancellations[0].admin_id).toBeUndefined();
      expect(cancellations[0].gateway_refund_id).toBeUndefined();
      expect(mockCancellationRepo.find).toHaveBeenCalledWith({
        where: { order_id: "o1", status: "completed" },
      });
    });

    it("returns an empty cancellations array when vendor order not found short-circuits before repo call", async () => {
      const mockVendorOrderRepo: any = { findOne: mock(() => Promise.resolve(null)) };
      const mockCancellationRepo: any = { find: mock(() => Promise.resolve([])) };
      const service = new VendorOrderService(
        mockVendorOrderRepo,
        { findOne: mock(() => Promise.resolve(null)) } as any,
        { findOne: mock(() => Promise.resolve(null)) } as any,
        mockCancellationRepo,
      );

      const result = await service.getForVendor("missing", "v1");

      expect(result).toBeNull();
      expect(mockCancellationRepo.find).not.toHaveBeenCalled();
    });
  });
});
