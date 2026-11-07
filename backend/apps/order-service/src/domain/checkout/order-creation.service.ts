import {
  type Inventory,
  type InventoryMovement,
  type InventoryReservation,
  type Order,
  type OrderItem,
  type OrderStatusHistory,
  Product,
  type ShippingContributionTier,
  type SiteSetting,
  Vendor,
  type VendorOrder,
  Warehouse,
} from "@materialhub/database";
import type { Queue } from "bullmq";
// order-creation.service.ts
import { type EntityManager, In, IsNull, type Repository } from "typeorm";
import type { CommissionService } from "../commission/commission.service.ts";
import { IntegrationEventType, emitIfEnabled } from "../integration/emit.ts";
import {
  type ContributionTierRow,
  resolveShippingContribution,
} from "../shipping/shipping-contribution.ts";

/** Group cart items into one vendor-order bucket per vendor. */
export function groupItemsForVendorOrders(cartItems: any[]): {
  vendorId: string;
  items: any[];
}[] {
  const buckets = new Map<string, { vendorId: string; items: any[] }>();
  for (const item of cartItems) {
    const vendorId: string = item.vendor_id;
    let b = buckets.get(vendorId);
    if (!b) {
      b = { vendorId, items: [] };
      buckets.set(vendorId, b);
    }
    b.items.push(item);
  }
  return [...buckets.values()];
}

export class OrderCreationService {
  constructor(
    private orderRepo: Repository<Order>,
    private vendorOrderRepo: Repository<VendorOrder>,
    private orderItemRepo: Repository<OrderItem>,
    private statusHistoryRepo: Repository<OrderStatusHistory>,
    private inventoryRepo?: Repository<Inventory>,
    private reservationRepo?: Repository<InventoryReservation>,
    private movementRepo?: Repository<InventoryMovement>,
    private integrationEventsQueue?: Queue,
    private siteSettingRepo?: Repository<SiteSetting>,
    private commissionService?: CommissionService,
    private shippingContributionTierRepo?: Repository<ShippingContributionTier>,
  ) {}

  /**
   * MH-<year>-<6+ digit sequence>, from the dedicated `order_number_seq`
   * (migration OrderNumberSequence). No clock fallback: a timestamp-derived
   * number collides under load, and `orders.order_number` is unique.
   */
  private async generateOrderNumber(): Promise<string> {
    const result = await (this.orderRepo as any).query("SELECT nextval('order_number_seq') AS seq");
    const seq = result[0]?.seq;
    if (seq == null) throw new Error("order_number_seq returned no value");
    const year = new Date().getFullYear();
    return `MH-${year}-${String(seq).padStart(6, "0")}`;
  }

  private generateVendorOrderNumber(orderNumber: string, index: number): string {
    return `${orderNumber}-V${index + 1}`;
  }

  /**
   * The buyer's newest order that is still pending_payment, has no payment
   * row, was created in the last 15 minutes and has exactly the cart's lines
   * (product, variant, quantity, unit price) and grand total. Returned as the
   * result of a repeated checkout instead of creating a duplicate order.
   */
  private async findReusablePendingOrder(
    manager: EntityManager,
    data: {
      userId: string;
      cartItems: any[];
      discountTotal: number;
      shippingTotal: number;
      surchargeTotal?: number;
    },
  ): Promise<{ order: Order; vendorOrders: VendorOrder[] } | null> {
    const [candidate] = await manager.query(
      `SELECT o.id FROM orders o
        WHERE o.user_id = $1 AND o.status = 'pending_payment' AND o.deleted_at IS NULL
          AND o.created_at > now() - interval '15 minutes'
          AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id)
        ORDER BY o.created_at DESC LIMIT 1`,
      [data.userId],
    );
    if (!candidate) return null;

    const lines: Array<{
      product_id: string;
      variant_id: string | null;
      quantity: number;
      unit_price: number;
    }> = await manager.query(
      "SELECT product_id, variant_id, quantity, unit_price FROM order_items WHERE order_id = $1",
      [candidate.id],
    );
    const key = (l: {
      product_id: string;
      variant_id?: string | null;
      quantity: number;
      unit_price: number;
    }) => `${l.product_id}|${l.variant_id ?? ""}|${Number(l.quantity)}|${Number(l.unit_price)}`;
    const want = data.cartItems.map(key).sort();
    const have = lines.map(key).sort();
    if (want.length !== have.length || want.some((k, i) => k !== have[i])) return null;

    const order = (await manager.getRepository(this.orderRepo.target).findOne({
      where: { id: candidate.id } as any,
    })) as Order;
    const subtotal = data.cartItems.reduce((sum: number, item: any) => sum + item.line_total, 0);
    const grandTotal =
      subtotal - data.discountTotal + data.shippingTotal + (data.surchargeTotal ?? 0);
    if (Number((order as any).grand_total) !== grandTotal) return null;

    const vendorOrders = (await manager
      .getRepository(this.vendorOrderRepo.target)
      .find({ where: { order_id: candidate.id } as any })) as VendorOrder[];
    return { order, vendorOrders };
  }

  async createOrder(data: {
    userId: string;
    cartItems: any[];
    shippingAddress: Record<string, unknown>;
    billingAddress?: Record<string, unknown>;
    /** Business account the buyer ordered for (workstream 3). */
    businessAccountId?: string | null;
    /** Buyer TRN snapshotted from the business account. */
    buyerTrn?: string | null;
    taxTotal: number;
    shippingTotal: number;
    surchargeTotal?: number;
    discountTotal: number;
    couponId: string | null;
    couponCode: string | null;
    couponDiscount: number;
    channel: string;
    shippingMethod?: string;
    customerNotes?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{ order: Order; vendorOrders: VendorOrder[] }> {
    // Load the shipping-contribution tiers relevant to this order's vendors
    // once: the global default rows plus any per-vendor override rows. The pure
    // resolver picks the right band per vendor sub-order from this set.
    const orderVendorIds = [...new Set(data.cartItems.map((i: any) => i.vendor_id as string))];
    const contributionTiers: ContributionTierRow[] = this.shippingContributionTierRepo
      ? ((await this.shippingContributionTierRepo.find({
          where: [
            { vendor_id: IsNull(), is_active: true },
            { vendor_id: In(orderVendorIds), is_active: true },
          ],
        })) as unknown as ContributionTierRow[])
      : [];

    // Run everything inside a transaction for pessimistic locking and atomicity
    const result = await this.orderRepo.manager.transaction(async (manager: EntityManager) => {
      // Idempotency: a double submit or client retry must not create a second
      // order (and reserve stock twice). Serialize this buyer's checkouts, then
      // reuse an identical unpaid order placed in the last 15 minutes.
      await manager.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `checkout:${data.userId}`,
      ]);
      const reusable = await this.findReusablePendingOrder(manager, data);
      if (reusable) return reusable;
      const orderRepo = manager.getRepository(this.orderRepo.target);
      const vendorOrderRepo = manager.getRepository(this.vendorOrderRepo.target);
      const orderItemRepo = manager.getRepository(this.orderItemRepo.target);
      const statusHistoryRepo = manager.getRepository(this.statusHistoryRepo.target);

      // Calculate totals. Subtotal is the sum of line_totals which are already
      // VAT-inclusive (product prices include 5% UAE VAT). The `taxTotal`
      // passed in by the caller represents the embedded VAT — informational
      // for the order record but NOT added to the grand total again.
      const subtotal = data.cartItems.reduce((sum: number, item: any) => sum + item.line_total, 0);
      const surchargeTotal = data.surchargeTotal ?? 0;
      const grandTotal = subtotal - data.discountTotal + data.shippingTotal + surchargeTotal;

      const orderNumber = await this.generateOrderNumber();

      // Create master order
      const order = await orderRepo.save({
        order_number: orderNumber,
        user_id: data.userId,
        status: "pending_payment",
        payment_status: "pending",
        subtotal,
        discount_total: data.discountTotal,
        shipping_total: data.shippingTotal,
        surcharge_total: surchargeTotal,
        tax_total: data.taxTotal,
        grand_total: grandTotal,
        currency: "AED",
        coupon_id: data.couponId,
        coupon_code: data.couponCode,
        coupon_discount: data.couponDiscount,
        shipping_address: data.shippingAddress,
        billing_address: data.billingAddress || data.shippingAddress,
        business_account_id: data.businessAccountId ?? null,
        buyer_trn: data.buyerTrn ?? null,
        shipping_method: data.shippingMethod || "standard",
        channel: data.channel,
        customer_notes: data.customerNotes,
        ip_address: data.ipAddress,
        user_agent: data.userAgent,
      } as any);

      // Group items into one vendor-order bucket per vendor.
      const groups = groupItemsForVendorOrders(data.cartItems);

      // Create vendor sub-orders
      const vendorOrders: VendorOrder[] = [];
      let vendorIdx = 0;
      for (const group of groups) {
        const vendorId = group.vendorId;
        const items = group.items;
        const vendorSubtotal = items.reduce((s: number, i: any) => s + i.line_total, 0);
        const vendorOrderNumber = this.generateVendorOrderNumber(orderNumber, vendorIdx);

        // Processing deadline: 2 business days from now
        const deadline = new Date();
        deadline.setDate(deadline.getDate() + 2);

        // Stamp the vendor's default warehouse as the fulfillment origin so
        // downstream shipments inherit it. Nullable when the vendor has none.
        const defaultWarehouse = await manager.getRepository(Warehouse).findOne({
          where: { vendor_id: vendorId, is_default: true, is_active: true },
        });

        const shippingContribution = resolveShippingContribution(
          vendorSubtotal,
          contributionTiers,
          vendorId,
        );
        if (contributionTiers.length > 0 && shippingContribution === 0 && vendorSubtotal > 0) {
          console.warn("[order-creation] no matching shipping contribution tier", {
            vendorId,
            vendorSubtotal,
          });
        }

        const vendorOrder = await vendorOrderRepo.save({
          order_id: order.id,
          vendor_id: vendorId,
          vendor_order_number: vendorOrderNumber,
          status: "confirmed",
          subtotal: vendorSubtotal,
          shipping_cost: 0, // TODO: per-vendor shipping
          shipping_contribution: shippingContribution,
          tax_total: 0, // TODO: per-vendor tax
          vendor_total: vendorSubtotal,
          currency: "AED",
          warehouse_id: defaultWarehouse?.id ?? null,
          processing_deadline: deadline,
        } as any);

        // Create order items with product snapshots
        const orderItems = items.map((item: any) => {
          const originalPrice = item.original_unit_price ?? item.unit_price;
          const discountAmount = (originalPrice - item.unit_price) * item.quantity;
          return {
            order_id: order.id,
            vendor_order_id: vendorOrder.id,
            vendor_id: vendorId,
            product_id: item.product_id,
            variant_id: item.variant_id,
            product_name: item.product?.name || "Unknown",
            variant_name: item.variant?.name || null,
            product_sku: item.variant?.sku || item.product?.sku || null,
            external_id: item.variant?.external_id ?? item.product?.external_id ?? null,
            product_image_url: item.product?.images?.[0]?.url || null,
            product_snapshot: {
              name: item.product?.name,
              price: item.unit_price,
              original_price: originalPrice,
              attributes: item.variant?.option_values,
            },
            quantity: item.quantity,
            unit_price: item.unit_price,
            discount_amount: discountAmount,
            tax_amount: 0,
            tax_rate: 5,
            line_total: item.line_total,
            status: "confirmed",
          };
        });

        const savedItems = await orderItemRepo.save(orderItems as any);

        // Snapshot commission per order_item — vendor's rate (with category +
        // global default fallbacks) is captured at order time per the
        // multi-vendor order spec. The row is saved in the same transaction
        // so payment failure / rollback also rolls back the commissions.
        if (this.commissionService) {
          const vendorRow = await manager
            .getRepository(Vendor)
            .findOne({ where: { id: vendorId } });
          if (vendorRow) {
            // Cache product → category lookups so a vendor with multiple lines
            // for the same product doesn't requery.
            const categoryByProductId = new Map<string, any>();
            for (let i = 0; i < items.length; i++) {
              const item = items[i];
              const savedItem = (savedItems as any[])[i];
              if (!savedItem?.id) continue;

              let category: any = categoryByProductId.get(item.product_id);
              if (category === undefined) {
                const product = await manager.getRepository(Product).findOne({
                  where: { id: item.product_id },
                  relations: ["category"],
                });
                category = product?.category ?? null;
                categoryByProductId.set(item.product_id, category);
              }

              await this.commissionService.createForOrderItemInTx(manager, {
                vendorId,
                orderId: order.id,
                vendorOrderId: vendorOrder.id,
                orderItemId: savedItem.id,
                itemTotal: item.line_total,
                vendor: vendorRow,
                category,
              });
            }
          }
        }

        // Create inventory reservations with SELECT FOR UPDATE locking
        if (this.inventoryRepo && this.reservationRepo) {
          const inventoryRepo = manager.getRepository(this.inventoryRepo.target);
          const reservationRepo = manager.getRepository(this.reservationRepo.target);

          for (const item of items) {
            const inventoryWhere: any = {
              product_id: item.product_id,
              vendor_id: vendorId,
            };
            // A line without a variant reserves the product-level row. Without
            // IsNull() this matched any row of the product, e.g. its sample
            // SKU, and checked (and reserved) the sample's stock instead.
            inventoryWhere.variant_id = item.variant_id ?? IsNull();

            // Pessimistic lock on inventory row
            const inventory = await inventoryRepo
              .createQueryBuilder("inv")
              .setLock("pessimistic_write")
              .where(inventoryWhere)
              .getOne();

            if (inventory) {
              // Verify stock is still available
              const available = inventory.quantity_on_hand - inventory.quantity_reserved;
              if (available < item.quantity) {
                throw new Error(`Insufficient stock for product ${item.product_id}`);
              }

              // Reserve inventory
              inventory.quantity_reserved += item.quantity;
              await inventoryRepo.save(inventory);

              // Create reservation record (15min expiry)
              const expiresAt = new Date();
              expiresAt.setMinutes(expiresAt.getMinutes() + 15);
              await reservationRepo.save({
                inventory_id: inventory.id,
                order_id: order.id,
                quantity: item.quantity,
                status: "active",
                reserved_at: new Date(),
                expires_at: expiresAt,
              } as any);

              // Record inventory movement (if movementRepo provided)
              if (this.movementRepo) {
                const movementRepo = manager.getRepository(this.movementRepo.target);
                await movementRepo.save({
                  inventory_id: inventory.id,
                  product_id: item.product_id,
                  variant_id: item.variant_id,
                  quantity: -item.quantity,
                  quantity_before: inventory.quantity_on_hand,
                  quantity_after: inventory.quantity_on_hand,
                  movement_type: "reserved",
                  reference_type: "order",
                  reference_id: order.id,
                } as any);
              }
            }
          }
        }

        vendorOrders.push(vendorOrder);
        vendorIdx++;
      }

      // Record status history
      await statusHistoryRepo.save({
        order_id: order.id,
        from_status: null,
        to_status: "pending_payment",
        comment: "Order created",
        is_customer_visible: true,
      } as any);

      return { order, vendorOrders };
    });

    // After the transaction commits, emit a vendor_order.created integration
    // event per vendor sub-order. Gated by the
    // vendor_integrations_outbound_enabled site setting; emit failures are
    // swallowed so they never block the order flow (consistent with other
    // post-commit publishes in this service).
    if (this.integrationEventsQueue && this.siteSettingRepo) {
      for (const vendorOrder of result.vendorOrders) {
        try {
          await emitIfEnabled(this.integrationEventsQueue, this.siteSettingRepo, {
            event_type: IntegrationEventType.vendor_order_created,
            vendor_id: (vendorOrder as any).vendor_id,
            payload: { vendor_order: vendorOrder, order: result.order },
            source_ref: { vendor_order_id: vendorOrder.id, order_id: result.order.id },
            schema_version: 1,
          });
        } catch (err) {
          console.error("[order->integration] vendor_order.created emit failed", {
            vendor_order_id: (vendorOrder as any)?.id,
            error: String(err),
          });
        }
      }
    }

    return result;
  }
}
