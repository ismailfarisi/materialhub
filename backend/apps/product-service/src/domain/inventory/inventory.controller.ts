import type { InventoryReservationService } from "./inventory-reservation.service.ts";
import type { InventoryService } from "./inventory.service.ts";

export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly reservationService: InventoryReservationService,
  ) {}

  async restock(vendorId: string, data: any) {
    return this.inventoryService.restock(vendorId, data);
  }
  async adjust(vendorId: string, data: any) {
    return this.inventoryService.adjust(vendorId, data);
  }
  async listForVendor(vendorId: string, productId?: string) {
    return this.inventoryService.listForVendor(vendorId, productId);
  }
  async getMovements(vendorId: string, productId?: string, page?: number, limit?: number) {
    return this.inventoryService.getMovements(vendorId, productId, page, limit);
  }
  async getLowStock(vendorId: string) {
    return this.inventoryService.getLowStock(vendorId);
  }
}
