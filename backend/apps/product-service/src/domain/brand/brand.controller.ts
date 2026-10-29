import type { BrandStatus } from "@materialhub/database";
import type { BrandService } from "./brand.service.ts";

export class BrandController {
  constructor(private readonly brandService: BrandService) {}

  async create(data: any) {
    return this.brandService.create(data);
  }
  async update(id: string, data: any) {
    return this.brandService.update(id, data);
  }
  async remove(id: string) {
    return this.brandService.remove(id);
  }
  async listForAdmin(page?: number, limit?: number, search?: string) {
    return this.brandService.listForAdmin(page, limit, search);
  }
  async recomputeProductCounts() {
    return this.brandService.recomputeProductCounts();
  }
  async listPublic(opts: { q?: string; ids?: string[]; limit?: number } = {}) {
    return this.brandService.listPublic(opts);
  }
  async getPublicBySlug(slug: string) {
    return this.brandService.getPublicBySlug(slug);
  }

  // ─── Vendor submission & moderation ──────────────────────────────────────
  async submitForVendor(
    vendorId: string,
    data: { name: string; logo_url?: string; description?: string; website_url?: string },
  ) {
    return this.brandService.submitForVendor(vendorId, data);
  }
  async listForVendor(vendorId: string, opts: { q?: string; limit?: number } = {}) {
    return this.brandService.listForVendor(vendorId, opts);
  }
  async listSubmissions(opts: { status?: BrandStatus; page?: number; limit?: number } = {}) {
    return this.brandService.listSubmissions(opts);
  }
  async approveSubmission(id: string, reviewerUserId: string) {
    return this.brandService.approveSubmission(id, reviewerUserId);
  }
  async rejectSubmission(id: string, reviewerUserId: string, reason: string) {
    return this.brandService.rejectSubmission(id, reviewerUserId, reason);
  }
}
