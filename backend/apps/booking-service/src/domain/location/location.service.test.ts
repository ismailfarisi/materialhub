import { describe, expect, it } from "bun:test";
import type { ServiceArea, VendorLocation } from "@materialhub/database";
import { ConflictError, NotFoundError, UnprocessableEntityError } from "@materialhub/plugins";
import type { Repository } from "typeorm";
import { LocationService } from "./location.service.ts";

const VENDOR_A = "00000000-0000-0000-0000-00000000000a";

// Mocked-repo unit test (CI-safe, no live DB) — mirrors the product-service
// convention. Asserts the service's own logic: vendor scoping, defaults, the
// active-only filter it hands the repo, and NotFoundError on missing rows.
// (DB-enforced behaviour — partial unique indexes, is_active filtering — is
// covered by the migration; live CRUD was verified out-of-band.)
function makeService(opts?: {
  locFindOne?: () => Promise<Partial<VendorLocation> | null>;
  areaFindOne?: () => Promise<Partial<ServiceArea> | null>;
  areaSave?: (o: Partial<ServiceArea>) => Promise<Partial<ServiceArea>>;
}) {
  const saved: Array<Partial<VendorLocation>> = [];
  const findCalls: Array<Record<string, unknown>> = [];
  let softRemoved = 0;

  const locationRepo = {
    create: (o: Partial<VendorLocation>) => o,
    save: (o: Partial<VendorLocation>) => {
      saved.push(o);
      return Promise.resolve({ id: "loc-id", ...o });
    },
    find: (args: { where: Record<string, unknown> }) => {
      findCalls.push(args.where);
      return Promise.resolve([]);
    },
    findOne: opts?.locFindOne ?? (() => Promise.resolve(null)),
  } as unknown as Repository<VendorLocation>;

  const serviceAreaRepo = {
    create: (o: Partial<ServiceArea>) => o,
    save: opts?.areaSave ?? ((o: Partial<ServiceArea>) => Promise.resolve({ id: "area-id", ...o })),
    find: () => Promise.resolve([]),
    findOne: opts?.areaFindOne ?? (() => Promise.resolve(null)),
    softRemove: () => {
      softRemoved++;
      return Promise.resolve({});
    },
  } as unknown as Repository<ServiceArea>;

  return {
    // No-op 3rd arg: LocationService's default onAreasChanged talks to a live
    // Redis (service-search-notify.ts). Without this override, every write in
    // this file would hang/ECONNREFUSED against a real connection instead of
    // running as a mocked-repo unit test.
    svc: new LocationService(locationRepo, serviceAreaRepo, async () => {}),
    saved,
    findCalls,
    softRemovedCount: () => softRemoved,
  };
}

describe("LocationService.create", () => {
  it("scopes the location to the vendor and passes the body through", async () => {
    const { svc } = makeService();
    const loc = await svc.create(VENDOR_A, { name: "Downtown", timezone: "Asia/Dubai" });
    expect(loc.vendor_id).toBe(VENDOR_A);
    expect(loc.name).toBe("Downtown");
    expect(loc.timezone).toBe("Asia/Dubai");
  });
});

describe("LocationService.update / get", () => {
  it("throws NotFoundError when the location is not owned by the vendor", async () => {
    const { svc } = makeService({ locFindOne: () => Promise.resolve(null) });
    await expect(svc.update(VENDOR_A, "x", { name: "New" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(svc.get(VENDOR_A, "x")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("applies the patch and saves when found", async () => {
    const { svc, saved } = makeService({
      locFindOne: () => Promise.resolve({ id: "x", vendor_id: VENDOR_A, name: "Old" }),
    });
    const updated = await svc.update(VENDOR_A, "x", { name: "Renamed", is_active: false });
    expect(updated.name).toBe("Renamed");
    expect(updated.is_active).toBe(false);
    expect(saved[0]).toMatchObject({ id: "x", name: "Renamed", is_active: false });
  });
});

describe("LocationService.listActiveForVendor", () => {
  it("filters to the vendor and active branches only", async () => {
    const { svc, findCalls } = makeService();
    await svc.listActiveForVendor(VENDOR_A);
    expect(findCalls[0]).toMatchObject({ vendor_id: VENDOR_A, is_active: true });
  });
});

describe("LocationService service areas", () => {
  it("defaults travel_buffer_minutes to 0 and scopes to the vendor", async () => {
    const { svc } = makeService();
    const area = await svc.addServiceArea(VENDOR_A, { area_id: "area-uuid" });
    expect(area.vendor_id).toBe(VENDOR_A);
    expect(area.area_id).toBe("area-uuid");
    expect(area.travel_buffer_minutes).toBe(0);
  });

  it("removeServiceArea throws NotFoundError when missing, soft-removes when found", async () => {
    const missing = makeService({ areaFindOne: () => Promise.resolve(null) });
    await expect(missing.svc.removeServiceArea(VENDOR_A, "x")).rejects.toBeInstanceOf(
      NotFoundError,
    );

    const present = makeService({
      areaFindOne: () => Promise.resolve({ id: "x", vendor_id: VENDOR_A }),
    });
    await present.svc.removeServiceArea(VENDOR_A, "x");
    expect(present.softRemovedCount()).toBe(1);
  });

  // Fix-cycle-1 finding M-1 — a Postgres unique-violation (23505) on the
  // (vendor_id, area_id) partial index used to fall through to a generic 500
  // (no HttpError). Assert it now maps to a clean 409 ConflictError.
  it("addServiceArea maps a unique-violation (23505) save error to ConflictError", async () => {
    const { svc } = makeService({
      areaSave: () => {
        const err = Object.assign(new Error("duplicate key value"), { code: "23505" });
        return Promise.reject(err);
      },
    });
    await expect(svc.addServiceArea(VENDOR_A, { area_id: "area-uuid" })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("addServiceArea re-throws a non-unique-violation save error unchanged", async () => {
    const boom = new Error("connection reset");
    const { svc } = makeService({ areaSave: () => Promise.reject(boom) });
    await expect(svc.addServiceArea(VENDOR_A, { area_id: "area-uuid" })).rejects.toBe(boom);
  });
});

// Fix-cycle-1 finding I-2 — an invalid IANA timezone string used to be stored
// as-is (only a maxLength check at the DTO layer) and later blew up a
// downstream `Intl.DateTimeFormat` call as an uncaught 500 on the public
// availability endpoint. Assert the service now rejects it at write time.
describe("LocationService timezone validation", () => {
  it("create rejects a syntactically-plausible but invalid IANA zone with UnprocessableEntityError", async () => {
    const { svc } = makeService();
    await expect(
      svc.create(VENDOR_A, { name: "Typo Branch", timezone: "Asia/Dubay" }),
    ).rejects.toBeInstanceOf(UnprocessableEntityError);
  });

  it("create accepts a valid IANA zone", async () => {
    const { svc } = makeService();
    const loc = await svc.create(VENDOR_A, { name: "Downtown", timezone: "Asia/Dubai" });
    expect(loc.timezone).toBe("Asia/Dubai");
  });

  it("create accepts an omitted timezone (falls back to the entity/DB default)", async () => {
    const { svc } = makeService();
    await expect(svc.create(VENDOR_A, { name: "No TZ" })).resolves.toBeTruthy();
  });

  it("update rejects an invalid IANA zone", async () => {
    const { svc } = makeService({
      locFindOne: () => Promise.resolve({ id: "x", vendor_id: VENDOR_A, name: "Old" }),
    });
    await expect(svc.update(VENDOR_A, "x", { timezone: "Not/AZone" })).rejects.toBeInstanceOf(
      UnprocessableEntityError,
    );
  });

  it("update omitting timezone leaves the existing value untouched (no validation call, no crash)", async () => {
    const { svc, saved } = makeService({
      locFindOne: () => Promise.resolve({ id: "x", vendor_id: VENDOR_A, timezone: "Asia/Dubai" }),
    });
    const updated = await svc.update(VENDOR_A, "x", { name: "Renamed" });
    expect(updated.timezone).toBe("Asia/Dubai");
    expect(saved[0]).toMatchObject({ name: "Renamed" });
  });
});
