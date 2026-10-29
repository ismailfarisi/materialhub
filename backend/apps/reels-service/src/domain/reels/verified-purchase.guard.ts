import { config } from "@materialhub/config";
import { ReelTaggingScope } from "@materialhub/database";
import type { UserTaggingPermission } from "@materialhub/database";

export interface CanTagInput {
  userId: string;
  productId: string;
  canTagUnowned: boolean;
  ownsVendorOfProduct: boolean;
  taggingPermissions: UserTaggingPermission[];
  productBrandId: string | null;
  productVendorId: string | null;
}

export interface CanTagResult {
  allowed: boolean;
  reason: string;
}

interface VerifiedPurchaseGuardOptions {
  fetcher?: typeof fetch;
}

export class VerifiedPurchaseGuard {
  private readonly fetcher: typeof fetch;
  private readonly orderServiceUrl: string;
  private readonly internalSecret: string;

  constructor(opts: VerifiedPurchaseGuardOptions = {}) {
    this.fetcher = opts.fetcher ?? fetch;
    this.orderServiceUrl =
      process.env.ORDER_SERVICE_URL ?? `http://${config.serviceHost.order}:${config.port.order}`;
    this.internalSecret = config.internal.serviceSecret;
  }

  async canTag(input: CanTagInput): Promise<CanTagResult> {
    if (input.canTagUnowned) {
      return { allowed: true, reason: "can_tag_unowned" };
    }
    if (input.ownsVendorOfProduct) {
      return { allowed: true, reason: "vendor_owns_product" };
    }

    const now = new Date();
    for (const perm of input.taggingPermissions) {
      if (perm.expires_at && new Date(perm.expires_at) <= now) continue;
      switch (perm.scope) {
        case ReelTaggingScope.any_product:
          return { allowed: true, reason: "permission_any_product" };
        case ReelTaggingScope.specific_brand:
          if (perm.brand_id && perm.brand_id === input.productBrandId) {
            return { allowed: true, reason: "permission_specific_brand" };
          }
          break;
        case ReelTaggingScope.specific_vendor:
          if (perm.vendor_id && perm.vendor_id === input.productVendorId) {
            return { allowed: true, reason: "permission_specific_vendor" };
          }
          break;
        case ReelTaggingScope.specific_products:
          if (perm.product_ids?.includes(input.productId)) {
            return { allowed: true, reason: "permission_specific_products" };
          }
          break;
      }
    }

    try {
      const url = `${this.orderServiceUrl}/internal/orders/verified-purchase?userId=${encodeURIComponent(input.userId)}&productId=${encodeURIComponent(input.productId)}`;
      const res = await this.fetcher(url, {
        headers: { "x-internal-secret": this.internalSecret },
      });
      const json = (await res.json()) as { data?: { verified?: boolean } };
      if (json.data?.verified) {
        return { allowed: true, reason: "verified_purchase" };
      }
    } catch (error) {
      console.warn("[VerifiedPurchaseGuard] order-service lookup failed:", error);
    }

    return { allowed: false, reason: "no_qualifying_rule" };
  }
}
