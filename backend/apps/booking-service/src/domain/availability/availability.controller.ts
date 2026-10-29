import type { ServiceOffering } from "@materialhub/database";
import { NotFoundError, UnprocessableEntityError } from "@materialhub/plugins";
import type { Repository } from "typeorm";
import type { AvailabilityResult, AvailabilityService } from "./availability.service.ts";

// Hard ceiling on how wide a single availability query may be, independent of the
// offering's max_advance_days (which further caps the far edge).
const MAX_RANGE_DAYS = 62;
const DAY_MS = 86_400_000;

export interface AvailabilityQuery {
  location?: string;
  area?: string;
  staff?: string;
  from?: string;
  to?: string;
}

export class AvailabilityController {
  constructor(
    private readonly availabilityService: AvailabilityService,
    private readonly offeringRepo: Repository<ServiceOffering>,
  ) {}

  // Public PDP availability: resolve the offering by slug, validate + clamp the
  // window, then delegate to the availability engine.
  async getBySlug(slug: string, query: AvailabilityQuery): Promise<AvailabilityResult> {
    const offering = await this.offeringRepo.findOne({
      where: { slug, status: "published" as ServiceOffering["status"] },
    });
    if (!offering) throw new NotFoundError("Service offering not found");

    if (!query.from || !query.to) {
      throw new UnprocessableEntityError("from and to are required (ISO dates)");
    }
    let from = new Date(query.from);
    let to = new Date(query.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new UnprocessableEntityError("from and to must be valid ISO dates");
    }
    if (to.getTime() < from.getTime()) {
      throw new UnprocessableEntityError("from must be on or before to");
    }
    if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) {
      throw new UnprocessableEntityError(`range must not exceed ${MAX_RANGE_DAYS} days`);
    }

    // Clamp BOTH edges to what is actually bookable. Past days can never yield a
    // slot (applyBookingWindow drops them all), but an unclamped `from` still
    // pays for the full expansion and pollutes the cache with dead day-keys —
    // free compute amplification for an anonymous caller.
    const now = new Date();
    if (from.getTime() < now.getTime()) from = now;
    const maxTo = new Date(now.getTime() + offering.max_advance_days * DAY_MS);
    if (to.getTime() > maxTo.getTime()) to = maxTo;

    return this.availabilityService.getAvailability({
      offeringId: offering.id,
      locationId: query.location,
      customerAreaId: query.area,
      staffId: query.staff,
      from,
      to,
      now,
    });
  }
}
