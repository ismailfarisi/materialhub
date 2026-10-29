import type {
  ServiceOffering,
  StaffLocation,
  StaffMember,
  StaffService as StaffServiceLink,
  VendorLocation,
} from "@materialhub/database";
import { NotFoundError } from "@materialhub/plugins";
import { In, type Repository } from "typeorm";

export interface CreateStaffMemberInput {
  name: string;
  user_id?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  is_active?: boolean;
}
export type UpdateStaffMemberInput = Partial<CreateStaffMemberInput>;

export class StaffService {
  constructor(
    private readonly staffRepo: Repository<StaffMember>,
    private readonly staffLocationRepo: Repository<StaffLocation>,
    private readonly staffServiceRepo: Repository<StaffServiceLink>,
    // Fix-cycle-1 finding I-3 — added for the two new read endpoints below
    // (getLinkedLocations/getLinkedServices) only; every other method on this
    // class predates and is unaffected by these two repos.
    private readonly vendorLocationRepo: Repository<VendorLocation>,
    private readonly offeringRepo: Repository<ServiceOffering>,
  ) {}

  create(vendorId: string, body: CreateStaffMemberInput): Promise<StaffMember> {
    const staff = this.staffRepo.create({ ...body, vendor_id: vendorId } as Partial<StaffMember>);
    return this.staffRepo.save(staff);
  }

  async update(vendorId: string, id: string, body: UpdateStaffMemberInput): Promise<StaffMember> {
    const staff = await this.staffRepo.findOne({ where: { id, vendor_id: vendorId } });
    if (!staff) throw new NotFoundError("Staff member not found");
    Object.assign(staff, body);
    return this.staffRepo.save(staff);
  }

  list(vendorId: string): Promise<StaffMember[]> {
    return this.staffRepo.find({ where: { vendor_id: vendorId }, order: { created_at: "DESC" } });
  }

  async get(vendorId: string, id: string): Promise<StaffMember> {
    const staff = await this.staffRepo.findOne({ where: { id, vendor_id: vendorId } });
    if (!staff) throw new NotFoundError("Staff member not found");
    return staff;
  }

  // Ownership check so a vendor can only link its own staff.
  private async assertOwnStaff(vendorId: string, staffId: string): Promise<void> {
    const staff = await this.staffRepo.findOne({ where: { id: staffId, vendor_id: vendorId } });
    if (!staff) throw new NotFoundError("Staff member not found");
  }

  async linkLocation(
    vendorId: string,
    staffId: string,
    vendorLocationId: string,
  ): Promise<StaffLocation> {
    await this.assertOwnStaff(vendorId, staffId);
    const existing = await this.staffLocationRepo.findOne({
      where: { staff_member_id: staffId, vendor_location_id: vendorLocationId },
    });
    if (existing) return existing;
    const link = this.staffLocationRepo.create({
      staff_member_id: staffId,
      vendor_location_id: vendorLocationId,
    } as Partial<StaffLocation>);
    return this.staffLocationRepo.save(link);
  }

  async unlinkLocation(vendorId: string, staffId: string, vendorLocationId: string): Promise<void> {
    await this.assertOwnStaff(vendorId, staffId);
    const link = await this.staffLocationRepo.findOne({
      where: { staff_member_id: staffId, vendor_location_id: vendorLocationId },
    });
    if (link) await this.staffLocationRepo.softRemove(link);
  }

  async linkService(
    vendorId: string,
    staffId: string,
    serviceOfferingId: string,
  ): Promise<StaffServiceLink> {
    await this.assertOwnStaff(vendorId, staffId);
    const existing = await this.staffServiceRepo.findOne({
      where: { staff_member_id: staffId, service_offering_id: serviceOfferingId },
    });
    if (existing) return existing;
    const link = this.staffServiceRepo.create({
      staff_member_id: staffId,
      service_offering_id: serviceOfferingId,
    } as Partial<StaffServiceLink>);
    return this.staffServiceRepo.save(link);
  }

  async unlinkService(vendorId: string, staffId: string, serviceOfferingId: string): Promise<void> {
    await this.assertOwnStaff(vendorId, staffId);
    const link = await this.staffServiceRepo.findOne({
      where: { staff_member_id: staffId, service_offering_id: serviceOfferingId },
    });
    if (link) await this.staffServiceRepo.softRemove(link);
  }

  // Fix-cycle-1 finding I-3 — the frontend's StaffLinksPanel previously had no
  // way to read a staff member's PERSISTED links (only POST/DELETE existed),
  // so it tracked "linked" client-side, seeded empty on every load. These two
  // reads close that gap. `assertOwnStaff` gives the same vendor-scoped
  // 404-hide-existence as every other staff.* method — no separate location
  // manager check is needed here (unlike linkLocation/unlinkLocation, which
  // mutate and so go through the controller's assertLocationManager): a read
  // is safe for any vendor-level actor already gated into staffRoutes.

  async getLinkedLocations(vendorId: string, staffId: string): Promise<VendorLocation[]> {
    await this.assertOwnStaff(vendorId, staffId);
    const links = await this.staffLocationRepo.find({ where: { staff_member_id: staffId } });
    if (links.length === 0) return [];
    return this.vendorLocationRepo.find({
      where: { id: In(links.map((l) => l.vendor_location_id)) },
    });
  }

  async getLinkedServices(vendorId: string, staffId: string): Promise<ServiceOffering[]> {
    await this.assertOwnStaff(vendorId, staffId);
    const links = await this.staffServiceRepo.find({ where: { staff_member_id: staffId } });
    if (links.length === 0) return [];
    return this.offeringRepo.find({
      where: { id: In(links.map((l) => l.service_offering_id)), vendor_id: vendorId },
    });
  }

  // Staff eligible to perform an offering (staff_service ∩ optional staff_location),
  // active only. The intersection is the availability engine's staff resolver input.
  //
  // `vendorId` is an OPTIONAL extra scope (Task 0A review finding I-1). A
  // vendor can only link its OWN staff via linkService (assertOwnStaff), but
  // linkService never checks that the target offering belongs to that same
  // vendor — so a cross-vendor staff_services link is possible in the data.
  // The public offering-staff endpoint passes the offering's own vendor_id
  // here to guarantee it can never surface another vendor's staff, mirroring
  // AvailabilityService.resolveEligibleStaff's `s.vendor_id = offering.vendor_id`
  // filter. The vendor-scoped `GET /vendor/booking/staff/eligible` route
  // (staff.controller.ts → staff.routes.ts) does NOT pass vendorId — its call
  // site is unchanged, so that route's existing behavior is untouched.
  listEligible(
    serviceOfferingId: string,
    vendorLocationId?: string,
    vendorId?: string,
  ): Promise<StaffMember[]> {
    const qb = this.staffRepo
      .createQueryBuilder("s")
      .innerJoin(
        "staff_services",
        "ss",
        "ss.staff_member_id = s.id AND ss.service_offering_id = :serviceOfferingId AND ss.deleted_at IS NULL",
        { serviceOfferingId },
      )
      .where("s.deleted_at IS NULL")
      .andWhere("s.is_active = true");
    if (vendorId) {
      qb.andWhere("s.vendor_id = :vendorId", { vendorId });
    }
    if (vendorLocationId) {
      qb.innerJoin(
        "staff_locations",
        "sl",
        "sl.staff_member_id = s.id AND sl.vendor_location_id = :vendorLocationId AND sl.deleted_at IS NULL",
        { vendorLocationId },
      );
    }
    return qb.orderBy("s.name", "ASC").getMany();
  }
}
