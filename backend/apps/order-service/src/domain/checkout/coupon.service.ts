import type {
  Coupon,
  CouponUsage,
  Order,
  ProductCollectionMember,
  User,
} from "@materialhub/database";
import { BadRequestError } from "@materialhub/plugins";
// coupon.service.ts
import type { Repository } from "typeorm";

export interface CouponCartLine {
  product_id: string;
  vendor_id: string;
  quantity: number;
  line_total: number;
}

export interface CouponResult {
  couponId: string;
  code: string;
  type: string;
  discount: number;
  /** Vendor the coupon is scoped to (vendor coupons); null = platform-wide. */
  vendorId: string | null;
}

export interface DiscoveredCoupon {
  code: string;
  name: string;
  type: string;
  discount: number;
  minimum_order_amount: number | null;
  expires_at: Date | null;
}

function formatAed(fils: number): string {
  return `AED ${(fils / 100).toFixed(2)}`;
}

/** Map cart items to the line shape CouponService validates against. */
export function toCouponLines(items: any[]): CouponCartLine[] {
  return items.map((it: any) => ({
    product_id: it.product_id,
    vendor_id: it.vendor_id,
    quantity: it.quantity,
    line_total: it.line_total ?? it.unit_price * it.quantity,
  }));
}

export class CouponService {
  constructor(
    private couponRepo: Repository<Coupon>,
    private usageRepo: Repository<CouponUsage>,
    private orderRepo: Repository<Order>,
    private userRepo?: Repository<User>,
    private memberRepo?: Repository<ProductCollectionMember>,
  ) {}

  async validate(code: string, userId: string, lines: CouponCartLine[]): Promise<CouponResult> {
    if (lines.length === 0) throw new BadRequestError("Cart is empty");
    const orderSubtotal = lines.reduce((s, l) => s + l.line_total, 0);

    const coupon = await this.couponRepo.findOne({
      where: { code: code.trim().toUpperCase(), is_active: true },
      relations: [
        "couponProducts",
        "couponCategories",
        "couponVendors",
        "couponExcludedProducts",
        "couponUserRestrictions",
      ],
    });
    if (!coupon) throw new BadRequestError("Coupon not found");

    // Expiry check
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      throw new BadRequestError("Coupon has expired");
    }
    if (coupon.starts_at && new Date(coupon.starts_at) > new Date()) {
      throw new BadRequestError("Coupon is not yet active");
    }

    // Global usage limit; a single-use code is spent after its first redemption
    if (coupon.usage_limit != null && coupon.usage_count >= coupon.usage_limit) {
      throw new BadRequestError("Coupon usage limit reached");
    }
    if (coupon.is_single_use && coupon.usage_count >= 1) {
      throw new BadRequestError("Coupon usage limit reached");
    }

    // Per-user limit
    if (coupon.usage_limit_per_user != null) {
      const userUsageCount = await this.usageRepo.count({
        where: { coupon_id: coupon.id, user_id: userId },
      });
      if (userUsageCount >= coupon.usage_limit_per_user) {
        throw new BadRequestError("You have already used this coupon");
      }
    }

    // Minimum order amount (stored in fils — surface it as AED)
    if (coupon.minimum_order_amount != null && orderSubtotal < coupon.minimum_order_amount) {
      throw new BadRequestError(
        `Order must be at least ${formatAed(coupon.minimum_order_amount)} to use this coupon (minimum not met)`,
      );
    }

    // First order only
    if (coupon.first_order_only) {
      const orderCount = await this.orderRepo.count({ where: { user_id: userId } });
      if (orderCount > 0) {
        throw new BadRequestError("This coupon is valid for first order only");
      }
    }

    // New users only: user must have been created within the last 30 days
    if (coupon.new_users_only && this.userRepo) {
      const user = await this.userRepo.findOne({ where: { id: userId } });
      if (user) {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        if (new Date(user.created_at) < thirtyDaysAgo) {
          throw new BadRequestError("This coupon is for new users only");
        }
      }
    }

    // User restrictions: coupon is limited to specific users
    if (coupon.couponUserRestrictions && coupon.couponUserRestrictions.length > 0) {
      const allowedUserIds = new Set(coupon.couponUserRestrictions.map((r) => r.user_id));
      if (!allowedUserIds.has(userId)) {
        throw new BadRequestError("Coupon not available for your account");
      }
    }

    // ── Applicability: narrow cart lines down to the ones this coupon covers.
    // The discount is computed over the qualifying lines only, never the whole
    // cart — a vendor's 20% must not discount other vendors' items.
    let qualifying = lines;

    // Vendor coupons only ever cover that vendor's items
    if (coupon.vendor_id) {
      qualifying = qualifying.filter((l) => l.vendor_id === coupon.vendor_id);
    }

    const excludedProductIds = new Set(
      (coupon.couponExcludedProducts ?? []).map((ep) => ep.product_id),
    );
    if (excludedProductIds.size > 0) {
      qualifying = qualifying.filter((l) => !excludedProductIds.has(l.product_id));
    }

    if (coupon.applicable_to === "specific_products") {
      // An empty product list on a vendor coupon means "all my products" —
      // the vendor_id filter above already narrowed to them.
      if (coupon.couponProducts && coupon.couponProducts.length > 0) {
        const allowedProductIds = new Set(coupon.couponProducts.map((cp) => cp.product_id));
        qualifying = qualifying.filter((l) => allowedProductIds.has(l.product_id));
      }
    }

    if (coupon.applicable_to === "specific_collection") {
      if (!coupon.collection_id || !this.memberRepo) {
        throw new BadRequestError("Coupon is misconfigured");
      }
      const members = await this.memberRepo.find({
        where: { collection_id: coupon.collection_id },
        select: ["product_id"],
      });
      const memberIds = new Set(members.map((m) => m.product_id));
      qualifying = qualifying.filter((l) => memberIds.has(l.product_id));
    }

    if (coupon.applicable_to === "specific_vendors") {
      if (coupon.couponVendors && coupon.couponVendors.length > 0) {
        const allowedVendorIds = new Set(coupon.couponVendors.map((cv) => cv.vendor_id));
        qualifying = qualifying.filter((l) => allowedVendorIds.has(l.vendor_id));
      }
    }

    if (qualifying.length === 0) {
      throw new BadRequestError("Coupon does not apply to items in your cart");
    }

    // Minimum quantity check — units of qualifying items, not cart lines
    const qualifyingQty = qualifying.reduce((s, l) => s + l.quantity, 0);
    if (coupon.minimum_quantity != null && qualifyingQty < coupon.minimum_quantity) {
      throw new BadRequestError(
        `Coupon requires a minimum of ${coupon.minimum_quantity} item(s) in cart`,
      );
    }

    // Calculate discount over the qualifying subtotal only
    const qualifyingSubtotal = qualifying.reduce((s, l) => s + l.line_total, 0);
    let discount: number;
    if (coupon.type === "buy_x_get_y") {
      const unitPrices = qualifying.flatMap((l) => {
        const unit = l.quantity > 0 ? Math.round(l.line_total / l.quantity) : 0;
        return Array.from({ length: l.quantity }, () => unit);
      });
      discount = this.calculateBxgyDiscount(coupon, unitPrices);
    } else {
      discount = this.calculateDiscount(coupon, qualifyingSubtotal);
    }

    return {
      couponId: coupon.id,
      code: coupon.code,
      type: coupon.type,
      discount,
      vendorId: coupon.vendor_id ?? null,
    };
  }

  calculateBxgyDiscount(coupon: Coupon, itemPrices: number[]): number {
    const buyQty = coupon.buy_quantity ?? 1;
    const getQty = coupon.get_quantity ?? 1;
    const discountPct =
      coupon.get_discount_percentage != null ? Number(coupon.get_discount_percentage) : 100;

    if (itemPrices.length === 0) return 0;

    // Sort ascending so cheapest items get the discount
    const sorted = [...itemPrices].sort((a, b) => a - b);

    const sets = Math.floor(sorted.length / buyQty);
    if (sets === 0) return 0;

    const getCount = Math.min(sets * getQty, sorted.length - sets * buyQty);

    // Discount the cheapest `getCount` items
    let totalDiscount = 0;
    for (let i = 0; i < getCount && i < sorted.length; i++) {
      totalDiscount += Math.round(sorted[i]! * (discountPct / 100));
    }

    return totalDiscount;
  }

  private calculateDiscount(coupon: Coupon, subtotal: number): number {
    switch (coupon.type) {
      case "percentage": {
        let disc = Math.round(subtotal * (coupon.discount_value / 100));
        if (coupon.max_discount_amount != null) {
          disc = Math.min(disc, coupon.max_discount_amount);
        }
        return disc;
      }
      case "fixed_amount":
        return Math.min(coupon.discount_value, subtotal);
      case "free_shipping":
        return 0; // Waived at the shipping level by quote/checkout
      case "buy_x_get_y":
        return 0; // Requires item-level logic; use calculateBxgyDiscount with item prices
      default:
        return 0;
    }
  }

  /**
   * Public coupons that would actually apply to this cart, with their live
   * discount preview — powers the storefront "available coupons" list.
   * Runs the full validate() per candidate so every rule (limits, per-user,
   * first-order, product/vendor scope) is honored; non-applicable candidates
   * are simply skipped.
   */
  async discoverApplicable(
    userId: string,
    lines: CouponCartLine[],
    limit = 8,
  ): Promise<DiscoveredCoupon[]> {
    if (lines.length === 0) return [];
    const now = new Date();
    const candidates = await this.couponRepo.find({
      where: { is_active: true, is_public: true } as any,
      order: { created_at: "DESC" } as any,
      take: 30,
    });

    const applicable: DiscoveredCoupon[] = [];
    for (const c of candidates) {
      if (c.starts_at && new Date(c.starts_at) > now) continue;
      if (c.expires_at && new Date(c.expires_at) < now) continue;
      try {
        const r = await this.validate(c.code, userId, lines);
        applicable.push({
          code: r.code,
          name: c.name,
          type: r.type,
          discount: r.discount,
          minimum_order_amount: c.minimum_order_amount ?? null,
          expires_at: c.expires_at ?? null,
        });
      } catch {
        // Not applicable to this cart/user — skip silently.
      }
      if (applicable.length >= limit) break;
    }
    return applicable;
  }

  async recordUsage(
    couponId: string,
    userId: string,
    orderId: string,
    discountApplied: number,
  ): Promise<void> {
    // Idempotent per order — a replayed payment webhook or a COD retry must
    // not double-count the redemption.
    const existing = await this.usageRepo.findOne({
      where: { coupon_id: couponId, order_id: orderId } as any,
    });
    if (existing) return;
    await this.usageRepo.save({
      coupon_id: couponId,
      user_id: userId,
      order_id: orderId,
      discount_applied: discountApplied,
    } as any);
    // Atomic increment
    await this.couponRepo.increment({ id: couponId }, "usage_count", 1);
  }
}
