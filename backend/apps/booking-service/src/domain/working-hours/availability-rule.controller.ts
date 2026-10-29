import type {
  AvailabilityRuleService,
  TimeOffInput,
  WorkingHoursInput,
} from "./availability-rule.service.ts";

// Vendor-level (products.write gate). Staff ownership is enforced inside the
// service (assertOwnStaff), so a vendor can only edit its own staff's rules.
export class AvailabilityRuleController {
  constructor(private readonly svc: AvailabilityRuleService) {}

  addWorkingHours(vendorId: string, staffId: string, body: WorkingHoursInput) {
    return this.svc.addWorkingHours(vendorId, staffId, body);
  }
  listWorkingHours(vendorId: string, staffId: string) {
    return this.svc.listWorkingHours(vendorId, staffId);
  }
  async removeWorkingHours(vendorId: string, staffId: string, id: string) {
    await this.svc.removeWorkingHours(vendorId, staffId, id);
    return { id, removed: true };
  }

  addTimeOff(vendorId: string, staffId: string, body: TimeOffInput) {
    return this.svc.addTimeOff(vendorId, staffId, body);
  }
  listTimeOff(vendorId: string, staffId: string) {
    return this.svc.listTimeOff(vendorId, staffId);
  }
  async removeTimeOff(vendorId: string, staffId: string, id: string) {
    await this.svc.removeTimeOff(vendorId, staffId, id);
    return { id, removed: true };
  }
}
