import type {
  Cart,
  CartItem,
  Inventory,
  Product,
  ProductVariant,
  QuoteResponse,
  VariantPriceTier,
} from "@materialhub/database";
import { BadRequestError, NotFoundError } from "@materialhub/plugins";
// cart.service.ts
import { type EntityManager, IsNull, type Repository } from "typeorm";
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

/** A cart line created by accepting a supplier's quote (RFQ). */
export interface QuotedLineInput {
  productId: string;
  variantId: string | null;
  vendorId: string;
  quantity: number;
  /** The accepted quote_responses.id. */
  quoteId: string;
  /** Per-unit price the quote locked in, in fils. */
  quotedUnitPrice: number;
  /** The listing's own price, kept as original_unit_price for reference. */
  listPrice: number;
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
    /** RFQ: reads a quoted line's MOQ. Optional so older wiring keeps working. */
    private quoteResponseRepo?: Repository<QuoteResponse>,
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

    // quote > tier > base (single resolver shared with the checkout quote).
    // A line that came from an accepted quote keeps its quoted price when the
    // buyer adds the same item again, and is held to the quote's minimum.
    const isQuoted = Boolean(item?.quote_id);
    const unitPrice = resolveLinePrice({
      basePrice: terms.basePrice,
      tiers: terms.tiers,
      quantity: data.quantity,
      quotedUnitPrice: isQuoted ? item?.quoted_unit_price : null,
    }).unitPrice;
    if (isQuoted && item?.quote_id) await this.assertQuoteMinimum(item.quote_id, data.quantity);
    // Quoted lines keep the listing price for reference; trade lines record
    // the resolved price (tier or base), as before.
    const listPrice = isQuoted ? terms.basePrice : unitPrice;

    if (item) {
      item.quantity = data.quantity;
      item.unit_price = unitPrice;
      item.line_total = unitPrice * data.quantity;
      item.original_unit_price = listPrice;
    } else {
      item = this.cartItemRepo.create({
        cart_id: cart.id,
        product_id: data.productId,
        variant_id: data.variantId,
        vendor_id: product.vendor_id,
        quantity: data.quantity,
        unit_price: unitPrice,
        original_unit_price: listPrice,
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
      originalUnitPrice: listPrice,
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
      if (item.quote_id) {
        // Quoted line: the quote's own minimum applies and the price stays locked.
        await this.assertQuoteMinimum(item.quote_id, quantity);
      } else if (item.product) {
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
      if (item.quote_id && item.quoted_unit_price != null) {
        // Quoted line: the live price is the accepted quote; trade rules don't apply.
        if (item.quoted_unit_price !== item.unit_price) staleItems.push(item.id);
        continue;
      }
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

  // ── RFQ: quoted lines ────────────────────────────────────────────────

  /** A quoted price only holds at or above the quote's minimum order. */
  private async assertQuoteMinimum(quoteId: string, quantity: number): Promise<void> {
    if (!this.quoteResponseRepo) return;
    const quote = await this.quoteResponseRepo.findOne({ where: { id: quoteId } });
    if (quote && quantity < quote.moq) {
      throw new BadRequestError(`The quoted price needs at least ${quote.moq} units`);
    }
  }

  /**
   * Add (or replace) the cart line for an accepted quote. Runs on the caller's
   * transaction so accepting a quote and filling the cart commit together.
   * Call syncQuotedLine after the transaction commits to refresh Redis.
   */
  async upsertQuotedLine(
    manager: EntityManager,
    userId: string,
    line: QuotedLineInput,
  ): Promise<CartItem> {
    const cartRepo = manager.getRepository<Cart>("Cart");
    const itemRepo = manager.getRepository<CartItem>("CartItem");
    let cart = await cartRepo.findOne({ where: { user_id: userId } as any });
    if (!cart) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      cart = await cartRepo.save({
        user_id: userId,
        guest_session_id: null,
        subtotal: 0,
        item_count: 0,
        expires_at: expiresAt,
      } as any);
    }
    // IsNull(), not null: TypeORM drops a bare null condition.
    const where: any = {
      cart_id: cart!.id,
      product_id: line.productId,
      variant_id: line.variantId ?? IsNull(),
    };
    const existing = await itemRepo.findOne({ where, withDeleted: true });
    // The listing's quantity breaks cap the quoted price (see resolveLinePrice).
    const tiers = await manager.getRepository<VariantPriceTier>("VariantPriceTier").find({
      where: line.variantId
        ? ({ variant_id: line.variantId } as any)
        : ({ product_id: line.productId, variant_id: IsNull() } as any),
    });
    const { unitPrice } = resolveLinePrice({
      basePrice: line.listPrice,
      tiers,
      quantity: line.quantity,
      quotedUnitPrice: line.quotedUnitPrice,
    });
    const values = {
      cart_id: cart!.id,
      product_id: line.productId,
      variant_id: line.variantId,
      vendor_id: line.vendorId,
      quantity: line.quantity,
      unit_price: unitPrice,
      original_unit_price: line.listPrice,
      line_total: unitPrice * line.quantity,
      quote_id: line.quoteId,
      quoted_unit_price: line.quotedUnitPrice,
      deleted_at: null,
    };
    const saved = existing
      ? await itemRepo.save({ ...existing, ...values } as any)
      : await itemRepo.save(itemRepo.create(values as any));
    const items = await itemRepo.find({ where: { cart_id: cart!.id } });
    const { subtotal, itemCount } = computeCartTotals(items);
    await cartRepo.save({ id: cart!.id, subtotal, item_count: itemCount } as any);
    return saved as CartItem;
  }

  /** Mirror a quoted line into the Redis cart after its transaction commits. */
  async syncQuotedLine(userId: string, item: CartItem): Promise<void> {
    await this.redisCart.setItem(userId, {
      productId: item.product_id,
      variantId: item.variant_id,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      vendorId: item.vendor_id,
      originalUnitPrice: item.original_unit_price,
    });
  }

  private async recalcCartTotals(cartId: string): Promise<void> {
    const items = await this.cartItemRepo.find({ where: { cart_id: cartId } });
    const { subtotal, itemCount } = computeCartTotals(items);
    await this.cartRepo.save({ id: cartId, subtotal, item_count: itemCount } as any);
  }
}
