import { type LocationScopeRepos, assertLocationManager } from "../../guards/location-scope.ts";
import type {
  CreateStaffMemberInput,
  StaffService,
  UpdateStaffMemberInput,
} from "./staff.service.ts";

export interface StaffActor {
  userId: string;
  vendorId: string;
  role: string;
}

// Staff CRUD is vendor-level (products.write gate). Linking a staff member to a
// LOCATION is location-scoped, so it goes through assertLocationManager first —
// a location admin can staff their own branch without being a vendor manager.
export class StaffController {
  constructor(
    private readonly svc: StaffService,
    private readonly locationScope: LocationScopeRepos,
  ) {}

  create(vendorId: string, body: CreateStaffMemberInput) {
    return this.svc.create(vendorId, body);
  }
  update(vendorId: string, id: string, body: UpdateStaffMemberInput) {
    return this.svc.update(vendorId, id, body);
  }
  list(vendorId: string) {
    return this.svc.list(vendorId);
  }
  get(vendorId: string, id: string) {
    return this.svc.get(vendorId, id);
  }

  async linkLocation(actor: StaffActor, staffId: string, vendorLocationId: string) {
    await assertLocationManager(actor, vendorLocationId, this.locationScope);
    return this.svc.linkLocation(actor.vendorId, staffId, vendorLocationId);
  }
  async unlinkLocation(actor: StaffActor, staffId: string, vendorLocationId: string) {
    await assertLocationManager(actor, vendorLocationId, this.locationScope);
    await this.svc.unlinkLocation(actor.vendorId, staffId, vendorLocationId);
    return { staffId, vendorLocationId, unlinked: true };
  }

  linkService(vendorId: string, staffId: string, serviceOfferingId: string) {
    return this.svc.linkService(vendorId, staffId, serviceOfferingId);
  }
  async unlinkService(vendorId: string, staffId: string, serviceOfferingId: string) {
    await this.svc.unlinkService(vendorId, staffId, serviceOfferingId);
    return { staffId, serviceOfferingId, unlinked: true };
  }

  // Fix-cycle-1 finding I-3 — vendor-scoped reads, no location-manager check
  // (read-only, unlike the link/unlink mutations above).
  getLinkedLocations(vendorId: string, staffId: string) {
    return this.svc.getLinkedLocations(vendorId, staffId);
  }
  getLinkedServices(vendorId: string, staffId: string) {
    return this.svc.getLinkedServices(vendorId, staffId);
  }

  listEligible(serviceOfferingId: string, vendorLocationId?: string) {
    return this.svc.listEligible(serviceOfferingId, vendorLocationId);
  }
}
