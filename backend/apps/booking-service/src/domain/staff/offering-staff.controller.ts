// offering-staff.controller.ts
//
// Task 0A (Phase 7 backend prerequisite) — GET /booking/offerings/:id/staff.
// The storefront PDP availability picker gets back bare `staff_options:
// string[]` ids from GET /services/:slug/availability (booking-service) and
// needs names/avatars to render + a staff filter. This is a PUBLIC read (no
// JWT) — see jwt-auth.ts's isPublicRoute for the tight GET-only bypass.
//
// ── Eligibility source (binding decision) ──────────────────────────────────
// Reuses StaffService.listEligible(offeringId, vendorLocationId, vendorId) —
// the SAME staff_service ∩ (optional staff_location) ∩ is_active ∩ (optional
// vendor_id) query AvailabilityService.resolveEligibleStaff
// (availability.service.ts) and the vendor-facing GET
// /vendor/booking/staff/eligible route both already use. This controller
// does NOT re-derive a new eligibility query — only the offering-published
// gate and the PII-free response mapping are new here.
//
// ── Consistency with availability (fix-cycle-1, review findings I-1/I-2) ───
// This controller now passes offering.vendor_id through to listEligible so
// a cross-vendor staff_services link (possible because linkService never
// checks the target offering's vendor) can never surface here — mirrors
// resolveEligibleStaff's `s.vendor_id = offering.vendor_id` filter (I-1).
// It also only forwards the `?location=` filter when the offering supports
// at_premises mode — a home-visit-only offering is never premises-bound, so
// availability never applies the staff_locations join for it either; mirror
// that gating here instead of over-filtering (I-2).
//
// ── Visibility rule (binding decision) ──────────────────────────────────────
// 404 unless the offering exists AND is `published` — mirrors
// AvailabilityController.getBySlug's own visibility gate exactly, so a
// storefront caller never sees staff for a draft/paused/archived offering
// while its availability read (also 404 in that case) stays consistent.
//
// ── PII-free shape (binding decision) ───────────────────────────────────────
// Only id/name/avatar_url/bio/rating/rating_count are read off StaffMember —
// user_id is never selected or returned.
import type { ServiceOffering } from "@materialhub/database";
import type { PublicStaffMember } from "@materialhub/dto";
import { NotFoundError } from "@materialhub/plugins";
import type { Repository } from "typeorm";
import type { StaffService } from "./staff.service.ts";

export class OfferingStaffController {
  constructor(
    private readonly offeringRepo: Repository<ServiceOffering>,
    private readonly staffService: StaffService,
  ) {}

  async list(offeringId: string, vendorLocationId?: string): Promise<PublicStaffMember[]> {
    const offering = await this.offeringRepo.findOne({
      where: { id: offeringId, status: "published" as ServiceOffering["status"] },
    });
    if (!offering) throw new NotFoundError("Service offering not found");

    // Availability only joins staff_locations for at_premises mode
    // (resolveEligibleStaff, availability.service.ts:177) — a home-visit-only
    // offering is never premises-bound, so a `?location=` here must be
    // dropped rather than over-filtering the eligible list.
    const locationFilter = offering.location_mode === "home_visit" ? undefined : vendorLocationId;

    const staff = await this.staffService.listEligible(
      offering.id,
      locationFilter,
      offering.vendor_id,
    );
    return staff.map((s) => ({
      id: s.id,
      name: s.name,
      avatar_url: s.avatar_url,
      bio: s.bio,
      rating: s.rating as unknown as string,
      rating_count: s.rating_count,
    }));
  }
}
