import { describe, expect, it, mock } from "bun:test";
import type {
  ServiceOffering,
  StaffLocation,
  StaffMember,
  StaffService as StaffServiceEntity,
  VendorLocation,
} from "@materialhub/database";
import { NotFoundError } from "@materialhub/plugins";
import type { Repository } from "typeorm";
import { StaffService } from "./staff.service.ts";

const VENDOR = "00000000-0000-0000-0000-00000000000a";

function make(opts?: {
  staffFindOne?: () => Promise<Partial<StaffMember> | null>;
  slFindOne?: () => Promise<Partial<StaffLocation> | null>;
  slFind?: () => Promise<Array<Partial<StaffLocation>>>;
  ssFind?: () => Promise<Array<Partial<StaffServiceEntity>>>;
  vendorLocationFind?: (args: unknown) => Promise<Array<Partial<VendorLocation>>>;
  offeringFind?: (args: unknown) => Promise<Array<Partial<ServiceOffering>>>;
}) {
  const savedLinks: Array<Partial<StaffLocation>> = [];
  const staffRepo = {
    create: (o: Partial<StaffMember>) => o,
    save: (o: Partial<StaffMember>) => Promise.resolve({ id: "s1", ...o }),
    find: () => Promise.resolve([]),
    findOne: opts?.staffFindOne ?? (() => Promise.resolve({ id: "s1", vendor_id: VENDOR })),
  } as unknown as Repository<StaffMember>;
  const staffLocationRepo = {
    create: (o: Partial<StaffLocation>) => o,
    save: (o: Partial<StaffLocation>) => {
      savedLinks.push(o);
      return Promise.resolve({ id: "sl1", ...o });
    },
    find: opts?.slFind ?? (() => Promise.resolve([])),
    findOne: opts?.slFindOne ?? (() => Promise.resolve(null)),
    softRemove: () => Promise.resolve({}),
  } as unknown as Repository<StaffLocation>;
  const staffServiceRepo = {
    create: (o: Partial<StaffServiceEntity>) => o,
    save: (o: Partial<StaffServiceEntity>) => Promise.resolve({ id: "ss1", ...o }),
    find: opts?.ssFind ?? (() => Promise.resolve([])),
    findOne: () => Promise.resolve(null),
    softRemove: () => Promise.resolve({}),
  } as unknown as Repository<StaffServiceEntity>;
  const vendorLocationRepo = {
    find: opts?.vendorLocationFind ?? (() => Promise.resolve([])),
  } as unknown as Repository<VendorLocation>;
  const offeringRepo = {
    find: opts?.offeringFind ?? (() => Promise.resolve([])),
  } as unknown as Repository<ServiceOffering>;
  return {
    svc: new StaffService(
      staffRepo,
      staffLocationRepo,
      staffServiceRepo,
      vendorLocationRepo,
      offeringRepo,
    ),
    savedLinks,
  };
}

describe("StaffService.create / update", () => {
  it("scopes a new staff member to the vendor", async () => {
    const { svc } = make();
    const staff = await svc.create(VENDOR, { name: "Aisha" });
    expect(staff.vendor_id).toBe(VENDOR);
    expect(staff.name).toBe("Aisha");
  });

  it("update throws NotFoundError when the staff member is not the vendor's", async () => {
    const { svc } = make({ staffFindOne: () => Promise.resolve(null) });
    await expect(svc.update(VENDOR, "x", { name: "New" })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("StaffService.linkLocation", () => {
  it("throws NotFoundError when the staff member is not owned by the vendor", async () => {
    const { svc } = make({ staffFindOne: () => Promise.resolve(null) });
    await expect(svc.linkLocation(VENDOR, "s1", "loc1")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("is idempotent — returns the existing link without creating a duplicate", async () => {
    const existing = { id: "sl-existing", staff_member_id: "s1", vendor_location_id: "loc1" };
    const { svc, savedLinks } = make({ slFindOne: () => Promise.resolve(existing) });
    const link = await svc.linkLocation(VENDOR, "s1", "loc1");
    expect(link).toEqual(existing as unknown as StaffLocation);
    expect(savedLinks).toHaveLength(0);
  });

  it("creates a new link when none exists", async () => {
    const { svc, savedLinks } = make({ slFindOne: () => Promise.resolve(null) });
    const link = await svc.linkLocation(VENDOR, "s1", "loc1");
    expect(link.vendor_location_id).toBe("loc1");
    expect(savedLinks).toHaveLength(1);
  });
});

// ── StaffService.listEligible ───────────────────────────────────────────────
// Mocked-repo unit tests (fix-cycle-1, review findings I-1/I-2/I-4) driving
// the ACTUAL query-builder logic — unlike offering-staff.controller.test.ts,
// which mocks listEligible() at the boundary and so cannot see this
// filtering mechanics at all (that gap is exactly what I-4 flagged). The
// fake query builder below records every innerJoin/where/andWhere predicate
// staff.service.ts builds and replays them against an in-memory staff
// dataset in getMany(), so these tests exercise the real filter combinators
// (service-link ∩ optional vendor_id ∩ optional location) rather than only
// asserting SQL-string fragments.
describe("StaffService.listEligible", () => {
  const OFFERING_A = "offering-a";
  const VENDOR_A = "vendor-a";
  const VENDOR_B = "vendor-b";
  const LOCATION_A = "loc-a";

  // staff-A: vendor-A's own staff, linked to offering-A and location-A.
  // staff-B: vendor-B's staff — but ALSO linked to offering-A's
  // staff_services table (the cross-vendor link the review's I-1 finding
  // says linkService never prevents). Without the vendor_id filter, staff-B
  // would incorrectly surface as eligible for vendor-A's offering.
  const STAFF = [
    { id: "staff-A", vendor_id: VENDOR_A, is_active: true, name: "Aisha" },
    { id: "staff-B", vendor_id: VENDOR_B, is_active: true, name: "Bilal" },
    { id: "staff-C", vendor_id: VENDOR_A, is_active: false, name: "Cara" }, // inactive
  ];
  const STAFF_SERVICES: Array<{ staff_member_id: string; service_offering_id: string }> = [
    { staff_member_id: "staff-A", service_offering_id: OFFERING_A },
    { staff_member_id: "staff-B", service_offering_id: OFFERING_A },
    { staff_member_id: "staff-C", service_offering_id: OFFERING_A },
  ];
  const STAFF_LOCATIONS: Array<{ staff_member_id: string; vendor_location_id: string }> = [
    { staff_member_id: "staff-A", vendor_location_id: LOCATION_A },
  ];

  function makeEligibleHarness() {
    type Predicate = { sql: string; params?: Record<string, unknown> };
    const joins: Predicate[] = [];
    const wheres: Predicate[] = [];

    // biome-ignore lint/suspicious/noExplicitAny: minimal fake query builder
    const qb: any = {};
    qb.innerJoin = mock((_table: string, _alias: string, sql: string, params?: unknown) => {
      joins.push({ sql, params: params as Record<string, unknown> });
      return qb;
    });
    qb.where = mock((sql: string, params?: unknown) => {
      wheres.push({ sql, params: params as Record<string, unknown> });
      return qb;
    });
    qb.andWhere = mock((sql: string, params?: unknown) => {
      wheres.push({ sql, params: params as Record<string, unknown> });
      return qb;
    });
    qb.orderBy = mock(() => qb);
    qb.getMany = mock(async () => {
      const offeringIdJoin = joins.find((j) => j.sql.includes("ss.service_offering_id"));
      const offeringId = offeringIdJoin?.params?.serviceOfferingId as string | undefined;
      const vendorWhere = wheres.find((w) => w.sql.includes("s.vendor_id = :vendorId"));
      const vendorId = vendorWhere?.params?.vendorId as string | undefined;
      const locationJoin = joins.find((j) => j.sql.includes("sl.vendor_location_id"));
      const vendorLocationId = locationJoin?.params?.vendorLocationId as string | undefined;

      return STAFF.filter((s) => {
        if (!s.is_active) return false;
        if (
          !STAFF_SERVICES.some(
            (ss) => ss.staff_member_id === s.id && ss.service_offering_id === offeringId,
          )
        )
          return false;
        if (vendorId && s.vendor_id !== vendorId) return false;
        if (
          vendorLocationId &&
          !STAFF_LOCATIONS.some(
            (sl) => sl.staff_member_id === s.id && sl.vendor_location_id === vendorLocationId,
          )
        )
          return false;
        return true;
      });
    });

    const staffRepo = { createQueryBuilder: mock(() => qb) };
    const svc = new StaffService(
      staffRepo as unknown as Repository<StaffMember>,
      {} as unknown as Repository<StaffLocation>,
      {} as unknown as Repository<StaffServiceEntity>,
      {} as unknown as Repository<VendorLocation>,
      {} as unknown as Repository<ServiceOffering>,
    );
    return { svc, qb };
  }

  it("cross-vendor case: a staff member linked to the offering but belonging to a DIFFERENT vendor is excluded once vendorId is passed", async () => {
    const { svc } = makeEligibleHarness();

    const result = await svc.listEligible(OFFERING_A, undefined, VENDOR_A);

    expect(result.map((s) => s.id)).toEqual(["staff-A"]);
    expect(result.some((s) => s.id === "staff-B")).toBe(false);
  });

  it("vendor route call site is unchanged: omitting vendorId returns staff across vendors (no vendor_id predicate added)", async () => {
    const { svc, qb } = makeEligibleHarness();

    const result = await svc.listEligible(OFFERING_A);

    // Preserves the existing GET /vendor/booking/staff/eligible behavior —
    // no vendor_id predicate is ever added when the caller omits vendorId.
    expect(result.map((s) => s.id).sort()).toEqual(["staff-A", "staff-B"]);
    expect(qb.andWhere).not.toHaveBeenCalledWith("s.vendor_id = :vendorId", expect.anything());
  });

  it("inactive staff are always excluded regardless of vendorId", async () => {
    const { svc } = makeEligibleHarness();

    const result = await svc.listEligible(OFFERING_A, undefined, VENDOR_A);

    expect(result.some((s) => s.id === "staff-C")).toBe(false);
  });

  it("location filter combines with the vendor filter (both applied)", async () => {
    const { svc } = makeEligibleHarness();

    const result = await svc.listEligible(OFFERING_A, LOCATION_A, VENDOR_A);

    expect(result.map((s) => s.id)).toEqual(["staff-A"]);
  });
});

// ── StaffService.getLinkedLocations / getLinkedServices ─────────────────────
// Fix-cycle-1 finding I-3 — mocked-repo tests for the two new read endpoints:
// vendor scoping (assertOwnStaff's 404-hide-existence, reused unchanged from
// the write paths) and response shape (resolved location/offering rows, not
// bare join-table ids).
describe("StaffService.getLinkedLocations", () => {
  it("throws NotFoundError when the staff member is not owned by the vendor", async () => {
    const { svc } = make({ staffFindOne: () => Promise.resolve(null) });
    await expect(svc.getLinkedLocations(VENDOR, "s1")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("returns an empty array when the staff member has no location links (no repo call)", async () => {
    const vendorLocationFind = mock(() => Promise.resolve([]));
    const { svc } = make({ slFind: () => Promise.resolve([]), vendorLocationFind });
    const result = await svc.getLinkedLocations(VENDOR, "s1");
    expect(result).toEqual([]);
    expect(vendorLocationFind).not.toHaveBeenCalled();
  });

  it("resolves linked vendor_location rows (shape: full VendorLocation, not bare ids)", async () => {
    const vendorLocationFind = mock(() =>
      Promise.resolve([
        { id: "loc-1", name: "Downtown", timezone: "Asia/Dubai" },
        { id: "loc-2", name: "Marina", timezone: "Asia/Dubai" },
      ]),
    );
    const { svc } = make({
      slFind: () =>
        Promise.resolve([
          { staff_member_id: "s1", vendor_location_id: "loc-1" },
          { staff_member_id: "s1", vendor_location_id: "loc-2" },
        ]),
      vendorLocationFind,
    });
    const result = await svc.getLinkedLocations(VENDOR, "s1");
    expect(result.map((l) => l.id)).toEqual(["loc-1", "loc-2"]);
    expect(result[0]).toMatchObject({ name: "Downtown" });
    expect(vendorLocationFind).toHaveBeenCalledTimes(1);
  });
});

describe("StaffService.getLinkedServices", () => {
  it("throws NotFoundError when the staff member is not owned by the vendor", async () => {
    const { svc } = make({ staffFindOne: () => Promise.resolve(null) });
    await expect(svc.getLinkedServices(VENDOR, "s1")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("returns an empty array when the staff member has no service links (no repo call)", async () => {
    const offeringFind = mock(() => Promise.resolve([]));
    const { svc } = make({ ssFind: () => Promise.resolve([]), offeringFind });
    const result = await svc.getLinkedServices(VENDOR, "s1");
    expect(result).toEqual([]);
    expect(offeringFind).not.toHaveBeenCalled();
  });

  it("resolves linked service_offering rows (shape: full ServiceOffering, includes name)", async () => {
    const offeringFind = mock(() =>
      Promise.resolve([{ id: "off-1", name: "Haircut", price_fils: 5000, duration_minutes: 30 }]),
    );
    const { svc } = make({
      ssFind: () => Promise.resolve([{ staff_member_id: "s1", service_offering_id: "off-1" }]),
      offeringFind,
    });
    const result = await svc.getLinkedServices(VENDOR, "s1");
    expect(result.map((o) => o.id)).toEqual(["off-1"]);
    expect(result[0]).toMatchObject({ name: "Haircut" });
    expect(offeringFind).toHaveBeenCalledTimes(1);
  });

  it("cross-vendor case: a staff member linked to an offering from a DIFFERENT vendor is excluded", async () => {
    const VENDOR_A = "vendor-a";
    const VENDOR_B = "vendor-b";
    const vendorId = VENDOR_A;
    const offeringFind = mock((args: unknown) => {
      // The service calls: offeringRepo.find({ where: { id: In(...), vendor_id: vendorId } })
      // So we receive { where: { id: In(...), vendor_id: "vendor-a" } }
      const findArgs = args as { where?: { vendor_id?: string } };
      const filterVendorId = findArgs.where?.vendor_id;
      if (filterVendorId === VENDOR_A) {
        return Promise.resolve([
          { id: "off-A", name: "Haircut", price_fils: 5000, vendor_id: VENDOR_A },
        ]);
      }
      // If no vendor filter (testing old behavior), would return both offerings
      return Promise.resolve([
        { id: "off-A", name: "Haircut", price_fils: 5000, vendor_id: VENDOR_A },
        { id: "off-B", name: "Massage", price_fils: 10000, vendor_id: VENDOR_B },
      ]);
    });
    const { svc } = make({
      ssFind: () =>
        Promise.resolve([
          { staff_member_id: "s1", service_offering_id: "off-A" },
          { staff_member_id: "s1", service_offering_id: "off-B" }, // cross-vendor link
        ]),
      offeringFind,
    });
    const result = await svc.getLinkedServices(vendorId, "s1");
    // Should only return the offering from VENDOR_A, excluding the cross-vendor one
    expect(result.map((o) => o.id)).toEqual(["off-A"]);
    expect(result.some((o) => o.id === "off-B")).toBe(false);
    // Verify the filter was applied
    expect(offeringFind).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ vendor_id: vendorId }) }),
    );
  });
});
