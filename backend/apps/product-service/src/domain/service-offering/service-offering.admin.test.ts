import { describe, expect, it } from "bun:test";
import { ServiceOfferingStatus } from "@materialhub/database";
import { ServiceOfferingService } from "./service-offering.service.ts";

function makeAdminService(offering: Record<string, unknown> | null) {
  const vendorUpdates: Array<Record<string, unknown>> = [];
  const offeringRepo = {
    findOne: async () => (offering ? { ...offering } : null),
    save: async (o: Record<string, unknown>) => o,
  };
  const vendorRepo = {
    findOne: async () => ({ id: "v1", services_trusted: false }),
    update: async (id: string, patch: Record<string, unknown>) => {
      vendorUpdates.push({ id, ...patch });
      return { affected: 1 };
    },
  };
  // Passed explicitly so approve()/reject() don't fall through to the real
  // enqueueServiceSearchSync default, which would try to reach a live Redis.
  const onWrite = async () => {};
  const svc = new ServiceOfferingService(
    // biome-ignore lint/suspicious/noExplicitAny: mocked repositories
    offeringRepo as any,
    // biome-ignore lint/suspicious/noExplicitAny: mocked repositories
    {} as any,
    // biome-ignore lint/suspicious/noExplicitAny: mocked repositories
    vendorRepo as any,
    onWrite,
  );
  return { svc, vendorUpdates };
}

describe("ServiceOfferingService admin actions", () => {
  it("approve publishes the offering and trusts the vendor", async () => {
    const { svc, vendorUpdates } = makeAdminService({
      id: "o1",
      vendor_id: "v1",
      status: ServiceOfferingStatus.pending_review,
    });
    const result = await svc.approve("o1", "admin-1");
    expect(result.status).toBe(ServiceOfferingStatus.published);
    expect(result.reviewed_by).toBe("admin-1");
    expect(result.reviewed_at).toBeInstanceOf(Date);
    expect(vendorUpdates).toEqual([{ id: "v1", services_trusted: true }]);
  });

  it("reject records the reason and does not trust the vendor", async () => {
    const { svc, vendorUpdates } = makeAdminService({
      id: "o1",
      vendor_id: "v1",
      status: ServiceOfferingStatus.pending_review,
    });
    const result = await svc.reject("o1", "admin-1", "Stock photography");
    expect(result.status).toBe(ServiceOfferingStatus.rejected);
    expect(result.rejection_reason).toBe("Stock photography");
    expect(result.reviewed_by).toBe("admin-1");
    expect(vendorUpdates).toEqual([]);
  });

  it("reject refuses an empty reason", async () => {
    const { svc } = makeAdminService({
      id: "o1",
      vendor_id: "v1",
      status: ServiceOfferingStatus.pending_review,
    });
    await expect(svc.reject("o1", "admin-1", "   ")).rejects.toThrow();
  });

  it("approve throws when the offering does not exist", async () => {
    const { svc } = makeAdminService(null);
    await expect(svc.approve("missing", "admin-1")).rejects.toThrow();
  });

  it("approve refuses an offering that is not pending_review", async () => {
    const { svc } = makeAdminService({
      id: "o1",
      vendor_id: "v1",
      status: ServiceOfferingStatus.published,
    });
    await expect(svc.approve("o1", "admin-1")).rejects.toThrow();
  });
});

// Captures the QueryBuilder calls so we can assert on the SQL fragments and
// bound parameters without a live database (a shared AppDataSource pg pool
// crashes under `bun test`).
function makeQb() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const qb: Record<string, unknown> = {};
  for (const m of ["where", "andWhere", "orderBy", "skip", "take"]) {
    qb[m] = (...args: unknown[]) => {
      calls.push({ method: m, args });
      return qb;
    };
  }
  qb.getManyAndCount = async () => [[], 0];
  return { qb, calls };
}

function fragments(calls: Array<{ method: string; args: unknown[] }>): string[] {
  return calls
    .filter((c) => c.method === "where" || c.method === "andWhere")
    .map((c) => String(c.args[0]));
}

function makeAdminListService() {
  const { qb, calls } = makeQb();
  const offeringRepo = { createQueryBuilder: () => qb };
  const svc = new ServiceOfferingService(
    // biome-ignore lint/suspicious/noExplicitAny: mocked repositories
    offeringRepo as any,
    // biome-ignore lint/suspicious/noExplicitAny: mocked repositories
    {} as any,
    // biome-ignore lint/suspicious/noExplicitAny: mocked repositories
    {} as any,
  );
  return { svc, calls };
}

function makeAdminGetByIdService(offering: Record<string, unknown> | null) {
  const findOneCalls: unknown[] = [];
  const offeringRepo = {
    findOne: async (opts: unknown) => {
      findOneCalls.push(opts);
      return offering ? { ...offering } : null;
    },
  };
  const svc = new ServiceOfferingService(
    // biome-ignore lint/suspicious/noExplicitAny: mocked repositories
    offeringRepo as any,
    // biome-ignore lint/suspicious/noExplicitAny: mocked repositories
    {} as any,
    // biome-ignore lint/suspicious/noExplicitAny: mocked repositories
    {} as any,
  );
  return { svc, findOneCalls };
}

describe("ServiceOfferingService.adminList", () => {
  it("paginates with defaults page=1 limit=20", async () => {
    const { svc, calls } = makeAdminListService();
    await svc.adminList({});
    expect(calls.find((c) => c.method === "skip")?.args[0]).toBe(0);
    expect(calls.find((c) => c.method === "take")?.args[0]).toBe(20);
  });

  it("computes the offset from an explicit page and limit", async () => {
    const { svc, calls } = makeAdminListService();
    await svc.adminList({ page: 3, limit: 10 });
    expect(calls.find((c) => c.method === "skip")?.args[0]).toBe(20);
    expect(calls.find((c) => c.method === "take")?.args[0]).toBe(10);
  });

  it("applies the status filter when present", async () => {
    const { svc, calls } = makeAdminListService();
    await svc.adminList({ status: "published" });
    const joined = fragments(calls).join(" ");
    expect(joined).toContain("offering.status = :status");
  });

  it("applies the vendorId filter when present", async () => {
    const { svc, calls } = makeAdminListService();
    await svc.adminList({ vendorId: "v1" });
    const joined = fragments(calls).join(" ");
    expect(joined).toContain("offering.vendor_id = :vendorId");
  });

  it("applies the search filter when present", async () => {
    const { svc, calls } = makeAdminListService();
    await svc.adminList({ search: "massage" });
    const joined = fragments(calls).join(" ");
    expect(joined).toContain("offering.name ILIKE :search");
  });

  it("applies no filters when none are provided", async () => {
    const { svc, calls } = makeAdminListService();
    await svc.adminList({});
    expect(fragments(calls)).toEqual([]);
  });

  it("orders by created_at DESC", async () => {
    const { svc, calls } = makeAdminListService();
    await svc.adminList({});
    expect(calls.find((c) => c.method === "orderBy")?.args).toEqual([
      "offering.created_at",
      "DESC",
    ]);
  });
});

describe("ServiceOfferingService.adminGetById", () => {
  it("looks up the offering by id", async () => {
    const { svc, findOneCalls } = makeAdminGetByIdService({ id: "o1", vendor_id: "v1" });
    const result = await svc.adminGetById("o1");
    expect(findOneCalls).toEqual([{ where: { id: "o1" } }]);
    expect(result?.id).toBe("o1");
  });

  it("returns null when the offering does not exist", async () => {
    const { svc } = makeAdminGetByIdService(null);
    const result = await svc.adminGetById("missing");
    expect(result).toBeNull();
  });
});
