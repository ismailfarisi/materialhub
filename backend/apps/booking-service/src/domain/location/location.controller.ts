import type {
  CreateServiceAreaInput,
  CreateVendorLocationInput,
  LocationService,
  UpdateVendorLocationInput,
} from "./location.service.ts";

// Thin controller — vendor scoping (member.vid) resolved by the route guard.
export class LocationController {
  constructor(private readonly svc: LocationService) {}

  create(vendorId: string, body: CreateVendorLocationInput) {
    return this.svc.create(vendorId, body);
  }
  update(vendorId: string, id: string, body: UpdateVendorLocationInput) {
    return this.svc.update(vendorId, id, body);
  }
  list(vendorId: string) {
    return this.svc.list(vendorId);
  }
  get(vendorId: string, id: string) {
    return this.svc.get(vendorId, id);
  }
  listPublic(vendorId: string) {
    return this.svc.listActiveForVendor(vendorId);
  }
  addServiceArea(vendorId: string, body: CreateServiceAreaInput) {
    return this.svc.addServiceArea(vendorId, body);
  }
  listServiceAreas(vendorId: string) {
    return this.svc.listServiceAreas(vendorId);
  }
  removeServiceArea(vendorId: string, id: string) {
    return this.svc.removeServiceArea(vendorId, id);
  }
}
