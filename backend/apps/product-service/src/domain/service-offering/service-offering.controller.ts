import type { ServiceSearchAdapter } from "../service-search/service-search.adapter.ts";
import type { ServiceFilters } from "../service-search/service-search.interface.ts";
import type {
  AdminOfferingQuery,
  CreateServiceOfferingInput,
  ServiceOfferingService,
  UpdateServiceOfferingInput,
} from "./service-offering.service.ts";

// Thin controller — delegates to the service. Vendor scoping (member.vid) is
// resolved by the vendorMembership guard in the route module.
export class ServiceOfferingController {
  constructor(
    private readonly svc: ServiceOfferingService,
    private readonly searchAdapter: ServiceSearchAdapter,
  ) {}

  create(vendorId: string, body: CreateServiceOfferingInput) {
    return this.svc.create(vendorId, body);
  }

  update(vendorId: string, id: string, body: UpdateServiceOfferingInput) {
    return this.svc.update(vendorId, id, body);
  }

  listForVendor(vendorId: string) {
    return this.svc.listForVendor(vendorId);
  }

  getPublicBySlug(slug: string) {
    return this.svc.getPublishedBySlug(slug);
  }

  getPublicById(id: string) {
    return this.svc.getPublishedById(id);
  }

  searchPublic(filters: ServiceFilters) {
    return this.searchAdapter.searchServices(filters);
  }

  adminList(query: AdminOfferingQuery) {
    return this.svc.adminList(query);
  }

  adminGetById(id: string) {
    return this.svc.adminGetById(id);
  }

  approve(id: string, adminUserId: string) {
    return this.svc.approve(id, adminUserId);
  }

  reject(id: string, adminUserId: string, reason: string) {
    return this.svc.reject(id, adminUserId, reason);
  }
}
