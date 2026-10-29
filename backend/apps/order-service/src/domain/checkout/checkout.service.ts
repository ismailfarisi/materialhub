// checkout.service.ts
import type {
  PaymentMethodThreshold,
  ShippingRate,
  UserAddress,
  VendorHoliday,
} from "@materialhub/database";
import { BadRequestError } from "@materialhub/plugins";
import type { Repository } from "typeorm";
import type { CartService } from "../cart/cart.service.ts";
import type { ShippingService } from "../shipping/shipping.service.ts";
import { type CouponResult, type CouponService, toCouponLines } from "./coupon.service.ts";
import type { OrderConfirmationService } from "./order-confirmation.service.ts";
import type { OrderCreationService } from "./order-creation.service.ts";
import type { PaymentService, TamaraRedirectUrls } from "./payment.service.ts";
import type { CartHashItem } from "./quote/cart-hash.ts";
import { computeCartHash } from "./quote/cart-hash.ts";
import { getFxSnapshot } from "./quote/defaults.ts";
import type { QuoteService } from "./quote/quote.service.ts";
import { selectedShippingFils } from "./quote/shipping-total.ts";
import type { TaxService } from "./tax.service.ts";

export interface ExpandedGiftComponent {
  product_id: string;
  variant_id: string | null;
  vendor_id: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  original_unit_price: number;
  flash_deal_id: null;
  __giftBoxRef: string; // = cart_gift_box id
}

export interface ExpandedGiftBox {
  ref: string; // cart_gift_box id
  gift_box_id: string;
  box_name_snapshot: string;
  style_snapshot: Record<string, unknown> | null;
  occasion_snapshot: Record<string, unknown> | null;
  packaging_price: number; // total for this line (× box.quantity)
  gift_message: string | null;
  recipient_name: string | null;
}

/**
 * Pure expander: turns persisted cart gift boxes into per-component order lines
 * plus aggregate packaging / discount totals and gift_order metadata.
 *
 * Correctness rule: a box's charged total === its cart unit_price
 * (itemsSubtotal − discount + packaging). We split those three parts so:
 *  - component lines feed the order subtotal (full item price, commissioned),
 *  - packaging feeds surchargeTotal,
 *  - discount feeds discountTotal (platform-absorbed; vendors paid on full price).
 * Then per box: Σ(components.line_total) + packaging − discount
 *   === box.unit_price * box.quantity.
 */
export function expandGiftBoxes(giftBoxes: any[]): {
  components: ExpandedGiftComponent[];
  packagingTotal: number;
  discountTotal: number;
  giftOrders: ExpandedGiftBox[];
} {
  const components: ExpandedGiftComponent[] = [];
  const giftOrders: ExpandedGiftBox[] = [];
  let packagingTotal = 0;
  let discountTotal = 0;
  for (const gb of giftBoxes ?? []) {
    const boxQty = gb.quantity ?? 1;
    packagingTotal += (gb.packaging_price ?? 0) * boxQty;
    discountTotal += (gb.discount_total ?? 0) * boxQty;
    giftOrders.push({
      ref: gb.id,
      gift_box_id: gb.gift_box_id,
      box_name_snapshot: gb.box_name_snapshot,
      style_snapshot: gb.style_snapshot ?? null,
      occasion_snapshot: gb.occasion_snapshot ?? null,
      packaging_price: (gb.packaging_price ?? 0) * boxQty,
      gift_message: gb.gift_message ?? null,
      recipient_name: gb.recipient_name ?? null,
    });
    for (const c of gb.components ?? []) {
      const qty = c.quantity * boxQty;
      components.push({
        product_id: c.product_id,
        variant_id: c.variant_id,
        vendor_id: c.vendor_id,
        quantity: qty,
        unit_price: c.unit_price,
        line_total: c.unit_price * qty,
        original_unit_price: c.unit_price,
        flash_deal_id: null,
        __giftBoxRef: gb.id,
      });
    }
  }
  return { components, packagingTotal, discountTotal, giftOrders };
}

export class CheckoutService {
  constructor(
    private cartService: CartService,
    private taxService: TaxService,
    private shippingService: ShippingService,
    private couponService: CouponService,
    private orderCreationService: OrderCreationService,
    private paymentService: PaymentService,
    private quoteService: QuoteService,
    private orderConfirmationService: OrderConfirmationService,
    private thresholdRepo: Repository<PaymentMethodThreshold>,
    private shippingRateRepo: Repository<ShippingRate>,
    private userAddressRepo: Repository<UserAddress>,
    private vendorHolidayRepo: Repository<VendorHoliday>,
  ) {}

  async initiateCheckout(data: {
    userId: string;
    shippingAddress: Record<string, unknown>;
    billingAddress?: Record<string, unknown>;
    shippingMethod?: string;
    customerNotes?: string;
    channel: string;
    ipAddress?: string;
    userAgent?: string;
    quote_token?: string;
    address_id?: string;
    paymentMethod?: string;
  }): Promise<
    | {
        orderId: string;
        orderNumber: string;
        subtotal: number;
        taxTotal: number;
        shippingTotal: number;
        discountTotal: number;
        grandTotal: number;
        surchargeTotal: number;
      }
    | {
        status: 409;
        error: { code: string; reason_key: string; message: string };
        fresh_quote: unknown;
      }
  > {
    // 1. Fetch and validate cart
    const { cart, items, staleItems, giftBoxes } = await this.cartService.getCart(
      data.userId,
      null,
    );
    // getCart returns a null cart when the caller has no identity at all.
    if (!cart) {
      throw new BadRequestError("Cart is empty");
    }
    // A cart containing only gift boxes (no loose cart_items) is NOT empty.
    if ((items.length === 0 && (giftBoxes?.length ?? 0) === 0) || (cart as any).item_count === 0) {
      throw new BadRequestError("Cart is empty");
    }
    if (staleItems.length > 0) {
      throw new BadRequestError("Cart has stale prices — please refresh your cart");
    }

    // Deal state may have changed since cart was last viewed. Re-fetch and
    // surface any deal_ended/deal_updated notifications as a 409 so the client
    // can show the snap-back banner before re-attempting checkout.
    const refresh = await this.cartService.getCart(data.userId, null);
    if (refresh.notifications.length > 0) {
      return {
        status: 409,
        error: {
          code: "deal_state_changed",
          reason_key: "checkout.error.deal_state_changed",
          message: "Flash deal state has changed for one or more items",
        },
        fresh_quote: refresh,
      };
    }

    // 2. Flatten all items
    const allItems = items.flatMap((group: any) => group.items);

    // 2a. Re-validate any coupon persisted on the cart. The discount snapshot
    // on the cart may be stale (items changed, coupon expired, usage limit hit
    // since apply) — never charge off a stale snapshot. Coupons cover loose
    // cart items only; gift boxes carry their own discount machinery.
    const couponLines = toCouponLines(allItems);
    let coupon: CouponResult | null = null;
    if ((cart as any).coupon_code) {
      try {
        coupon = await this.couponService.validate(
          (cart as any).coupon_code,
          data.userId,
          couponLines,
        );
      } catch (err) {
        await this.cartService.clearCoupon(data.userId, null);
        if (err instanceof BadRequestError) {
          throw new BadRequestError(
            `Coupon ${(cart as any).coupon_code} is no longer valid and has been removed — please review your total`,
          );
        }
        throw err;
      }
      if (coupon.discount !== Number((cart as any).coupon_discount ?? 0)) {
        await this.cartService.setCoupon(data.userId, null, {
          couponId: coupon.couponId,
          code: coupon.code,
          discount: coupon.discount,
        });
      }
    }

    // 2b. Expand persisted gift boxes into per-component order lines. Components
    // are appended to allItems BEFORE vendorIds is derived so gift-component
    // vendors get the same shipping / holiday handling as loose cart items. The
    // box packaging/discount are tracked separately and folded into the order
    // surcharge / discount totals so each box's charged total equals its cart
    // unit_price (items − discount + packaging).
    const {
      components: giftComponents,
      packagingTotal: giftPackagingTotal,
      discountTotal: giftDiscount,
      giftOrders,
    } = expandGiftBoxes(giftBoxes ?? []);
    allItems.push(...giftComponents);

    // 3. Validate quote_token if provided
    if (data.quote_token) {
      const cartHash = computeCartHash(
        allItems.map<CartHashItem>((it) => ({
          product_id: it.product_id,
          variant_id: it.variant_id ?? null,
          quantity: it.quantity,
          unit_price: it.unit_price,
        })),
      );
      const rulesEpoch = await this.quoteService.rulesEpochService.get();
      const fx = getFxSnapshot();
      const valid = await this.quoteService.validateQuoteToken({
        token: data.quote_token,
        userId: data.userId,
        addressId: data.address_id ?? null,
        cartHash,
        rulesEpoch,
        fxCapturedAt: fx.captured_at,
      });
      if (!valid) {
        const fresh = await this.quoteService.buildQuote({
          userId: data.userId,
          addressId: data.address_id ?? null,
        });
        return {
          status: 409,
          error: {
            code: "quote_token_stale",
            reason_key: "checkout.error.quote_token_stale",
            message: "Quote has changed since token was issued",
          },
          fresh_quote: fresh.response,
        };
      }
    }

    // 4. Tax — product prices are VAT-inclusive. Snapshot the extracted
    // VAT for the order record (informational; not added to grand_total).
    const taxTotal = (cart as any).subtotal - Math.round(((cart as any).subtotal || 0) / 1.05);

    // 5. Shipping — same rate-based computation the quote uses (single source of
    // truth). The quote only computes shipping when an address is present; mirror
    // that here so a no-address initiate is never charged shipping.
    const vendorIds = Array.from(new Set(allItems.map((i: any) => i.vendor_id as string)));
    let shippingTotal = 0;
    if (data.address_id) {
      let zoneId: string | null = null;
      const addr = await this.userAddressRepo.findOne({
        where: { id: data.address_id, user_id: data.userId },
      });
      zoneId = addr?.area_id ?? null;

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

      // Vendor holidays covering today — mirror the quote so a vendor-on-holiday
      // group is excluded from shipping exactly as the quote excludes it.
      const today = new Date().toISOString().slice(0, 10);
      const activeHolidays: VendorHoliday[] = vendorIds.length
        ? await this.vendorHolidayRepo
            .createQueryBuilder("h")
            .where("h.vendor_id IN (:...vendorIds)", { vendorIds })
            .andWhere("h.starts_at <= :today AND h.ends_at >= :today", { today })
            .getMany()
        : [];
      const onHoliday = new Set(activeHolidays.map((h) => h.vendor_id));

      const shippingRates = rateRows.map((r) => ({
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
      const toShippingItems = (list: any[]) =>
        list.map((it: any) => ({
          id: it.id,
          vendor_id: it.vendor_id,
          product_id: it.product_id,
          quantity: it.quantity,
          unit_price: it.unit_price,
        }));
      shippingTotal = selectedShippingFils({
        items: toShippingItems(allItems),
        rates: shippingRates,
        zoneId,
        vendorHolidays: onHoliday,
        subtotalFils: (cart as any).subtotal,
      });

      // A free_shipping coupon waives the shipping of the delivery groups it
      // covers: the coupon's vendor group for vendor coupons, all groups for
      // platform-wide ones. Delivery groups are per-vendor, so the covered
      // amount is exactly the shipping of the covered vendors' items.
      if (coupon && coupon.type === "free_shipping" && shippingTotal > 0) {
        const coveredItems = coupon.vendorId
          ? allItems.filter((it: any) => it.vendor_id === coupon.vendorId)
          : allItems;
        const waived = selectedShippingFils({
          items: toShippingItems(coveredItems),
          rates: shippingRates,
          zoneId,
          vendorHolidays: onHoliday,
          subtotalFils: (cart as any).subtotal,
        });
        shippingTotal = Math.max(0, shippingTotal - waived);
      }
    }

    // 5b. Payment-method surcharge (COD only today; single source =
    // payment_method_thresholds). Enforce the COD limit server-side: the quote
    // marks COD unavailable above max_amount_fils and the UI disables it, but the
    // server must reject it too rather than silently creating the order.
    let surchargeTotal = 0;
    if (data.paymentMethod === "cod" || data.paymentMethod === "cash_on_delivery") {
      const codRow = await this.thresholdRepo.findOne({
        where: { provider: "cod", is_active: true },
      });
      if (!codRow) {
        throw new BadRequestError("Cash on delivery is not available");
      }
      if ((cart as any).subtotal > codRow.max_amount_fils) {
        throw new BadRequestError("Cash on delivery is not available for this order amount");
      }
      surchargeTotal = codRow.surcharge_fils ?? 0;
    }

    // 6. Create order
    const { order } = await this.orderCreationService.createOrder({
      userId: data.userId,
      cartItems: allItems,
      shippingAddress: data.shippingAddress,
      billingAddress: data.billingAddress,
      taxTotal,
      shippingTotal,
      // Gift box packaging is a per-box surcharge; coupon discount + gift box
      // discount both reduce the customer total without reducing item line_totals.
      surchargeTotal: surchargeTotal + giftPackagingTotal,
      discountTotal: (coupon?.discount ?? 0) + giftDiscount,
      couponId: coupon?.couponId ?? null,
      couponCode: coupon?.code ?? null,
      couponDiscount: coupon?.discount ?? 0,
      giftOrders,
      channel: data.channel,
      affiliateCode: (cart as any).affiliate_code ?? null,
      shippingMethod: data.shippingMethod,
      customerNotes: data.customerNotes,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
    });

    // Return the order's own persisted totals so the response breakdown always
    // reconciles with grandTotal. For non-gift orders these equal the prior
    // values (cart.subtotal/coupon_discount/COD surcharge); for gift orders they
    // correctly include the gift discount and packaging surcharge.
    return {
      orderId: (order as any).id,
      orderNumber: (order as any).order_number,
      subtotal: (order as any).subtotal,
      taxTotal: (order as any).tax_total,
      shippingTotal: (order as any).shipping_total,
      discountTotal: (order as any).discount_total,
      grandTotal: (order as any).grand_total,
      surchargeTotal: (order as any).surcharge_total,
    };
  }

  /** Validate a coupon against the user's current cart without persisting it. */
  async previewCoupon(userId: string, couponCode: string): Promise<CouponResult> {
    const { items } = await this.cartService.getCart(userId, null);
    const lines = toCouponLines(items.flatMap((group: any) => group.items));
    return this.couponService.validate(couponCode, userId, lines);
  }

  /** Public coupons that currently apply to this user's cart. */
  async availableCoupons(userId: string) {
    const { items } = await this.cartService.getCart(userId, null);
    const lines = toCouponLines(items.flatMap((group: any) => group.items));
    return this.couponService.discoverApplicable(userId, lines);
  }

  /**
   * Validate and persist the coupon on the cart. Quote totals and order
   * creation both read the cart's coupon columns, so this is the write that
   * makes the discount real (initiateCheckout re-validates before charging).
   */
  async applyCoupon(
    userId: string,
    _orderId: string | undefined,
    couponCode: string,
  ): Promise<{ discount: number; code: string; type: string }> {
    const result = await this.previewCoupon(userId, couponCode);
    await this.cartService.setCoupon(userId, null, {
      couponId: result.couponId,
      code: result.code,
      discount: result.discount,
    });
    return { discount: result.discount, code: result.code, type: result.type };
  }

  async removeCoupon(userId: string): Promise<void> {
    await this.cartService.clearCoupon(userId, null);
  }

  async createPaymentIntent(
    orderId: string,
    userId: string,
    amount: number | undefined,
    paymentMethod: string,
    redirectUrls?: TamaraRedirectUrls,
  ) {
    // Only the Tamara retry flow may omit `amount` — the order's own
    // grand_total is authoritative there (payment.service.ts createTamaraSession).
    // Every other payment method still requires a real client-supplied amount;
    // narrowing it here (rather than loosening createCodPayment / createTabbySession
    // / createStripePaymentIntent to accept undefined) keeps those signatures
    // honest and turns a missing amount into a clear 400 instead of an
    // `undefined` silently reaching a payment gateway or NOT NULL column.
    switch (paymentMethod) {
      case "cash_on_delivery": {
        if (amount === undefined) {
          throw new BadRequestError("amount is required for cash_on_delivery payments");
        }
        const result = await this.paymentService.createCodPayment({ orderId, userId, amount });
        // COD has no async webhook; the customer is committed the moment they
        // pick COD. Count the coupon redemption and drain the cart now.
        // Prepaid providers (Stripe today, Tabby / Tamara tomorrow) do both
        // from their webhook via OrderConfirmationService.markOrderPaid.
        await this.orderConfirmationService.recordCouponUsage(orderId);
        await this.orderConfirmationService.clearCustomerCart(userId);
        // COD ships before payment capture — the courier collects the cash —
        // so carrier booking starts here rather than from a payment webhook.
        await this.orderConfirmationService.triggerAutoShipments(orderId);
        // COD has no payment webhook, so the order-placed emails (customer +
        // vendors) fire here — the moment the order is committed. Prepaid
        // providers emit this from markOrderPaid after capture instead.
        await this.orderConfirmationService.emitOrderPlaced(orderId, userId);
        return result;
      }
      case "tabby":
        if (amount === undefined) {
          throw new BadRequestError("amount is required for tabby payments");
        }
        return this.paymentService.createTabbySession({ orderId, userId, amount });
      case "tamara":
        return this.paymentService.createTamaraSession({ orderId, userId, amount, redirectUrls });
      default:
        if (amount === undefined) {
          throw new BadRequestError("amount is required for this payment method");
        }
        return this.paymentService.createStripePaymentIntent({ orderId, userId, amount });
    }
  }
}
