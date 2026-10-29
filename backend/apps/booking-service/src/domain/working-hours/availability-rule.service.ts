import type {
  ServiceOffering,
  StaffMember,
  StaffTimeOff,
  StaffWorkingHours,
} from "@materialhub/database";
import { BadRequestError, NotFoundError } from "@materialhub/plugins";
import type { Repository } from "typeorm";
import type { AvailabilityCache } from "../availability/availability-cache.ts";
import { timeOfDayMinutes } from "../availability/interval-math.ts";

// Forward horizon invalidated on a recurring working-hours change. A recurring
// rule has no bounded day set, so the horizon must cover the furthest day a
// customer can actually be shown — the vendor's largest max_advance_days, which
// has no CHECK constraint and routinely exceeds the old fixed 120. Floor keeps
// small vendors cheap; ceiling bounds the DEL (and stays under
// interval-math's MAX_DAYS_IN_RANGE).
const MIN_HORIZON_DAYS = 120;
const MAX_HORIZON_DAYS = 730;

export interface WorkingHoursInput {
  location_id?: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  effective_from?: string | null;
  effective_to?: string | null;
}

export interface TimeOffInput {
  starts_at: string;
  ends_at: string;
  reason?: string | null;
}

export class AvailabilityRuleService {
  constructor(
    private readonly workingHoursRepo: Repository<StaffWorkingHours>,
    private readonly timeOffRepo: Repository<StaffTimeOff>,
    private readonly staffRepo: Repository<StaffMember>,
    private readonly cache?: AvailabilityCache,
    // Optional: used only to size the invalidation horizon to the vendor's real
    // max_advance_days. Without it the horizon falls back to MIN_HORIZON_DAYS.
    private readonly offeringRepo?: Repository<ServiceOffering>,
  ) {}

  private async assertOwnStaff(vendorId: string, staffId: string): Promise<void> {
    const staff = await this.staffRepo.findOne({ where: { id: staffId, vendor_id: vendorId } });
    if (!staff) throw new NotFoundError("Staff member not found");
  }

  async addWorkingHours(
    vendorId: string,
    staffId: string,
    body: WorkingHoursInput,
  ): Promise<StaffWorkingHours> {
    await this.assertOwnStaff(vendorId, staffId);
    if (body.day_of_week < 0 || body.day_of_week > 6) {
      throw new BadRequestError("day_of_week must be 0..6");
    }
    // Compare numerically, not lexicographically: "9:00" > "10:00" as strings,
    // so unpadded but perfectly valid input used to 400.
    const start = timeOfDayMinutes(body.start_time);
    const end = timeOfDayMinutes(body.end_time);
    if (Number.isNaN(start) || Number.isNaN(end)) {
      throw new BadRequestError("start_time and end_time must be HH:MM");
    }
    if (start >= end) {
      throw new BadRequestError("start_time must be before end_time");
    }
    const rule = this.workingHoursRepo.create({
      staff_member_id: staffId,
      location_id: body.location_id ?? null,
      day_of_week: body.day_of_week,
      start_time: body.start_time,
      end_time: body.end_time,
      effective_from: body.effective_from ?? null,
      effective_to: body.effective_to ?? null,
    } as Partial<StaffWorkingHours>);
    const saved = await this.workingHoursRepo.save(rule);
    await this.invalidateHorizon(vendorId, staffId);
    return saved;
  }

  async listWorkingHours(vendorId: string, staffId: string): Promise<StaffWorkingHours[]> {
    await this.assertOwnStaff(vendorId, staffId);
    return this.workingHoursRepo.find({
      where: { staff_member_id: staffId },
      order: { day_of_week: "ASC", start_time: "ASC" },
    });
  }

  async removeWorkingHours(vendorId: string, staffId: string, id: string): Promise<void> {
    await this.assertOwnStaff(vendorId, staffId);
    const rule = await this.workingHoursRepo.findOne({ where: { id, staff_member_id: staffId } });
    if (!rule) throw new NotFoundError("Working-hours rule not found");
    await this.workingHoursRepo.softRemove(rule);
    await this.invalidateHorizon(vendorId, staffId);
  }

  async addTimeOff(vendorId: string, staffId: string, body: TimeOffInput): Promise<StaffTimeOff> {
    await this.assertOwnStaff(vendorId, staffId);
    if (new Date(body.starts_at) >= new Date(body.ends_at)) {
      throw new BadRequestError("starts_at must be before ends_at");
    }
    const off = this.timeOffRepo.create({
      staff_member_id: staffId,
      starts_at: new Date(body.starts_at),
      ends_at: new Date(body.ends_at),
      reason: body.reason ?? null,
    } as Partial<StaffTimeOff>);
    const saved = await this.timeOffRepo.save(off);
    await this.cache?.invalidateRange(staffId, new Date(body.starts_at), new Date(body.ends_at));
    return saved;
  }

  async listTimeOff(vendorId: string, staffId: string): Promise<StaffTimeOff[]> {
    await this.assertOwnStaff(vendorId, staffId);
    return this.timeOffRepo.find({
      where: { staff_member_id: staffId },
      order: { starts_at: "ASC" },
    });
  }

  async removeTimeOff(vendorId: string, staffId: string, id: string): Promise<void> {
    await this.assertOwnStaff(vendorId, staffId);
    const off = await this.timeOffRepo.findOne({ where: { id, staff_member_id: staffId } });
    if (!off) throw new NotFoundError("Time-off not found");
    await this.timeOffRepo.softRemove(off);
    await this.cache?.invalidateRange(staffId, new Date(off.starts_at), new Date(off.ends_at));
  }

  private async invalidateHorizon(vendorId: string, staffId: string): Promise<void> {
    if (!this.cache) return;
    await this.cache.invalidateHorizon(staffId, new Date(), await this.horizonDays(vendorId));
  }

  // Largest max_advance_days across the vendor's offerings, clamped to
  // [MIN_HORIZON_DAYS, MAX_HORIZON_DAYS].
  private async horizonDays(vendorId: string): Promise<number> {
    if (!this.offeringRepo) return MIN_HORIZON_DAYS;
    const row = await this.offeringRepo
      .createQueryBuilder("o")
      .select("MAX(o.max_advance_days)", "max")
      .where("o.vendor_id = :vendorId", { vendorId })
      .andWhere("o.deleted_at IS NULL")
      .getRawOne<{ max: string | number | null }>();
    const max = Number(row?.max ?? 0);
    if (!Number.isFinite(max)) return MIN_HORIZON_DAYS;
    return Math.min(MAX_HORIZON_DAYS, Math.max(MIN_HORIZON_DAYS, Math.ceil(max)));
  }
}
