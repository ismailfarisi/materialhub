// order.service.test.ts
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { OrderQueryService } from "./order.service.ts";

describe("OrderQueryService", () => {
  // Build a reusable chainable query builder mock
  const makeQb = (resolvedValue: [any[], number]) => {
    const qb: any = {
      leftJoinAndSelect: mock(() => qb),
      leftJoin: mock(() => qb),
      addSelect: mock(() => qb),
      where: mock(() => qb),
      andWhere: mock(() => qb),
      orderBy: mock(() => qb),
      skip: mock(() => qb),
      take: mock(() => qb),
      getOne: mock(() => Promise.resolve(null)),
      getManyAndCount: mock(() => Promise.resolve(resolvedValue)),
    };
    return qb;
  };

  let mockQb: ReturnType<typeof makeQb>;
  let mockOrderRepo: any;
  let mockCancellationRepo: any;
  let service: OrderQueryService;

  beforeEach(() => {
    mockQb = makeQb([[], 0]);
    mockOrderRepo = {
      createQueryBuilder: mock(() => mockQb),
    };
    mockCancellationRepo = {
      find: mock(() => Promise.resolve([])),
    };
    service = new OrderQueryService(mockOrderRepo as any, mockCancellationRepo as any);
  });

  it("lists orders for a user with pagination", async () => {
    const orders = [{ id: "o1", order_number: "FKS-2026-000001" }];
    mockQb.getManyAndCount.mockResolvedValueOnce([orders, 1]);

    const result = await service.list("user-1", { page: 1, limit: 20 });
    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(mockOrderRepo.createQueryBuilder).toHaveBeenCalledWith("order");
  });

  it("lists orders with date and status filters", async () => {
    mockQb.getManyAndCount.mockResolvedValueOnce([[], 0]);

    await service.list("user-1", {
      page: 1,
      limit: 20,
      status: "pending",
      from_date: "2026-01-01",
      to_date: "2026-03-31",
    });

    // where (user_id) + andWhere for status + andWhere for from_date + andWhere for to_date = 3 andWhere calls
    expect(mockQb.andWhere).toHaveBeenCalledTimes(3);
  });

  it("gets order detail with customer-visible timeline only", async () => {
    const historyEntries = [
      { id: "h1", is_customer_visible: true, created_at: "2026-01-01T10:00:00Z" },
      { id: "h2", is_customer_visible: false, created_at: "2026-01-01T11:00:00Z" },
      { id: "h3", is_customer_visible: true, created_at: "2026-01-01T12:00:00Z" },
      { id: "h4", is_customer_visible: true, created_at: "2026-01-01T09:00:00Z" },
    ];

    mockQb.getOne.mockResolvedValueOnce({
      id: "o1",
      order_number: "FKS-2026-000001",
      statusHistory: historyEntries,
      vendorOrders: [],
    });

    const order = await service.getById("o1", "user-1");
    expect(order).toBeTruthy();
    expect(order!.statusHistory).toHaveLength(3);
    // Sorted by created_at asc — h4 (09:00), h1 (10:00), h3 (12:00)
    expect((order!.statusHistory as any[])[0].id).toBe("h4");
    expect((order!.statusHistory as any[])[1].id).toBe("h1");
    expect((order!.statusHistory as any[])[2].id).toBe("h3");
  });

  it("exposes product_slug on items so the buyer can reopen the product page", async () => {
    mockQb.getOne.mockResolvedValueOnce({
      id: "o1",
      statusHistory: [],
      vendorOrders: [
        {
          id: "vo1",
          items: [
            {
              id: "i1",
              product_name: "Live one",
              product: { slug: "live-one", status: "published" },
            },
          ],
        },
      ],
    });

    const order = await service.getById("o1", "user-1");
    const item = (order as any).vendorOrders[0].items[0];
    expect(item.product_slug).toBe("live-one");
  });

  it("omits product_slug when the product is no longer shoppable", async () => {
    mockQb.getOne.mockResolvedValueOnce({
      id: "o1",
      statusHistory: [],
      vendorOrders: [
        {
          id: "vo1",
          items: [
            { id: "i1", product_name: "Pulled", product: { slug: "pulled", status: "archived" } },
            { id: "i2", product_name: "Deleted", product: null },
          ],
        },
      ],
    });

    const items = (await service.getById("o1", "user-1")) as any;
    expect(items.vendorOrders[0].items[0].product_slug).toBeNull();
    expect(items.vendorOrders[0].items[1].product_slug).toBeNull();
  });

  it("returns null when order not found", async () => {
    mockQb.getOne.mockResolvedValueOnce(null);
    const order = await service.getById("o1", "user-1");
    expect(order).toBeNull();
  });
});
