import type { Cart, CartItem, Inventory, Product, ProductVariant } from "@materialhub/database";
import { BadRequestError, NotFoundError } from "@materialhub/plugins";
// cart.service.ts
import type { Repository } from "typeorm";
import type { CartRedisService } from "./cart-redis.service.ts";
import { computeCartTotals } from "./cart-totals.ts";

export class CartService {
  constructor(
    private cartRepo: Repository<Cart>,
    private cartItemRepo: Repository<CartItem>,
    private inventoryRepo: Repository<Inventory>,
    private productRepo: Repository<Product>,
    private variantRepo: Repository<ProductVariant>,
    private redisCart: CartRedisService,
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

    // Validate stock
    const inventoryWhere: any = { product_id: data.productId, vendor_id: product.vendor_id };
    if (data.variantId) inventoryWhere.variant_id = data.variantId;
    const inventory = await this.inventoryRepo.findOne({ where: inventoryWhere });
    const available = (inventory?.quantity_on_hand ?? 0) - (inventory?.quantity_reserved ?? 0);
    if (available < data.quantity) {
      throw new BadRequestError(`Only ${available} units available`);
    }

    // Check for existing cart item (upsert)
    const existingWhere: any = { cart_id: cart.id, product_id: data.productId };
    if (data.variantId) existingWhere.variant_id = data.variantId;
    let item = await this.cartItemRepo.findOne({ where: existingWhere });

    // Use variant price when adding a variant product
    let unitPrice = product.price;
    if (data.variantId) {
      const variant = await this.variantRepo.findOne({
        where: { id: data.variantId, product_id: data.productId },
      });
      if (!variant) throw new BadRequestError("Variant not found");
      unitPrice = variant.price;
    }

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
    const item = await this.cartItemRepo.findOne({
      where: [
        { cart_id: cart.id, variant_id: fieldKey },
        { cart_id: cart.id, product_id: fieldKey },
      ] as any,
    });
    if (!item) throw new NotFoundError("Cart item not found");

    if (quantity <= 0) {
      await this.cartItemRepo.softRemove(item);
      await this.redisCart.removeItem(this.ownerId(userId, guestSessionId), fieldKey);
    } else {
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
  }> {
    // A caller with no identity (e.g. a first-paint visitor whose guest session
    // is still being bootstrapped) owns no cart. Answer with an empty view
    // rather than creating an ownerless row or matching an arbitrary one.
    if (!userId && !guestSessionId) {
      return { cart: null, items: [], staleItems: [] };
    }

    const cart = await this.getOrCreateCart(userId, guestSessionId);
    const items = await this.cartItemRepo.find({
      where: { cart_id: cart.id },
      relations: ["product", "product.images", "variant", "vendor"],
    });

    // Stale-price detection — flag rows whose snapshot price drifted from the live price.
    const staleItems: string[] = [];
    for (const item of items) {
      if (item.product) {
        const livePrice = item.variant?.price ?? item.product.price;
        if (livePrice !== item.unit_price) {
          staleItems.push(item.id);
        }
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
    };
  }

  private async recalcCartTotals(cartId: string): Promise<void> {
    const items = await this.cartItemRepo.find({ where: { cart_id: cartId } });
    const { subtotal, itemCount } = computeCartTotals(items);
    await this.cartRepo.save({ id: cartId, subtotal, item_count: itemCount } as any);
  }
}
