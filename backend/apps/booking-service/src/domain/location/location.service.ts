import type { ServiceArea, VendorLocation } from "@materialhub/database";
import { ConflictError, NotFoundError, UnprocessableEntityError } from "@materialhub/plugins";
import type { Repository } from "typeorm";
import { notifyVendorAreasChanged } from "./service-search-notify.ts";

// Fix-cycle-1 finding M-1 — same pattern as
// domain/reviews/service-review.service.ts's isUniqueViolation: a Postgres
// unique-violation (the partial index on (vendor_id, area_id) WHERE
// deleted_at IS NULL) isn't an HttpError on its own, so the shared
// errorHandler would otherwise fall through to a generic 500.
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

// Fix-cycle-1 finding I-2 — an invalid IANA zone string was previously stored
// as-is (only a maxLength check at the DTO layer) and later threw an uncaught
// RangeError from `new Intl.DateTimeFormat(..., { timeZone })` inside
// interval-math.ts's tzOffsetMs/localDateParts/dayOfWeekUtcNoon, surfacing as
// a 500 on the PUBLIC `GET /services/:slug/availability` endpoint for every
// offering tied to that location. Reject it here instead, at write time.
function assertValidTimezone(timezone: string | undefined | null): void {
  if (timezone === undefined || timezone === null) return;
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    throw new UnprocessableEntityError(`Invalid timezone: "${timezone}"`);
  }
}

export interface CreateVendorLocationInput {
  name: string;
  address?: Record<string, unknown> | null;
  lat?: number | null;
  lng?: number | null;
  area_id?: string | null;
  timezone?: string;
  is_active?: boolean;
  settings?: Record<string, unknown>;
}
export type UpdateVendorLocationInput = Partial<CreateVendorLocationInput>;

export interface CreateServiceAreaInput {
  area_id: string;
  travel_buffer_minutes?: number;
}

export class LocationService {
  constructor(
    private readonly locationRepo: Repository<VendorLocation>,
    private readonly serviceAreaRepo: Repository<ServiceArea>,
    // Fan-out hook: any change to this vendor's branches or service areas
    // invalidates the area_ids of every offering they publish. Injected so
    // unit tests can observe it without a live Redis.
    private readonly onAreasChanged: (vendorId: string) => Promise<void> = notifyVendorAreasChanged,
  ) {}

  async create(vendorId: string, body: CreateVendorLocationInput): Promise<VendorLocation> {
    // `async` (not a bare synchronous throw) so a bad timezone rejects the
    // returned promise like every other validation failure in this class,
    // instead of throwing synchronously out of `create()` itself.
    assertValidTimezone(body.timezone);
    const location = this.locationRepo.create({
      ...body,
      vendor_id: vendorId,
    } as Partial<VendorLocation>);
    const saved = await this.locationRepo.save(location);
    await this.onAreasChanged(vendorId);
    return saved;
  }

  async update(
    vendorId: string,
    id: string,
    body: UpdateVendorLocationInput,
  ): Promise<VendorLocation> {
    // Only validate when the caller actually sent a timezone patch —
    // `body.timezone === undefined` means "leave it unchanged", not "clear it"
    // (UpdateVendorLocationBody is a Type.Partial, so timezone is never null).
    if (body.timezone !== undefined) assertValidTimezone(body.timezone);
    const location = await this.locationRepo.findOne({ where: { id, vendor_id: vendorId } });
    if (!location) throw new NotFoundError("Location not found");
    Object.assign(location, body);
    const saved = await this.locationRepo.save(location);
    await this.onAreasChanged(vendorId);
    return saved;
  }

  list(vendorId: string): Promise<VendorLocation[]> {
    return this.locationRepo.find({
      where: { vendor_id: vendorId },
      order: { created_at: "DESC" },
    });
  }

  async get(vendorId: string, id: string): Promise<VendorLocation> {
    const location = await this.locationRepo.findOne({ where: { id, vendor_id: vendorId } });
    if (!location) throw new NotFoundError("Location not found");
    return location;
  }

  // Public storefront read — active branches only.
  listActiveForVendor(vendorId: string): Promise<VendorLocation[]> {
    return this.locationRepo.find({
      where: { vendor_id: vendorId, is_active: true },
      order: { created_at: "DESC" },
    });
  }

  async addServiceArea(vendorId: string, body: CreateServiceAreaInput): Promise<ServiceArea> {
    const area = this.serviceAreaRepo.create({
      vendor_id: vendorId,
      area_id: body.area_id,
      travel_buffer_minutes: body.travel_buffer_minutes ?? 0,
    } as Partial<ServiceArea>);
    try {
      const saved = await this.serviceAreaRepo.save(area);
      await this.onAreasChanged(vendorId);
      return saved;
    } catch (err) {
      // (vendor_id, area_id) partial-unique index (WHERE deleted_at IS NULL)
      // — translate to a clean 409 instead of falling through to a generic
      // 500 (fix-cycle-1 finding M-1).
      if (isUniqueViolation(err)) {
        throw new ConflictError("This area is already covered by a service area");
      }
      throw err;
    }
  }

  listServiceAreas(vendorId: string): Promise<ServiceArea[]> {
    return this.serviceAreaRepo.find({ where: { vendor_id: vendorId } });
  }

  async removeServiceArea(vendorId: string, id: string): Promise<void> {
    const area = await this.serviceAreaRepo.findOne({ where: { id, vendor_id: vendorId } });
    if (!area) throw new NotFoundError("Service area not found");
    await this.serviceAreaRepo.softRemove(area);
    await this.onAreasChanged(vendorId);
  }
}
