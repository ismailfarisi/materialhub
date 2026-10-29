import { NotFoundError } from "@materialhub/plugins";
// coupon.controller.ts
import type { CouponAdminService } from "./coupon-admin.service.ts";

export class CouponController {
  constructor(private couponAdminService: CouponAdminService) {}

  // ── Admin methods ─────────────────────────────────────────────────────────

  listCoupons(query: any) {
    return this.couponAdminService.list(query);
  }

  getCoupon(id: string) {
    return this.couponAdminService.findById(id);
  }

  createCoupon(body: any, actorId?: string) {
    return this.couponAdminService.create({ ...body, created_by: actorId ?? null });
  }

  updateCoupon(id: string, body: any) {
    return this.couponAdminService.update(id, body);
  }

  deleteCoupon(id: string) {
    return this.couponAdminService.delete(id);
  }

  // ── Vendor methods ────────────────────────────────────────────────────────

  listVendorCoupons(vendorId: string, query: any) {
    return this.couponAdminService.list({ ...query, vendor_id: vendorId });
  }

  async getVendorCoupon(vendorId: string, id: string) {
    const coupon = await this.couponAdminService.findById(id);
    if (coupon.vendor_id !== vendorId) {
      throw new NotFoundError("Coupon not found or does not belong to this vendor");
    }
    return coupon;
  }

  createVendorCoupon(vendorId: string, body: any, actorId?: string) {
    // Vendors are scoped: force vendor_id, applicable_to=specific_products
    // Strip admin-only fields that vendors cannot set
    const {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      vendor_id: _v,
      applicable_to: _a,
      is_public: _ip,
      created_by: _cb,
      vendor_ids: _vi,
      ...rest
    } = body;

    return this.couponAdminService.create({
      ...rest,
      vendor_id: vendorId,
      applicable_to: "specific_products",
      // created_by FKs to users(id) — must be the acting user, never the
      // vendor id (which made every vendor create fail the FK).
      created_by: actorId ?? null,
    });
  }

  async updateVendorCoupon(vendorId: string, id: string, body: any) {
    // Verify ownership first
    const coupon = await this.couponAdminService.findById(id);
    if (coupon.vendor_id !== vendorId) {
      throw new NotFoundError("Coupon not found or does not belong to this vendor");
    }

    // Strip admin-only fields
    const {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      vendor_id: _v,
      applicable_to: _a,
      is_public: _ip,
      vendor_ids: _vi,
      ...rest
    } = body;

    return this.couponAdminService.update(id, {
      ...rest,
      vendor_id: vendorId,
      applicable_to: "specific_products",
    });
  }

  async deleteVendorCoupon(vendorId: string, id: string) {
    const coupon = await this.couponAdminService.findById(id);
    if (coupon.vendor_id !== vendorId) {
      throw new NotFoundError("Coupon not found or does not belong to this vendor");
    }
    return this.couponAdminService.delete(id);
  }
}
