// checkout.service.ts
import type { PaymentMethodThreshold, ShippingRate, UserAddress } from "@materialhub/database";
import { BadRequestError, HttpError } from "@materialhub/plugins";
import type { Repository } from "typeorm";
import { businessBillingSnapshot } from "../business/business-context.ts";
import type { NetTermsService } from "../business/net-terms.service.ts";
import type { OrderApprovalService } from "../business/order-approval.service.ts";
import type { CartService } from "../cart/cart.service.ts";
import { sampleShippingRule } from "../cart/pricing/sample-shipping.ts";
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
    // Business accounts (workstream 3): approval gate, buyer TRN snapshot and
    // the net_terms payment method. Optional so retail-only tests skip it.
    private business?: { netTerms: NetTermsService; approvals: OrderApprovalService } | null,
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
    const { cart, items, staleItems, ruleViolations } = await this.cartService.getCart(
      data.userId,
      null,
    );
    // getCart returns a null cart when the caller has no identity at all.
    if (!cart) {
      throw new BadRequestError("Cart is empty");
    }
    if (items.length === 0 || (cart as any).item_count === 0) {
      throw new BadRequestError("Cart is empty");
    }
    if (staleItems.length > 0) {
      throw new BadRequestError("Cart has stale prices — please refresh your cart");
    }
    // Trade terms (minimum order, increments, sample cap) can change after a
    // line was added; never place an order that breaks them.
    if (ruleViolations && ruleViolations.length > 0) {
      throw new HttpError(
        422,
        "Some cart quantities no longer meet the supplier's ordering rules",
        "CART_QUANTITY_RULES",
        { items: ruleViolations },
      );
    }

    // 2. Flatten all items
    const allItems = items.flatMap((group: any) => group.items);

    // 2a. Re-validate any coupon persisted on the cart. The discount snapshot
    // on the cart may be stale (items changed, coupon expired, usage limit hit
    // since apply) — never charge off a stale snapshot.
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

      // No vendor-availability exclusions apply; every vendor group is shippable.
      const onHoliday = new Set<string>();

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
      // Suppliers shipping only samples pay the admin-set sample rate at most.
      const sampleShipping = allItems.some((it: any) => it.variant?.is_sample)
        ? sampleShippingRule(
            allItems.map((it: any) => ({
              vendor_id: it.vendor_id,
              is_sample: it.variant?.is_sample,
            })),
            await this.cartService.pricing.sampleShippingFils(),
          )
        : undefined;
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
        sampleShipping,
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
          sampleShipping,
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

    // 5c. Business buyers. The billing snapshot (legal name, TRN, address) is
    // always taken from the business account, never from the client, so the
    // tax invoices carry the verified details. A buyer above the approval
    // limit needs an approval for exactly this cart; net terms are re-checked
    // here and again (under a row lock) when the order is confirmed.
    const goodsTotal =
      Number((cart as { subtotal?: number }).subtotal ?? 0) - (coupon?.discount ?? 0);
    const businessCtx = this.business ? await this.business.netTerms.context(data.userId) : null;
    if (data.paymentMethod === "net_terms") {
      if (!this.business) throw new BadRequestError("Pay on invoice is not available");
      this.business.netTerms.assertEligible(businessCtx, goodsTotal + shippingTotal);
    }
    const approvalId = this.business
      ? await this.business.approvals.reserveForCheckout(
          businessCtx,
          data.userId,
          allItems,
          goodsTotal,
        )
      : null;
    const billingAddress = businessCtx ? businessBillingSnapshot(businessCtx) : data.billingAddress;

    // 6. Create order
    let created: Awaited<ReturnType<OrderCreationService["createOrder"]>>;
    try {
      created = await this.orderCreationService.createOrder({
        userId: data.userId,
        cartItems: allItems,
        shippingAddress: data.shippingAddress,
        billingAddress,
        businessAccountId: businessCtx?.businessAccountId ?? null,
        buyerTrn: businessCtx?.trn ?? null,
        taxTotal,
        shippingTotal,
        surchargeTotal,
        discountTotal: coupon?.discount ?? 0,
        couponId: coupon?.couponId ?? null,
        couponCode: coupon?.code ?? null,
        couponDiscount: coupon?.discount ?? 0,
        channel: data.channel,
        shippingMethod: data.shippingMethod,
        customerNotes: data.customerNotes,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      });
    } catch (err) {
      if (approvalId) await this.business?.approvals.release(approvalId);
      throw err;
    }
    const { order } = created;
    if (approvalId) await this.business?.approvals.attachOrder(approvalId, order.id);

    // Return the order's own persisted totals so the response breakdown always
    // reconciles with grandTotal.
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
      case "net_terms": {
        // Pay on invoice: confirms the order with payment due in 30/60 days.
        // Idempotent (see NetTermsService.confirmOrder); `amount` is ignored,
        // the order's own grand_total is what goes on terms.
        if (!this.business) throw new BadRequestError("Pay on invoice is not available");
        return this.business.netTerms.confirmOrder(orderId, userId);
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
