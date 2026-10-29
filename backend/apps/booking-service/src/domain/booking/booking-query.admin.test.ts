import { describe, expect, it } from "bun:test";
import { BookingQueryService } from "./booking-query.service.ts";

// Captures the QueryBuilder calls so we can assert on the SQL fragments and
// bound parameters without a live database (a shared AppDataSource pg pool
// crashes under `bun test`).
function makeQb() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const qb: Record<string, unknown> = {};
  for (const m of ["where", "andWhere", "orderBy", "skip", "take", "leftJoin", "addSelect"]) {
    qb[m] = (...args: unknown[]) => {
      calls.push({ method: m, args });
      return qb;
    };
  }
  qb.getManyAndCount = async () => [[], 0];
  qb.getOne = async () => null;
  qb.getRawAndEntities = async () => ({ entities: [], raw: [] });
  qb.getCount = async () => 0;
  return { qb, calls };
}

function makeService() {
  const { qb, calls } = makeQb();
  const bookingRepo = { createQueryBuilder: () => qb };
  // biome-ignore lint/suspicious/noExplicitAny: mocked repository
  const svc = new BookingQueryService(bookingRepo as any);
  return { svc, calls };
}

function fragments(calls: Array<{ method: string; args: unknown[] }>): string[] {
  return calls
    .filter((c) => c.method === "where" || c.method === "andWhere")
    .map((c) => String(c.args[0]));
}

describe("BookingQueryService.adminList", () => {
  it("never scopes by customer_user_id", async () => {
    const { svc, calls } = makeService();
    await svc.adminList({});
    expect(fragments(calls).join(" ")).not.toContain("customer_user_id");
  });

  it("paginates with defaults page=1 limit=20", async () => {
    const { svc, calls } = makeService();
    await svc.adminList({});
    expect(calls.find((c) => c.method === "skip")?.args[0]).toBe(0);
    expect(calls.find((c) => c.method === "take")?.args[0]).toBe(20);
  });

  it("computes the offset from page and limit", async () => {
    const { svc, calls } = makeService();
    await svc.adminList({ page: 3, limit: 10 });
    expect(calls.find((c) => c.method === "skip")?.args[0]).toBe(20);
    expect(calls.find((c) => c.method === "take")?.args[0]).toBe(10);
  });

  it("applies each optional filter", async () => {
    const { svc, calls } = makeService();
    await svc.adminList({
      status: "confirmed",
      vendorId: "v1",
      staffMemberId: "s1",
      locationId: "l1",
    });
    const joined = fragments(calls).join(" ");
    expect(joined).toContain("booking.status");
    expect(joined).toContain("booking.vendor_id");
    expect(joined).toContain("booking.staff_member_id");
    expect(joined).toContain("booking.location_id");
  });

  it("applies a date range on starts_at", async () => {
    const { svc, calls } = makeService();
    await svc.adminList({ from: "2026-07-01T00:00:00Z", to: "2026-07-31T00:00:00Z" });
    const joined = fragments(calls).join(" ");
    expect(joined).toContain("booking.starts_at >=");
    expect(joined).toContain("booking.starts_at <=");
  });

  it("searches on booking_number", async () => {
    const { svc, calls } = makeService();
    await svc.adminList({ search: "BK-123" });
    expect(fragments(calls).join(" ")).toContain("booking.booking_number");
  });

  it("orders by starts_at DESC", async () => {
    const { svc, calls } = makeService();
    await svc.adminList({});
    expect(calls.find((c) => c.method === "orderBy")?.args).toEqual(["booking.starts_at", "DESC"]);
  });

  it("left-joins vendors and selects vendor.name", async () => {
    const { svc, calls } = makeService();
    await svc.adminList({});
    const join = calls.find((c) => c.method === "leftJoin");
    expect(join?.args).toEqual(["vendors", "vendor", "vendor.id = booking.vendor_id"]);
    const select = calls.find((c) => c.method === "addSelect");
    expect(select?.args).toEqual(["vendor.name", "vendor_name"]);
  });

  it("maps the raw vendor_name onto each returned booking", async () => {
    // makeQb()'s getRawAndEntities/getCount default to empty; override with
    // real data to verify adminList's zip of entities <-> raw rows.
    const { qb } = makeQb();
    const bookingRepo = { createQueryBuilder: () => qb };
    qb.getRawAndEntities = async () => ({
      entities: [{ id: "b1" }, { id: "b2" }],
      raw: [{ vendor_name: "Acme Salon" }, { vendor_name: null }],
    });
    qb.getCount = async () => 2;
    // biome-ignore lint/suspicious/noExplicitAny: mocked repository
    const svc = new BookingQueryService(bookingRepo as any);
    const { data, total } = await svc.adminList({});
    expect(total).toBe(2);
    // The mock only stubs the fields under test; a real Booking has ~35 more
    // columns not relevant here.
    // biome-ignore lint/suspicious/noExplicitAny: partial mock booking shape
    expect(data as any).toEqual([
      { id: "b1", vendor_name: "Acme Salon" },
      { id: "b2", vendor_name: null },
    ]);
  });
});

describe("BookingQueryService.adminGetById", () => {
  it("looks up by id alone, with no customer scoping", async () => {
    const { svc, calls } = makeService();
    await svc.adminGetById("b1");
    const joined = fragments(calls).join(" ");
    expect(joined).toContain("booking.id");
    expect(joined).not.toContain("customer_user_id");
  });

  it("left-joins vendors and selects vendor.name", async () => {
    const { svc, calls } = makeService();
    await svc.adminGetById("b1");
    const join = calls.find((c) => c.method === "leftJoin");
    expect(join?.args).toEqual(["vendors", "vendor", "vendor.id = booking.vendor_id"]);
    const select = calls.find((c) => c.method === "addSelect");
    expect(select?.args).toEqual(["vendor.name", "vendor_name"]);
  });

  it("maps the raw vendor_name onto the returned booking", async () => {
    const { qb } = makeQb();
    const bookingRepo = { createQueryBuilder: () => qb };
    qb.getRawAndEntities = async () => ({
      entities: [{ id: "b1" }],
      raw: [{ vendor_name: "Acme Salon" }],
    });
    // biome-ignore lint/suspicious/noExplicitAny: mocked repository
    const svc = new BookingQueryService(bookingRepo as any);
    const result = await svc.adminGetById("b1");
    // biome-ignore lint/suspicious/noExplicitAny: partial mock booking shape
    expect(result as any).toEqual({ id: "b1", vendor_name: "Acme Salon" });
  });

  it("returns null when no booking matches", async () => {
    const { svc } = makeService();
    const result = await svc.adminGetById("missing");
    expect(result).toBeNull();
  });
});
