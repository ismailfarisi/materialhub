import type { CouponAdminService } from "../coupon/coupon-admin.service.ts";

interface PromoItem {
  id: string;
  type: "coupon";
  name: string;
  status: "active" | "scheduled" | "expired" | "disabled";
  starts_at: string | null;
  expires_at: string | null;
  discount_display: string;
  usage: string | null;
  vendor_name: string | null;
  created_at: string;
}

function computeStatus(
  isActive: boolean,
  startsAt: Date | string | null,
  expiresAt: Date | string | null,
): PromoItem["status"] {
  if (!isActive) return "disabled";
  const now = new Date();
  if (expiresAt && new Date(expiresAt) <= now) return "expired";
  if (startsAt && new Date(startsAt) > now) return "scheduled";
  return "active";
}

export class PromotionsService {
  constructor(private couponAdminService: CouponAdminService) {}

  async getOverview(filters: { type?: string; status?: string; search?: string }) {
    const items: PromoItem[] = [];
    const warnings: string[] = [];

    // Coupons (local query)
    if (!filters.type || filters.type === "coupon") {
      const coupons = await this.couponAdminService.list({ search: filters.search, limit: 1000 });
      for (const c of coupons.items as any[]) {
        const discountDisplay =
          c.type === "percentage"
            ? `${c.discount_value}% off`
            : c.type === "fixed_amount"
              ? `AED ${(c.discount_value / 100).toFixed(2)} off`
              : c.type === "free_shipping"
                ? "Free shipping"
                : `Buy ${c.buy_quantity} Get ${c.get_quantity}`;

        items.push({
          id: c.id,
          type: "coupon",
          name: `${c.name} (${c.code})`,
          status: computeStatus(c.is_active, c.starts_at, c.expires_at),
          starts_at: c.starts_at ? new Date(c.starts_at).toISOString() : null,
          expires_at: c.expires_at ? new Date(c.expires_at).toISOString() : null,
          discount_display: discountDisplay,
          usage: c.usage_limit ? `${c.usage_count}/${c.usage_limit} used` : `${c.usage_count} used`,
          vendor_name: c.vendor?.name ?? null,
          created_at: new Date(c.created_at).toISOString(),
        });
      }
    }

    // Sort by starts_at desc (newest first), nulls last
    items.sort((a, b) => {
      const aDate = a.starts_at ? new Date(a.starts_at).getTime() : 0;
      const bDate = b.starts_at ? new Date(b.starts_at).getTime() : 0;
      return bDate - aDate;
    });

    // Apply status filter
    let filtered = items;
    if (filters.status) {
      filtered = items.filter((i) => i.status === filters.status);
    }

    return { items: filtered, total: filtered.length, warnings };
  }
}
