import { describe, expect, it, mock } from "bun:test";
import { OrderStatus } from "@materialhub/database/src/enums/order.enums.ts";
import { OrderStatusService } from "./order-status.service.ts";

/**
 * cancelOrder safety (E2E findings): ownership, repeat cancels, and releasing
 * exactly the stock the order still holds.
 */
function build(
  order: any,
  reservations: Array<{ id: string; inventory_id: string; quantity: number }>,
  totalReservations = reservations.length,
) {
  const inventory: Record<string, any> = {
    inv1: { id: "inv1", quantity_reserved: 10 },
  };
  const sql: string[] = [];
  const inventorySaves: any[] = [];
  const qbFor = (getOne: () => Promise<any>) => {
    let id: string | undefined;
    const qb: any = {
      setLock: () => qb,
      where: (_w: string, p?: any) => {
        id = p?.id;
        return qb;
      },
      getOne: () => (id ? Promise.resolve(inventory[id] ?? null) : getOne()),
    };
    return qb;
  };
  const tx: any = {
    query: mock((q: string) => {
      sql.push(q);
      if (q.includes("count(*)")) return Promise.resolve([{ count: totalReservations }]);
      if (q.includes("FROM inventory_reservations") && q.includes("FOR UPDATE"))
        return Promise.resolve(reservations);
      return Promise.resolve([]);
    }),
    getRepository: (name: string) => {
      if (name === "Order")
        return {
          createQueryBuilder: () => qbFor(() => Promise.resolve(order)),
          findOne: () => Promise.resolve(order),
          save: (e: any) => Promise.resolve(e),
        };
      if (name === "Inventory")
        return {
          createQueryBuilder: () => qbFor(() => Promise.resolve(null)),
          findOne: () => Promise.resolve(inventory.inv1),
          save: (e: any) => {
            inventorySaves.push({ ...e });
            return Promise.resolve(e);
          },
        };
      if (name === "OrderItem") return { find: () => Promise.resolve([]) };
      if (name === "Commission")
        return { update: () => Promise.resolve({ affected: 0 }), find: () => Promise.resolve([]) };
      return {
        findOne: () => Promise.resolve(null),
        find: () => Promise.resolve([]),
        create: (d: any) => d,
        save: (e: any) => Promise.resolve(e),
      };
    },
  };
  const orderRepo: any = {
    findOne: () => Promise.resolve(order),
    manager: { transaction: (cb: any) => cb(tx) },
  };
  const service = new OrderStatusService(
    orderRepo,
    { findOne: mock(), find: mock(() => Promise.resolve([])), save: mock() } as any,
    { create: (d: any) => d, save: (e: any) => Promise.resolve(e) } as any,
    { add: mock(() => Promise.resolve()) } as any,
    undefined, // integrationEventsQueue
    undefined, // siteSettingRepo
    { findOne: mock() } as any, // inventoryRepo: enables the release path
    { getSettlementWindowDays: () => Promise.resolve(7) } as any,
  );
  return { service, inventory, sql, inventorySaves };
}

describe("cancelOrder safety", () => {
  it("a buyer cannot cancel another user's order (404, nothing changes)", async () => {
    const order = {
      id: "o1",
      user_id: "owner",
      status: OrderStatus.pending_payment,
      vendorOrders: [],
    };
    const { service, sql } = build(order, []);
    await expect(
      service.cancelOrder("o1", { userId: "intruder", role: "buyer" }, "x"),
    ).rejects.toThrow("Order not found");
    expect(order.status).toBe(OrderStatus.pending_payment);
    expect(sql.some((q) => q.includes("UPDATE inventory_reservations"))).toBe(false);
  });

  it("the owner can cancel", async () => {
    const order = {
      id: "o1",
      user_id: "owner",
      status: OrderStatus.pending_payment,
      vendorOrders: [],
    };
    const { service } = build(order, []);
    await service.cancelOrder("o1", { userId: "owner", role: "buyer" }, "changed mind");
    expect(order.status).toBe(OrderStatus.cancelled);
  });

  it("a repeat cancel releases nothing and writes nothing", async () => {
    const order = { id: "o1", user_id: "owner", status: OrderStatus.cancelled, vendorOrders: [] };
    const { service, inventorySaves, sql } = build(order, [
      { id: "r1", inventory_id: "inv1", quantity: 3 },
    ]);
    await service.cancelOrder("o1", { userId: "owner", role: "buyer" }, "again");
    expect(inventorySaves).toHaveLength(0);
    expect(sql).toHaveLength(0);
  });

  it("releases exactly the held reservations and closes them", async () => {
    const order = {
      id: "o1",
      user_id: "owner",
      status: OrderStatus.pending_payment,
      vendorOrders: [],
    };
    const { service, inventory, sql } = build(order, [
      { id: "r1", inventory_id: "inv1", quantity: 3 },
    ]);
    await service.cancelOrder("o1", { userId: "owner", role: "buyer" }, "x");
    expect(inventory.inv1.quantity_reserved).toBe(7);
    expect(sql.some((q) => q.includes("SET status = 'released'"))).toBe(true);
  });

  it("does not release again when the reservations already expired", async () => {
    // Abandoned checkout: the expiry job released the stock at 15 min; the
    // reaper cancels at 60 min. Reservation rows exist, none are held.
    const order = {
      id: "o1",
      user_id: "owner",
      status: OrderStatus.pending_payment,
      vendorOrders: [],
    };
    const { service, inventory, inventorySaves } = build(order, [], 1);
    await service.cancelOrder("o1", { userId: "system", role: "system" }, "expired");
    expect(inventory.inv1.quantity_reserved).toBe(10);
    expect(inventorySaves).toHaveLength(0);
  });
});
