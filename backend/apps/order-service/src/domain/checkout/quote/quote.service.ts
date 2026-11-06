import type {
  PaymentMethodThreshold,
  ShippingRate,
  SiteSetting,
  UserAddress,
} from "@materialhub/database";
import type { CheckoutQuoteResponse } from "@materialhub/dto";
import type { Repository } from "typeorm";
import type { CartService } from "../../cart/cart.service.ts";
import { type CouponResult, type CouponService, toCouponLines } from "../coupon.service.ts";
import type { TaxService } from "../tax.service.ts";
import { type CartHashItem, computeCartHash } from "./cart-hash.ts";
import {
  API_PAYMENT_METHODS,
  DEFAULT_COMPATIBILITY,
  DEFAULT_VAT_RATE_BPS,
  QUOTE_EXPIRES_SECONDS,
  getFxSnapshot,
} from "./defaults.ts";
import { type DgRate, formDeliveryGroups } from "./delivery-groups.ts";
import { computeEtag, fxEpochFromCapturedAt } from "./etag.ts";
import {
  type QuoteTokenInputs,
  parseIssuedAt,
  signQuoteToken,
  verifyQuoteToken,
} from "./quote-token.ts";
import type { RulesEpochService } from "./rules-epoch.service.ts";
import { selectedShippingFils } from "./shipping-total.ts";

export interface QuoteRequest {
  userId: string | null;
  addressId: string | null;
}

export interface QuoteResult {
  response: CheckoutQuoteResponse;
  etag: string;
  cartHash: string;
  rulesEpoch: number;
}

export interface BusinessQuoteProvider {
  /**
   * Given the buyer, the goods total (subtotal − discount), the grand total and
   * the cart hash, return the net_terms payment method (or null when the buyer
   * has no approved terms) and the business block (or null for retail).
   */
  forQuote(input: {
    userId: string;
    goodsTotalFils: number;
    grandTotalFils: number;
    cartHash: string;
  }): Promise<{
    paymentMethod: CheckoutQuoteResponse["payment_methods"][number] | null;
    business: NonNullable<CheckoutQuoteResponse["business"]> | null;
  }>;
}

export class QuoteService {
  constructor(
    private cartService: CartService,
    private taxService: TaxService,
    public readonly rulesEpochService: RulesEpochService,
    private thresholdRepo: Repository<PaymentMethodThreshold>,
    private shippingRateRepo: Repository<ShippingRate>,
    private userAddressRepo: Repository<UserAddress>,
    private siteSettingRepo: Repository<SiteSetting>,
    private secret: string,
    private couponService?: CouponService,
    // Business accounts (workstream 3): adds the net_terms payment method and
    // the `business` block. Optional so retail-only setups and tests skip it.
    private businessQuote?: BusinessQuoteProvider | null,
  ) {}

  async buildQuote(req: QuoteRequest): Promise<QuoteResult> {
    const { userId, addressId } = req;

    // ── 1. Load cart ──
    const { cart, items } = await this.cartService.getCart(userId, null);
    const allItems = items.flatMap((g: any) => g.items) as any[];

    const cartHash = computeCartHash(
      allItems.map<CartHashItem>((it) => ({
        product_id: it.product_id,
        variant_id: it.variant_id ?? null,
        quantity: it.quantity,
        unit_price: it.unit_price,
      })),
    );

    // ── 2. Resolve zone_id (P1: use user_addresses.area_id) ──
    let zoneId: string | null = null;
    if (addressId && userId) {
      const addr = await this.userAddressRepo.findOne({
        where: { id: addressId, user_id: userId },
      });
      zoneId = addr?.area_id ?? null;
    }

    // ── 3. Load candidate shipping rates (spec §3.4 step 3) ──
    const vendorIds = Array.from(new Set(allItems.map((i) => i.vendor_id as string)));
    const rateRows: ShippingRate[] = vendorIds.length
      ? await this.shippingRateRepo
          .createQueryBuilder("r")
          .where("r.deleted_at IS NULL AND r.is_active = true")
          .andWhere("(r.vendor_id IN (:...vendorIds) OR r.vendor_id IS NULL)", { vendorIds })
          .andWhere(zoneId ? "(r.zone_id = :zoneId OR r.zone_id IS NULL)" : "r.zone_id IS NULL", {
            zoneId,
          })
          .getMany()
      : [];

    // ── 4. Vendor availability ──
    // No vendor-availability exclusions apply; every vendor group is shippable.
    const onHoliday = new Set<string>();

    // ── 5. Subtotal/VAT ──
    // Product prices are VAT-inclusive (UAE 5% standard rate). The cart
    // subtotal IS the gross-incl-VAT amount — extract the embedded VAT for
    // display rather than adding 5% on top. vatFils is informational only;
    // it is NOT added to grandTotal below.
    const subtotalFils = Number((cart as any)?.subtotal ?? 0);
    const taxRate = await this.taxService.getRate();
    const subtotalExVatFils = Math.round(subtotalFils / 1.05);
    const vatFils = subtotalFils - subtotalExVatFils;
    const vatRateBps = Math.round(Number(taxRate) * 100) || DEFAULT_VAT_RATE_BPS;

    // ── 5b. Coupon — re-validate against the live cart rather than trusting
    // the discount snapshot on the cart row (items may have changed since
    // apply). Display-only here: a coupon that no longer validates simply
    // shows no discount; initiateCheckout clears it authoritatively.
    let couponCtx: CouponResult | null = null;
    let discountFils = 0;
    if ((cart as any)?.coupon_code && this.couponService && userId) {
      try {
        couponCtx = await this.couponService.validate(
          (cart as any)?.coupon_code,
          userId,
          toCouponLines(allItems),
        );
        discountFils = couponCtx.discount;
      } catch {
        couponCtx = null;
        discountFils = 0;
      }
    }

    // ── 6. Delivery groups ──
    const dgRates: DgRate[] = rateRows.map((r) => ({
      id: r.id,
      vendor_id: r.vendor_id,
      zone_id: r.zone_id,
      method: r.method,
      base_cost: r.base_cost,
      per_kg_cost: r.per_kg_cost ?? null,
      free_above: r.free_above ?? null,
      estimated_days_min: r.estimated_days_min,
      estimated_days_max: r.estimated_days_max,
    }));
    const groups = addressId
      ? formDeliveryGroups({
          items: allItems.map((it) => ({
            id: it.id,
            vendor_id: it.vendor_id,
            product_id: it.product_id,
            quantity: it.quantity,
            unit_price: it.unit_price,
          })),
          rates: dgRates,
          zoneId,
          vendorHolidays: onHoliday,
          subtotalFils,
        })
      : [];

    // ── 7. Payment methods ──
    const thresholds = await this.thresholdRepo.find({ where: { is_active: true } });
    const tabby = thresholds.find((t) => t.provider === "tabby");
    const tamara = thresholds.find((t) => t.provider === "tamara");
    const cod = thresholds.find((t) => t.provider === "cod");

    const paymentMethods: CheckoutQuoteResponse["payment_methods"] = [];
    paymentMethods.push({
      id: "card",
      available: true,
      surcharge_fils: 0,
      surcharge_type: "fixed",
      reason_key: null,
      reason_params: null,
    });
    // COD: only included if the row exists AND is active (the where clause above
    // already filters is_active). Disabled COD is omitted entirely.
    if (cod) {
      const codAvailable = subtotalFils <= cod.max_amount_fils;
      paymentMethods.push({
        id: "cod",
        available: codAvailable,
        surcharge_fils: cod.surcharge_fils ?? 0,
        surcharge_type: "fixed",
        reason_key: codAvailable ? null : "payment.cod.over_threshold",
        reason_params: codAvailable
          ? null
          : { limit: { value: cod.max_amount_fils, type: "money", currency: "AED" } },
      });
    }
    for (const [id, row] of [
      ["tabby", tabby],
      ["tamara", tamara],
    ] as const) {
      if (!row) continue;
      const inRange = subtotalFils >= row.min_amount_fils && subtotalFils <= row.max_amount_fils;
      // TODO §10 O5: BNPL provider eligibility API call with bucket caching.
      paymentMethods.push({
        id,
        available: inRange,
        surcharge_fils: 0,
        surcharge_type: "fixed",
        min_amount_fils: row.min_amount_fils,
        max_amount_fils: row.max_amount_fils,
        plans: row.plans,
        reason_key: inRange ? null : `payment.${id}.out_of_range`,
        reason_params: inRange
          ? null
          : {
              min: { value: row.min_amount_fils, type: "money", currency: "AED" },
              max: { value: row.max_amount_fils, type: "money", currency: "AED" },
            },
      });
    }

    // ── 8. Shipping cost from shipping_rates (single source of truth) +
    //        default selection. The charged amount is the sum of the cheapest
    //        available method per delivery group.
    const defaultPayment = paymentMethods.find((p) => p.available)?.id ?? "card";
    const shippingByGroup: Record<string, string> = {};
    let shippingFils = 0;
    let blockingError: CheckoutQuoteResponse["blocking_error"] = undefined;

    if (addressId) {
      for (const g of groups) {
        if (g.methods.length === 0) {
          blockingError = {
            code: "shipping_unavailable_for_group",
            severity: "error",
            i18n_key: "checkout.error.shipping_unavailable_for_group",
            params: { group_id: { value: g.group_id, type: "string" } },
            affected_item_ids: g.itemIds,
          };
          continue;
        }
        const cheapest = [...g.methods].sort((a, b) => a.price_fils - b.price_fils)[0];
        if (cheapest) shippingByGroup[g.group_id] = cheapest.id;
      }
      const toShippingItems = (list: any[]) =>
        list.map((it) => ({
          id: it.id,
          vendor_id: it.vendor_id,
          product_id: it.product_id,
          quantity: it.quantity,
          unit_price: it.unit_price,
        }));
      shippingFils = selectedShippingFils({
        items: toShippingItems(allItems),
        rates: dgRates,
        zoneId,
        vendorHolidays: onHoliday,
        subtotalFils,
      });

      // free_shipping coupons waive the covered delivery groups' shipping —
      // the coupon vendor's group for vendor coupons, all groups otherwise.
      // Mirrors CheckoutService.initiateCheckout so quote === charge.
      if (couponCtx && couponCtx.type === "free_shipping" && shippingFils > 0) {
        const coveredItems = couponCtx.vendorId
          ? allItems.filter((it) => it.vendor_id === couponCtx!.vendorId)
          : allItems;
        const waived = selectedShippingFils({
          items: toShippingItems(coveredItems),
          rates: dgRates,
          zoneId,
          vendorHolidays: onHoliday,
          subtotalFils,
        });
        shippingFils = Math.max(0, shippingFils - waived);
      }
    }

    const surchargeFils = paymentMethods.find((p) => p.id === defaultPayment)?.surcharge_fils ?? 0;
    // VAT is already in subtotalFils (extracted above for display only).
    const grandTotalFils = Math.max(0, subtotalFils + shippingFils + surchargeFils - discountFils);

    let businessBlock: CheckoutQuoteResponse["business"] | null = null;
    if (this.businessQuote && userId) {
      try {
        const b = await this.businessQuote.forQuote({
          userId,
          goodsTotalFils: subtotalFils - discountFils,
          // Net terms carry no surcharge (the default method's may be COD's).
          grandTotalFils: grandTotalFils - surchargeFils,
          cartHash,
        });
        if (b.paymentMethod) paymentMethods.push(b.paymentMethod);
        businessBlock = b.business;
      } catch (err) {
        // Never fail the quote over the business add-on; checkout re-checks.
        console.error("[quote] business context failed", { userId, error: String(err) });
      }
    }

    if (!paymentMethods.some((p) => p.available)) {
      blockingError = {
        code: "no_eligible_payment_methods",
        severity: "error",
        i18n_key: "checkout.error.no_eligible_payment_methods",
        params: {},
        affected_item_ids: null,
      };
    }

    // ── 9. Token + ETag ──
    const rulesEpoch = await this.rulesEpochService.get();
    const fx = getFxSnapshot();
    const issuedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + QUOTE_EXPIRES_SECONDS * 1000).toISOString();
    const tokenInputs: QuoteTokenInputs = {
      cartHash,
      addressId,
      userId,
      rulesEpoch,
      fxCapturedAt: fx.captured_at,
      issuedAt,
    };
    const quoteToken = signQuoteToken(this.secret, tokenInputs);
    const etag = computeEtag({
      cartHash,
      addressId,
      userId,
      rulesEpoch,
      fxEpoch: fxEpochFromCapturedAt(fx.captured_at),
      couponFingerprint: couponCtx ? `${couponCtx.code}:${couponCtx.discount}` : null,
    });

    // ── 10. Compatibility (platform default) — only for methods we actually
    // returned in payment_methods[]; e.g. COD is omitted entirely when disabled.
    const includedMethodIds = new Set(paymentMethods.map((m) => m.id));
    const compatibility: Record<string, string[]> = {};
    for (const m of API_PAYMENT_METHODS) {
      if (includedMethodIds.has(m)) {
        compatibility[m] = [...DEFAULT_COMPATIBILITY[m]];
      }
    }

    // ── 11. Response ──
    const shippingPayload = addressId
      ? {
          groups: groups.map((g) => ({
            group_id: g.group_id,
            items: g.vendorIds.map((vid) => ({
              vendor_id: vid,
              item_ids: allItems.filter((it) => it.vendor_id === vid).map((it) => it.id),
            })),
            methods: g.methods.map((m) => ({
              id: m.id,
              available: true,
              price_fils: m.price_fils,
              estimated_days: m.estimated_days,
              free_threshold_fils: m.free_threshold_fils,
              cutoff_at: null,
              next_available_at: null,
              reason_key: null,
            })),
            selected: shippingByGroup[g.group_id] ?? g.methods[0]?.id ?? "",
          })),
        }
      : null;

    const totals: CheckoutQuoteResponse["totals"] = {
      subtotal_fils: subtotalFils,
      vat_fils: vatFils,
      vat_rate_bps: vatRateBps,
      surcharge_fils: surchargeFils,
      discount_fils: discountFils,
      coupon_code: couponCtx?.code ?? null,
      grand_total_fils: grandTotalFils,
      default_selection: {
        payment_method_id: defaultPayment,
        shipping_by_group: shippingByGroup,
      },
    };
    if (addressId) totals.shipping_fils = shippingFils;

    const response: CheckoutQuoteResponse = {
      schema_version: 1,
      quote_token: quoteToken,
      issued_at: issuedAt,
      expires_at: expiresAt,
      currency: "AED",
      requires_address: !addressId,
      fx_snapshot: fx,
      totals,
      payment_methods: paymentMethods,
      shipping: shippingPayload,
      compatibility,
      notices: [],
      ...(blockingError ? { blocking_error: blockingError } : {}),
      ...(businessBlock ? { business: businessBlock } : {}),
    };

    return { response, etag, cartHash, rulesEpoch };
  }

  async validateQuoteToken(opts: {
    token: string;
    userId: string | null;
    addressId: string | null;
    cartHash: string;
    rulesEpoch: number;
    fxCapturedAt: string;
  }): Promise<boolean> {
    const issuedAt = parseIssuedAt(opts.token);
    if (!issuedAt) return false;
    return verifyQuoteToken(this.secret, opts.token, {
      cartHash: opts.cartHash,
      addressId: opts.addressId,
      userId: opts.userId,
      rulesEpoch: opts.rulesEpoch,
      fxCapturedAt: opts.fxCapturedAt,
      issuedAt,
    });
  }
}
