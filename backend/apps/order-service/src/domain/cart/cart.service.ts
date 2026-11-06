import type { Cart, CartItem, Inventory, Product, ProductVariant } from "@materialhub/database";
import { BadRequestError, NotFoundError } from "@materialhub/plugins";
// cart.service.ts
import { IsNull, type Repository } from "typeorm";
import type { CartRedisService } from "./cart-redis.service.ts";
import { computeCartTotals } from "./cart-totals.ts";
import { type CartPricingSource, noTradePricing } from "./pricing/cart-pricing.service.ts";
import { type CartLineTrade, lineTradeView } from "./pricing/line-trade-view.ts";
import { resolveLinePrice } from "./pricing/price-resolver.ts";
import { assertQuantity, tradeTermsFor } from "./pricing/trade-terms.ts";

/** A line whose quantity no longer meets its trade terms (vendor changed them after it was added). */
export interface CartRuleViolation {
  item_id: string;
  code: string;
  message: string;
  suggested_quantity: number;
}

export class CartService {
  constructor(
    private cartRepo: Repository<Cart>,
    private cartItemRepo: Repository<CartItem>,
    private inventoryRepo: Repository<Inventory>,
    private productRepo: Repository<Product>,
    private variantRepo: Repository<ProductVariant>,
    private redisCart: CartRedisService,
    /** Trade pricing (tiers, sample shipping). Optional so older call sites keep working. */
    readonly pricing: CartPricingSource = noTradePricing,
  ) {}

  /**
   * Owner filter for a cart lookup, or null when the caller has no identity.
   *
   * Never fall back to a bare `{ guest_session_id: null }`: TypeORM drops a
   * null condition, so the query degenerates to "the first cart in the table"
   * and hands the caller a stranger's cart.
   */
  private cartOwnerWhere(
    userId: string | null,
    guestSessionId: string | null,
  ): { user_id: string } | { guest_session_id: string } | null {
    if (userId) return { user_id: userId };
    if (guestSessionId) return { guest_session_id: guestSessionId };
    return null;
  }

  async getOrCreateCart(userId: string | null, guestSessionId: string | null): Promise<Cart> {
    const where = this.cartOwnerWhere(userId, guestSessionId);
    if (!where) {
      throw new BadRequestError("A user session or guest session is required to use the cart");
    }
    let cart = await this.cartRepo.findOne({ where: where as any });
    if (!cart) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      cart = await this.cartRepo.save({
        user_id: userId,
        guest_session_id: guestSessionId,
        subtotal: 0,
        item_count: 0,
        expires_at: expiresAt,
      } as any);
    }
    return cart!;
  }

  private ownerId(userId: string | null, guestSessionId: string | null): string {
    return userId || guestSessionId || "";
  }

  async addItem(
    userId: string | null,
    guestSessionId: string | null,
    data: { productId: string; variantId: string | null; quantity: number },
  ): Promise<CartItem> {
    const cart = await this.getOrCreateCart(userId, guestSessionId);

    // Validate product exists and is published
    const product = await this.productRepo.findOne({ where: { id: data.productId } });
    if (!product || product.status !== "published") {
      throw new BadRequestError("Product not available");
    }

    // Variant lines are priced and ruled by the variant; others by the product.
    let variant: ProductVariant | null = null;
    if (data.variantId) {
      variant = await this.variantRepo.findOne({
        where: { id: data.variantId, product_id: data.productId },
      });
      if (!variant || variant.is_active === false) throw new BadRequestError("Variant not found");
    }

    // Trade terms: minimum order, increments, sample cap → 422 with a code.
    const terms = tradeTermsFor(
      product,
      variant,
      await this.pricing.tiersForProducts([data.productId]),
    );
    assertQuantity(terms, data.quantity);

    // Validate stock. A line without a variant must not match a variant's
    // inventory row (e.g. the product's sample), so pin variant_id explicitly.
    const inventory = await this.inventoryRepo.findOne({
      where: {
        product_id: data.productId,
        vendor_id: product.vendor_id,
        variant_id: data.variantId ?? IsNull(),
      } as any,
    });
    const available = (inventory?.quantity_on_hand ?? 0) - (inventory?.quantity_reserved ?? 0);
    if (available < data.quantity) {
      throw new BadRequestError(`Only ${available} units available`);
    }

    // Check for existing cart item (upsert)
    let item = await this.cartItemRepo.findOne({
      where: {
        cart_id: cart.id,
        product_id: data.productId,
        variant_id: data.variantId ?? IsNull(),
      } as any,
    });

    // Base → tier by quantity (single resolver shared with the checkout quote).
    const unitPrice = resolveLinePrice({
      basePrice: terms.basePrice,
      tiers: terms.tiers,
      quantity: data.quantity,
    }).unitPrice;

    if (item) {
      item.quantity = data.quantity;
      item.unit_price = unitPrice;
      item.line_total = unitPrice * data.quantity;
      item.original_unit_price = unitPrice;
    } else {
      item = this.cartItemRepo.create({
        cart_id: cart.id,
        product_id: data.productId,
        variant_id: data.variantId,
        vendor_id: product.vendor_id,
        quantity: data.quantity,
        unit_price: unitPrice,
        original_unit_price: unitPrice,
        line_total: unitPrice * data.quantity,
      });
    }
    const saved = await this.cartItemRepo.save(item);

    // Dual-write to Redis
    await this.redisCart.setItem(this.ownerId(userId, guestSessionId), {
      productId: data.productId,
      variantId: data.variantId,
      quantity: data.quantity,
      unitPrice,
      vendorId: product.vendor_id,
      originalUnitPrice: unitPrice,
    });

    await this.recalcCartTotals(cart.id);
    return saved;
  }

  async updateItemQuantity(
    userId: string | null,
    guestSessionId: string | null,
    fieldKey: string,
    quantity: number,
  ): Promise<void> {
    const cart = await this.getOrCreateCart(userId, guestSessionId);
    // fieldKey is the variant id, or the product id for a line without a
    // variant. The product-id branch must not match a variant line of the same
    // product (e.g. its sample).
    const item = await this.cartItemRepo.findOne({
      where: [
        { cart_id: cart.id, variant_id: fieldKey },
        { cart_id: cart.id, product_id: fieldKey, variant_id: IsNull() },
      ] as any,
      relations: ["product", "variant"],
    });
    if (!item) throw new NotFoundError("Cart item not found");

    if (quantity <= 0) {
      await this.cartItemRepo.softRemove(item);
      await this.redisCart.removeItem(this.ownerId(userId, guestSessionId), fieldKey);
    } else {
      if (item.product) {
        const terms = tradeTermsFor(
          item.product,
          item.variant,
          await this.pricing.tiersForProducts([item.product_id]),
        );
        assertQuantity(terms, quantity);
        const resolved = resolveLinePrice({
          basePrice: terms.basePrice,
          tiers: terms.tiers,
          quantity,
        });
        item.unit_price = resolved.unitPrice;
        item.original_unit_price = resolved.unitPrice;
      }
      item.quantity = quantity;
      item.line_total = item.unit_price * quantity;
      await this.cartItemRepo.save(item);
      await this.redisCart.setItem(this.ownerId(userId, guestSessionId), {
        productId: item.product_id,
        variantId: item.variant_id,
        quantity,
        unitPrice: item.unit_price,
        vendorId: item.vendor_id,
        originalUnitPrice: item.original_unit_price,
      });
    }

    await this.recalcCartTotals(cart.id);
  }

  async clearCart(userId: string | null, guestSessionId: string | null): Promise<void> {
    const cart = await this.getOrCreateCart(userId, guestSessionId);
    const items = await this.cartItemRepo.find({ where: { cart_id: cart.id } });
    if (items.length > 0) {
      await this.cartItemRepo.softRemove(items);
    }
    cart.subtotal = 0;
    cart.item_count = 0;
    (cart as any).coupon_id = null;
    (cart as any).coupon_code = null;
    (cart as any).coupon_discount = 0;
    await this.cartRepo.save(cart);
    await this.redisCart.clear(this.ownerId(userId, guestSessionId));
  }

  /** Persist a validated coupon on the cart so quote/order creation pick it up. */
  async setCoupon(
    userId: string | null,
    guestSessionId: string | null,
    coupon: { couponId: string; code: string; discount: number },
  ): Promise<void> {
    const cart = await this.getOrCreateCart(userId, guestSessionId);
    await this.cartRepo.save({
      id: cart.id,
      coupon_id: coupon.couponId,
      coupon_code: coupon.code,
      coupon_discount: coupon.discount,
    } as any);
  }

  async clearCoupon(userId: string | null, guestSessionId: string | null): Promise<void> {
    const cart = await this.getOrCreateCart(userId, guestSessionId);
    await this.cartRepo.save({
      id: cart.id,
      coupon_id: null,
      coupon_code: null,
      coupon_discount: 0,
    } as any);
  }

  async getCart(
    userId: string | null,
    guestSessionId: string | null,
  ): Promise<{
    cart: Cart | null;
    items: any[];
    staleItems: string[];
    /** Lines whose quantity breaks the current trade terms; checkout refuses them. */
    ruleViolations: CartRuleViolation[];
  }> {
    // A caller with no identity (e.g. a first-paint visitor whose guest session
    // is still being bootstrapped) owns no cart. Answer with an empty view
    // rather than creating an ownerless row or matching an arbitrary one.
    if (!userId && !guestSessionId) {
      return { cart: null, items: [], staleItems: [], ruleViolations: [] };
    }

    const cart = await this.getOrCreateCart(userId, guestSessionId);
    const items = await this.cartItemRepo.find({
      where: { cart_id: cart.id },
      relations: ["product", "product.images", "variant", "vendor"],
    });

    // Stale-price detection — flag rows whose snapshot price drifted from the
    // live price. "Live" is the resolver's price at the line's quantity, so a
    // tier change by the vendor is caught the same way as a base price change.
    const tierRows = await this.pricing.tiersForProducts(items.map((i) => i.product_id));
    const staleItems: string[] = [];
    const ruleViolations: CartRuleViolation[] = [];
    for (const item of items) {
      if (!item.product) continue;
      const trade: CartLineTrade = lineTradeView(
        tradeTermsFor(item.product, item.variant, tierRows),
        item.quantity,
      );
      (item as CartItem & { trade?: CartLineTrade }).trade = trade;
      if (trade.live_unit_price !== item.unit_price) {
        staleItems.push(item.id);
      }
      if (trade.violation) {
        ruleViolations.push({
          item_id: item.id,
          code: trade.violation.code,
          message: trade.violation.message,
          suggested_quantity: trade.violation.suggested_quantity,
        });
      }
    }

    // Group by vendor
    const grouped = items.reduce((acc: Record<string, any[]>, item) => {
      const vid = item.vendor_id;
      if (!acc[vid]) acc[vid] = [];
      acc[vid].push(item);
      return acc;
    }, {});

    return {
      cart,
      items: Object.entries(grouped).map(([vendorId, vendorItems]) => ({
        vendor_id: vendorId,
        vendor_name: (vendorItems[0] as any).vendor?.name,
        items: vendorItems,
      })),
      staleItems,
      ruleViolations,
    };
  }

  private async recalcCartTotals(cartId: string): Promise<void> {
    const items = await this.cartItemRepo.find({ where: { cart_id: cartId } });
    const { subtotal, itemCount } = computeCartTotals(items);
    await this.cartRepo.save({ id: cartId, subtotal, item_count: itemCount } as any);
  }
}
