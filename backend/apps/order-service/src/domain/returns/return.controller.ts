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
    // The route names the fields carrier / tracking_number / shipping_cost /
    // paid_by; the service stores them as return_shipping_*.
    return this.returnService.updateReturnShipping(returnId, userId, {
      return_shipping_carrier: body.return_shipping_carrier ?? body.carrier,
      return_tracking_number: body.return_tracking_number ?? body.tracking_number,
      return_shipping_cost: body.return_shipping_cost ?? body.shipping_cost ?? null,
      return_shipping_paid_by: body.return_shipping_paid_by ?? body.paid_by ?? null,
    });
  }

  async retryRefund(returnId: string) {
    return this.returnService.retryRefund(returnId);
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
