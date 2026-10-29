// vendor-order.service.test.ts
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { VendorOrderService } from "./vendor-order.service.ts";

describe("VendorOrderService", () => {
  const mockQueryBuilder: any = {
    leftJoinAndSelect: mock(() => mockQueryBuilder),
    where: mock(() => mockQueryBuilder),
    andWhere: mock(() => mockQueryBuilder),
    orderBy: mock(() => mockQueryBuilder),
    skip: mock(() => mockQueryBuilder),
    take: mock(() => mockQueryBuilder),
    getManyAndCount: mock(() => Promise.resolve([[], 0])),
  };

  const mockVendorOrderRepo = {
    createQueryBuilder: mock(() => mockQueryBuilder),
    findOne: mock((_args?: any): Promise<any> => Promise.resolve(null)),
  };

  const mockCancellationRepo = {
    find: mock((_args?: any): Promise<any[]> => Promise.resolve([])),
  };

  let service: VendorOrderService;

  beforeEach(() => {
    mockVendorOrderRepo.createQueryBuilder.mockClear();
    mockVendorOrderRepo.findOne.mockClear();
    mockQueryBuilder.leftJoinAndSelect.mockClear();
    mockQueryBuilder.where.mockClear();
    mockQueryBuilder.andWhere.mockClear();
    mockQueryBuilder.orderBy.mockClear();
    mockQueryBuilder.skip.mockClear();
    mockQueryBuilder.take.mockClear();
    mockQueryBuilder.getManyAndCount.mockClear();
    mockCancellationRepo.find.mockClear();
    // restore chaining after clearing
    mockQueryBuilder.leftJoinAndSelect.mockImplementation(() => mockQueryBuilder);
    mockQueryBuilder.where.mockImplementation(() => mockQueryBuilder);
    mockQueryBuilder.andWhere.mockImplementation(() => mockQueryBuilder);
    mockQueryBuilder.orderBy.mockImplementation(() => mockQueryBuilder);
    mockQueryBuilder.skip.mockImplementation(() => mockQueryBuilder);
    mockQueryBuilder.take.mockImplementation(() => mockQueryBuilder);
    mockCancellationRepo.find.mockImplementation(() => Promise.resolve([]));
    service = new VendorOrderService(
      mockVendorOrderRepo as any,
      { findOne: mock(() => Promise.resolve(null)) } as any,
      { findOne: mock(() => Promise.resolve(null)) } as any,
      mockCancellationRepo as any,
    );
  });

  it("lists vendor orders with pagination", async () => {
    mockQueryBuilder.getManyAndCount.mockResolvedValueOnce([
      [
        { id: "vo1", vendor_id: "v1" },
        { id: "vo2", vendor_id: "v1" },
      ],
      2,
    ]);

    const result = await service.listForVendor("v1", { page: 1, limit: 20 });

    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(mockVendorOrderRepo.createQueryBuilder).toHaveBeenCalledWith("vo");
    expect(mockQueryBuilder.getManyAndCount).toHaveBeenCalledTimes(1);
  });

  it("gets vendor order detail for correct vendor", async () => {
    const mockOrder = {
      id: "vo1",
      vendor_id: "v1",
      items: [],
      order: { id: "o1" },
      shipments: [],
    };
    mockVendorOrderRepo.findOne.mockResolvedValueOnce(mockOrder);

    const result = await service.getForVendor("vo1", "v1");

    expect(result).toBeTruthy();
    expect(result!.id).toBe("vo1");
    expect(mockVendorOrderRepo.findOne).toHaveBeenCalledWith({
      where: { id: "vo1", vendor_id: "v1" },
      relations: ["items", "order", "shipments"],
    });
  });

  it("returns null when vendor order not found", async () => {
    mockVendorOrderRepo.findOne.mockResolvedValueOnce(null);

    const result = await service.getForVendor("vo-missing", "v1");

    expect(result).toBeNull();
  });
});

// vendor_orders are created `confirmed` while the master order is still
// `pending_payment` (order-creation.service.ts), so an unfiltered list showed
// vendors a live order the moment a customer reached checkout — paid or not.
describe("unpaid-order visibility", () => {
  const qb: any = {
    leftJoinAndSelect: mock(() => qb),
    where: mock(() => qb),
    andWhere: mock(() => qb),
    orderBy: mock(() => qb),
    skip: mock(() => qb),
    take: mock(() => qb),
    getManyAndCount: mock(() => Promise.resolve([[], 0])),
  };

  it("filters the vendor list by the unpaid-order predicate", async () => {
    qb.andWhere.mockClear();
    const repo = { createQueryBuilder: mock(() => qb) };
    const service = new VendorOrderService(
      repo as any,
      { findOne: mock(() => Promise.resolve(null)) } as any,
      { findOne: mock(() => Promise.resolve(null)) } as any,
      { find: mock(() => Promise.resolve([])) } as any,
    );

    await service.listForVendor("v1", {});

    const clauses = qb.andWhere.mock.calls.map((c: any) => String(c[0]));
    const predicate = clauses.find((c: string) => c.includes("o_vis"));
    expect(predicate).toBeDefined();
    // Hides orders still awaiting a prepaid payment...
    expect(predicate).toContain("pending_payment");
    // ...but never COD, which legitimately sits in pending_payment until the
    // courier collects cash at delivery.
    expect(predicate).toContain("'cod'");
    // ...and never an order whose money actually landed. Keying on `status`
    // alone would fail CLOSED on a stranded transition (the changed_by crash
    // this branch fixes, or the markOrderPaid race) — hiding a PAID order from
    // the vendor is a fulfilment failure, strictly worse than showing an
    // unpaid one.
    expect(predicate).toContain("payment_status = 'captured'");
  });
});
