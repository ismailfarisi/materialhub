import { ForbiddenError } from "@materialhub/plugins";
import type { FlashDealService } from "./flash-deal.service.ts";

export class FlashDealController {
  constructor(private readonly flashDealService: FlashDealService) {}

  // ─── Admin Methods ────────────────────────────────────────────────────────

  async list(filters: {
    status?: string;
    vendor_id?: string;
    product_id?: string;
    page?: number;
    limit?: number;
  }) {
    return this.flashDealService.list(filters);
  }

  async listPublic(filters: { vendor_id?: string; category?: string; limit?: number }) {
    return this.flashDealService.listActivePublic(filters);
  }

  async get(id: string) {
    return this.flashDealService.findById(id);
  }

  async create(payload: any) {
    return this.flashDealService.create(payload);
  }

  async update(id: string, payload: any) {
    return this.flashDealService.update(id, payload);
  }

  async delete(id: string) {
    return this.flashDealService.delete(id);
  }

  // ─── Vendor Methods ───────────────────────────────────────────────────────

  async listVendor(
    vendorId: string,
    filters: {
      status?: string;
      product_id?: string;
      page?: number;
      limit?: number;
    },
  ) {
    return this.flashDealService.list({ ...filters, vendor_id: vendorId });
  }

  async getVendor(id: string, vendorId: string) {
    const deal = await this.flashDealService.findById(id);
    if (deal.vendor_id !== vendorId) {
      throw new ForbiddenError("Access denied to this flash deal");
    }
    return deal;
  }

  async createVendor(vendorId: string, payload: any) {
    return this.flashDealService.create({ ...payload, vendor_id: vendorId });
  }

  async updateVendor(id: string, vendorId: string, payload: any) {
    const deal = await this.flashDealService.findById(id);
    if (deal.vendor_id !== vendorId) {
      throw new ForbiddenError("Access denied to this flash deal");
    }
    return this.flashDealService.update(id, payload);
  }

  async deleteVendor(id: string, vendorId: string) {
    const deal = await this.flashDealService.findById(id);
    if (deal.vendor_id !== vendorId) {
      throw new ForbiddenError("Access denied to this flash deal");
    }
    return this.flashDealService.delete(id);
  }
}
