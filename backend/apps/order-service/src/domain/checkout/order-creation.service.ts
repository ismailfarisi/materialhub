import {
  Commission,
  CommissionStatus,
  GiftFulfillmentStatus,
  GiftOrder,
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
  VendorOrder,
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
import type { ExpandedGiftBox } from "./checkout.service.ts";
import type { FlashDealApplicator } from "./flash-deal-applicator.service.ts";

/** Group cart items into vendor-order buckets. Gift components (carrying
 * __giftBoxRef) get their own bucket per (vendor_id, giftBoxRef) so a gift
 * vendor_order is all-one-box (ships to hub) and never mixes with a vendor's
 * normal items (which ship to the customer). */
export function groupItemsForVendorOrders(cartItems: any[]): {
  key: string;
  vendorId: string;
  giftBoxRef: string | null;
  items: any[];
}[] {
  const buckets = new Map<
    string,
    { key: string; vendorId: string; giftBoxRef: string | null; items: any[] }
  >();
  for (const item of cartItems) {
    const ref: string | null = item.__giftBoxRef ?? null;
    const key = ref ? `${item.vendor_id}::gift::${ref}` : `${item.vendor_id}`;
    let b = buckets.get(key);
    if (!b) {
      b = { key, vendorId: item.vendor_id, giftBoxRef: ref, items: [] };
      buckets.set(key, b);
    }
    b.items.push(item);
  }
  return [...buckets.values()];
}

export function buildOrderAttribution(
  affiliateCode: string | null | undefined,
): Record<string, unknown> | null {
  if (!affiliateCode) return null;
  return { affiliate_code: affiliateCode };
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
    private flashDealApplicator?: FlashDealApplicator,
    private commissionService?: CommissionService,
    private shippingContributionTierRepo?: Repository<ShippingContributionTier>,
  ) {}

  private async generateOrderNumber(): Promise<string> {
    // Use database sequence for unique, restart-safe order numbers
    const result = await (this.orderRepo as any)
      .query("SELECT nextval(pg_get_serial_sequence('orders', 'id')) AS seq")
      .catch(() => [{ seq: Date.now() % 1000000 }]);
    const seq = result[0]?.seq ?? Date.now() % 1000000;
    const year = new Date().getFullYear();
    return `FKS-${year}-${String(seq).padStart(6, "0")}`;
  }

  private generateVendorOrderNumber(orderNumber: string, index: number): string {
    return `${orderNumber}-V${index + 1}`;
  }

  async createOrder(data: {
    userId: string;
    cartItems: any[];
    shippingAddress: Record<string, unknown>;
    billingAddress?: Record<string, unknown>;
    taxTotal: number;
    shippingTotal: number;
    surchargeTotal?: number;
    discountTotal: number;
    couponId: string | null;
    couponCode: string | null;
    couponDiscount: number;
    giftOrders?: ExpandedGiftBox[];
    channel: string;
    affiliateCode?: string | null;
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
      const orderRepo = manager.getRepository(this.orderRepo.target);
      const vendorOrderRepo = manager.getRepository(this.vendorOrderRepo.target);
      const orderItemRepo = manager.getRepository(this.orderItemRepo.target);
      const statusHistoryRepo = manager.getRepository(this.statusHistoryRepo.target);

      // Sum quantities by flash_deal_id across the cart.
      // Multiple cart items can share the same deal id (e.g. product-wide
      // deal applied to several variants of the same product).
      const dealQtyByDealId = new Map<string, number>();
      for (const item of data.cartItems) {
        const dealId = item.flash_deal_id;
        if (!dealId) continue;
        dealQtyByDealId.set(dealId, (dealQtyByDealId.get(dealId) ?? 0) + item.quantity);
      }

      // Enforce caps via FlashDealApplicator (SELECT FOR UPDATE per deal row).
      // Throws DealSoldOutError → transaction rolls back, controller returns 409.
      if (this.flashDealApplicator && dealQtyByDealId.size > 0) {
        for (const [dealId, qty] of dealQtyByDealId) {
          await this.flashDealApplicator.validateAndIncrement(manager, dealId, qty);
        }
      }

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
        shipping_method: data.shippingMethod || "standard",
        channel: data.channel,
        attribution: buildOrderAttribution(data.affiliateCode),
        customer_notes: data.customerNotes,
        ip_address: data.ipAddress,
        user_agent: data.userAgent,
      } as any);

      // Group items into vendor-order buckets. Gift components split into their
      // own bucket per (vendor, box) so a gift vendor_order is all-one-box
      // (ships to hub) and never mixes with a vendor's normal items.
      const groups = groupItemsForVendorOrders(data.cartItems);

      // Create vendor sub-orders
      const vendorOrders: VendorOrder[] = [];
      // Track saved order_items that originated from a gift box component so we
      // can stamp their gift_order_id after the gift_orders rows are inserted.
      const giftItemLinks: { savedItem: any; ref: string }[] = [];
      // Track gift vendor_orders so we can stamp gift_order_id on them after the
      // gift_orders rows are inserted (a gift bucket is all-one-box).
      const giftVendorOrderLinks: { vendorOrderId: string; ref: string }[] = [];
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

        if (group.giftBoxRef) {
          giftVendorOrderLinks.push({ vendorOrderId: vendorOrder.id, ref: group.giftBoxRef });
        }

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
              flash_deal_id: item.flash_deal_id ?? null,
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

        // Record gift-box-sourced order_items (savedItems preserves the order of
        // `items`). The transient __giftBoxRef lives on the source cart item, not
        // on the persisted order_item row.
        for (let i = 0; i < items.length; i++) {
          const ref = items[i]?.__giftBoxRef;
          const savedItem = (savedItems as any[])[i];
          if (ref && savedItem) {
            giftItemLinks.push({ savedItem, ref });
          }
        }

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

            // Gift commissions are held until the hub confirms receipt (Task 7
            // releases them to pending). A gift bucket is all-one-box, so every
            // commission on this vendor_order is a gift-item commission.
            if (group.giftBoxRef) {
              await manager
                .getRepository(Commission)
                .update({ vendor_order_id: vendorOrder.id }, { status: CommissionStatus.held });
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
            if (item.variant_id) inventoryWhere.variant_id = item.variant_id;

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

      // Persist gift_orders (one per gift box) and link each gift-component
      // order_item to its gift_order via gift_order_id. Done inside the
      // transaction so a failure rolls back the order, items and gift records
      // together.
      if (data.giftOrders && data.giftOrders.length > 0) {
        const giftOrderRepo = manager.getRepository(GiftOrder);
        const giftOrderIdByRef = new Map<string, string>();

        // Resolve the default platform hub (vendor-less, default, active) once.
        // Gift boxes ship to this hub for assembly. Null is tolerated — a later
        // task ensures a hub exists; the gift_order keeps a null hub for now.
        const hub = await manager.getRepository(Warehouse).findOne({
          where: { vendor_id: IsNull(), is_default: true, is_active: true },
        });

        for (const gb of data.giftOrders) {
          const savedGiftOrder = await giftOrderRepo.save({
            order_id: order.id,
            gift_box_id: gb.gift_box_id,
            box_name_snapshot: gb.box_name_snapshot,
            box_style_snapshot: gb.style_snapshot,
            occasion_snapshot: gb.occasion_snapshot,
            packaging_price_snapshot: gb.packaging_price,
            gift_message: gb.gift_message,
            recipient_name: gb.recipient_name,
            hub_warehouse_id: hub?.id ?? null,
            fulfillment_status: GiftFulfillmentStatus.awaiting_items,
          } as any);
          giftOrderIdByRef.set(gb.ref, (savedGiftOrder as any).id);
        }

        const orderItemRepoTx = manager.getRepository(this.orderItemRepo.target);
        for (const link of giftItemLinks) {
          const giftOrderId = giftOrderIdByRef.get(link.ref);
          if (!giftOrderId || !link.savedItem?.id) continue;
          await orderItemRepoTx.update(link.savedItem.id, {
            gift_order_id: giftOrderId,
          } as any);
        }

        // Stamp the gift_order_id onto each gift vendor_order (one bucket per
        // (vendor, box)) so the hub can route received items to their box.
        for (const link of giftVendorOrderLinks) {
          const giftOrderId = giftOrderIdByRef.get(link.ref);
          if (giftOrderId) {
            await manager
              .getRepository(VendorOrder)
              .update(link.vendorOrderId, { gift_order_id: giftOrderId });
          }
        }
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
