// shipping.controller.ts
import type { ShippingService } from "./shipping.service.ts";

export class ShippingController {
  constructor(private shippingService: ShippingService) {}

  lookupZone(lat: number, lng: number) {
    return this.shippingService.lookupZone(lat, lng);
  }
  listZones() {
    return this.shippingService.listZones();
  }
  createZone(data: any) {
    return this.shippingService.createZone(data);
  }
  getRatesForZone(zoneId: string, vendorId?: string) {
    return this.shippingService.getRatesForZone(zoneId, vendorId);
  }
  createRate(data: any) {
    return this.shippingService.createRate(data);
  }
  listWarehouses(vendorId?: string, opts?: { includeInactive?: boolean }) {
    return this.shippingService.listWarehouses(vendorId, opts);
  }
  listVendorWarehouses(vendorId: string) {
    return this.shippingService.listVendorWarehouses(vendorId);
  }
  getWarehouse(id: string) {
    return this.shippingService.getWarehouse(id);
  }
  createWarehouse(data: any) {
    return this.shippingService.createWarehouse(data);
  }
  updateWarehouse(id: string, data: any) {
    return this.shippingService.updateWarehouse(id, data);
  }
  setDefaultWarehouse(id: string) {
    return this.shippingService.setDefaultWarehouse(id);
  }
  deleteWarehouse(id: string) {
    return this.shippingService.deleteWarehouse(id);
  }
}
