import type { BidService } from "./bid.service.ts";

export class BidController {
  constructor(private readonly service: BidService) {}

  // Admin
  async listAll(query: Parameters<BidService["listAll"]>[0]) {
    return this.service.listAll(query);
  }
  async approve(bidId: string) {
    return this.service.approve(bidId);
  }
  async reject(bidId: string) {
    return this.service.reject(bidId);
  }

  // Vendor
  async listByVendor(vendorId: string) {
    return this.service.listByVendor(vendorId);
  }
  async availableSections() {
    return this.service.availableSections();
  }
  async placeBid(vendorId: string, data: Parameters<BidService["placeBid"]>[1]) {
    return this.service.placeBid(vendorId, data);
  }
  async updateBid(bidId: string, vendorId: string, data: Parameters<BidService["updateBid"]>[2]) {
    return this.service.updateBid(bidId, vendorId, data);
  }
  async cancelBid(bidId: string, vendorId: string) {
    return this.service.cancelBid(bidId, vendorId);
  }

  async issuePreviewToken(
    bidId: string,
    opts: { requestor: "admin" | "vendor"; vendor_id?: string },
  ) {
    return this.service.issuePreviewToken(bidId, opts);
  }
}
