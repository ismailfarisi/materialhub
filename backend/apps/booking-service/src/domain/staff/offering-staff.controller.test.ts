// offering-staff.controller.test.ts
//
// Mocked-repo unit tests (no live DB) for OfferingStaffController (Task 0A).
// staffService is mocked at the listEligible() boundary — the actual
// staff_service ∩ staff_location ∩ is_active query is StaffService's own
// responsibility and isn't re-derived here (per the brief: reuse the
// eligibility source, don't re-derive it). These tests cover: published-only
// visibility, location-filter pass-through, and the PII-free response shape.
import { describe, expect, it, mock } from "bun:test";
import type { ServiceOffering } from "@materialhub/database";
import { NotFoundError } from "@materialhub/plugins";
import type { Repository } from "typeorm";
import { OfferingStaffController } from "./offering-staff.controller.ts";
import type { StaffService } from "./staff.service.ts";

const OFFERING_ID = "00000000-0000-0000-0000-0000000000f1";
const LOCATION_ID = "00000000-0000-0000-0000-0000000000ab";

const ELIGIBLE_STAFF = [
  {
    id: "staff-1",
    vendor_id: "vendor-1",
    user_id: "user-secret-1",
    name: "Aisha",
    avatar_url: "https://example.com/a.jpg",
    bio: "Senior stylist",
    is_active: true,
    rating: "4.50",
    rating_count: 12,
  },
  {
    id: "staff-2",
    vendor_id: "vendor-1",
    user_id: null,
    name: "Noor",
    avatar_url: null,
    bio: null,
    is_active: true,
    rating: "0.00",
    rating_count: 0,
  },
];

function makeHarness(opts: {
  offering?: Record<string, unknown> | null;
  listEligibleResult?: Record<string, unknown>[];
}) {
  const offering =
    opts.offering === undefined
      ? { id: OFFERING_ID, vendor_id: "vendor-1", status: "published" }
      : opts.offering;

  const offeringRepo = {
    findOne: mock(async () => offering),
  };

  const listEligible = mock(async () => opts.listEligibleResult ?? ELIGIBLE_STAFF);
  const staffService = { listEligible };

  const controller = new OfferingStaffController(
    offeringRepo as unknown as Repository<ServiceOffering>,
    staffService as unknown as StaffService,
  );

  return { controller, offeringRepo, listEligible };
}

describe("OfferingStaffController.list", () => {
  it("published offering: delegates to staffService.listEligible with the offering id and the offering's vendor_id", async () => {
    const { controller, listEligible } = makeHarness({});

    await controller.list(OFFERING_ID);

    expect(listEligible).toHaveBeenCalledWith(OFFERING_ID, undefined, "vendor-1");
  });

  it("location query param passed through to listEligible as the location filter (at_premises offering)", async () => {
    const { controller, listEligible } = makeHarness({
      offering: {
        id: OFFERING_ID,
        vendor_id: "vendor-1",
        status: "published",
        location_mode: "at_premises",
      },
    });

    await controller.list(OFFERING_ID, LOCATION_ID);

    expect(listEligible).toHaveBeenCalledWith(OFFERING_ID, LOCATION_ID, "vendor-1");
  });

  it("location query param passed through for an 'either' offering", async () => {
    const { controller, listEligible } = makeHarness({
      offering: {
        id: OFFERING_ID,
        vendor_id: "vendor-1",
        status: "published",
        location_mode: "either",
      },
    });

    await controller.list(OFFERING_ID, LOCATION_ID);

    expect(listEligible).toHaveBeenCalledWith(OFFERING_ID, LOCATION_ID, "vendor-1");
  });

  // Fix-cycle-1, review finding I-2: availability's resolveEligibleStaff only
  // joins staff_locations for at_premises mode — a home-visit-only offering
  // is never premises-bound, so a `?location=` here must be dropped instead
  // of over-filtering vs what availability's staff_options would contain.
  it("location query param dropped for a home-visit-only offering (mirrors availability's mode gating)", async () => {
    const { controller, listEligible } = makeHarness({
      offering: {
        id: OFFERING_ID,
        vendor_id: "vendor-1",
        status: "published",
        location_mode: "home_visit",
      },
    });

    await controller.list(OFFERING_ID, LOCATION_ID);

    expect(listEligible).toHaveBeenCalledWith(OFFERING_ID, undefined, "vendor-1");
  });

  it("offering not found: NotFoundError, listEligible never called", async () => {
    const { controller, listEligible } = makeHarness({ offering: null });

    await expect(controller.list(OFFERING_ID)).rejects.toBeInstanceOf(NotFoundError);
    expect(listEligible).not.toHaveBeenCalled();
  });

  it("offering exists but is not published: NotFoundError (findOne's own status filter returns null)", async () => {
    // The repo's `where: { status: "published" }` filter means a draft/paused/
    // archived offering simply doesn't match — mirrors
    // AvailabilityController.getBySlug's identical visibility gate.
    const { controller, listEligible } = makeHarness({ offering: null });

    await expect(controller.list(OFFERING_ID)).rejects.toBeInstanceOf(NotFoundError);
    expect(listEligible).not.toHaveBeenCalled();
  });

  it("response rows are PII-free: only id/name/avatar_url/bio/rating/rating_count, never user_id", async () => {
    const { controller } = makeHarness({});

    const rows = await controller.list(OFFERING_ID);

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(
        ["avatar_url", "bio", "id", "name", "rating", "rating_count"].sort(),
      );
      expect(row).not.toHaveProperty("user_id");
      expect(row).not.toHaveProperty("vendor_id");
      expect(row).not.toHaveProperty("is_active");
    }
    expect(rows[0]).toEqual({
      id: "staff-1",
      name: "Aisha",
      avatar_url: "https://example.com/a.jpg",
      bio: "Senior stylist",
      rating: "4.50",
      rating_count: 12,
    });
  });

  it("empty eligibility result: returns an empty array, not an error", async () => {
    const { controller } = makeHarness({ listEligibleResult: [] });

    const rows = await controller.list(OFFERING_ID);

    expect(rows).toEqual([]);
  });
});
