import type { ReturnService } from "./return.service.ts";

export class ReturnController {
  constructor(private returnService: ReturnService) {}

  async create(orderId: string, userId: string, body: any) {
    return this.returnService.createReturn(orderId, userId, body);
  }

  async approve(returnId: string, adminId: string, body: any) {
    return this.returnService.approveReturn(returnId, adminId, body);
  }

  async reject(returnId: string, adminId: string, body: any) {
    return this.returnService.rejectReturn(returnId, adminId, body.rejection_reason);
  }

  async updateShipping(returnId: string, userId: string, body: any) {
    return this.returnService.updateReturnShipping(returnId, userId, body);
  }

  async markReceived(returnId: string, vendorId: string, body: any) {
    return this.returnService.markReceived(returnId, vendorId, body.restock ?? false);
  }

  async listForBuyer(userId: string, query: any) {
    return this.returnService.listForBuyer(userId, query);
  }

  async getForBuyer(returnId: string, userId: string) {
    return this.returnService.getForBuyer(returnId, userId);
  }

  async listForAdmin(query: any) {
    return this.returnService.listForAdmin(query);
  }

  async listForVendor(vendorId: string, query: any) {
    return this.returnService.listForVendor(vendorId, query);
  }
}
