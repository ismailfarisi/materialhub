import type { Shipment } from "@materialhub/database";
import type { Warehouse } from "@materialhub/database";
import type { WarehouseVendorPermission } from "@materialhub/database";
import type { ShipmentItem } from "@materialhub/database";
import type { ShipmentEvent } from "@materialhub/database";
import type { SiteSetting } from "@materialhub/database";
import type { VendorOrder } from "@materialhub/database";
import type { OrderItem } from "@materialhub/database";
import type { ShipmentStatusHistory } from "@materialhub/database";
import { OrderStatus, ShipmentStatus } from "@materialhub/database/src/enums/order.enums.ts";
import { HttpError } from "@materialhub/plugins";
import type { Queue } from "bullmq";
import type { Repository } from "typeorm";
import { IntegrationEventType, emitIfEnabled } from "../integration/emit.ts";
import type { OrderStatusService } from "../order/order-status.service.ts";

// Same key and default as the admin route that writes it
// (routes/shipping-contribution-admin.routes.ts).
const BASE_CARRIER_COST_SETTING_KEY = "shipping.base_carrier_cost_fils";
const BASE_CARRIER_COST_DEFAULT_FILS = 1300;

// `confirmed` included: creating a shipment for an order the vendor has not
// explicitly accepted yet accepts it (confirmed -> processing) on the way.
const SHIPPABLE_STATUSES = new Set([
  OrderStatus.confirmed,
  OrderStatus.processing,
  OrderStatus.ready_to_ship,
  OrderStatus.shipped,
]);

const STATUS_ORDER: Record<string, number> = {
  [ShipmentStatus.pending]: 0,
  [ShipmentStatus.picked_up]: 1,
  [ShipmentStatus.in_transit]: 2,
  [ShipmentStatus.out_for_delivery]: 3,
  [ShipmentStatus.delivered]: 4,
  [ShipmentStatus.cancelled]: -1,
  [ShipmentStatus.failed_delivery]: -1,
  [ShipmentStatus.returned]: -1,
};

type Role = "vendor" | "admin" | "system";

/**
 * `userId` is the acting USER (history `changed_by`, nullable for jobs and
 * integrations). A vendor-role actor carries the vendor it acts for in
 * `vendorId`; ownership is checked against that, never against `userId`.
 */
interface Actor {
  userId: string | null;
  role: Role;
  vendorId?: string | null;
}

/** Vendor a vendor-role actor acts for (legacy callers put it in userId). */
function actorVendorId(actor: Actor): string | null {
  return actor.vendorId ?? actor.userId ?? null;
}

/** User id safe to write into a `changed_by` uuid column. */
function historyUserId(actor: Actor): string | null {
  if (actor.role === "vendor" && !actor.vendorId) return null;
  return actor.userId && UUID_RE.test(actor.userId) ? actor.userId : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VENDOR_ALLOWED_STATUSES = new Set([
  ShipmentStatus.picked_up,
  ShipmentStatus.in_transit,
  ShipmentStatus.out_for_delivery,
  ShipmentStatus.delivered,
  ShipmentStatus.failed_delivery,
]);

const ADMIN_ALLOWED_STATUSES = new Set([
  ...VENDOR_ALLOWED_STATUSES,
  ShipmentStatus.cancelled,
  ShipmentStatus.returned,
]);

const CUSTOMER_VISIBLE_STATUSES = new Set([
  ShipmentStatus.out_for_delivery,
  ShipmentStatus.delivered,
  ShipmentStatus.cancelled,
  ShipmentStatus.failed_delivery,
  ShipmentStatus.returned,
]);

const WAREHOUSE_FULFILLMENT_PERMISSION = "fulfillment_origin";
const CARRIER_POSSESSION_STATUSES = new Set([
  ShipmentStatus.picked_up,
  ShipmentStatus.in_transit,
  ShipmentStatus.out_for_delivery,
  ShipmentStatus.delivered,
]);

interface CreateShipmentData {
  tracking_number?: string;
  carrier?: string;
  carrier_service?: string;
  tracking_url?: string;
  label_url?: string | null;
  pickup_code?: string | null;
  weight_grams?: number;
  estimated_delivery_at?: string;
  external_shipment_id?: string | null;
  warehouse_id?: string | null;
  auto_booked?: boolean;
  /**
   * Lines to put in this shipment. Omitted or empty means "everything of this
   * vendor order not yet shipped" — the vendor dashboard's Create Shipment
   * form ships the whole sub-order; split shipments pass explicit lines.
   */
  items?: { order_item_id: string; quantity: number }[];
}

interface WebhookEventData {
  tracking_number: string;
  status: ShipmentStatus;
  occurred_at: string;
  location?: string;
  description?: string;
  raw_payload?: Record<string, unknown>;
  provider_id?: string;
  external_event_id?: string;
}

export class ShipmentTrackingService {
  constructor(
    private shipmentRepo: Repository<Shipment>,
    private shipmentItemRepo: Repository<ShipmentItem>,
    private shipmentEventRepo: Repository<ShipmentEvent>,
    private vendorOrderRepo: Repository<VendorOrder>,
    private orderItemRepo: Repository<OrderItem>,
    private orderStatusService: OrderStatusService,
    private shipmentStatusHistoryRepo: Repository<ShipmentStatusHistory>,
    private integrationEventsQueue?: Queue,
    private siteSettingRepo?: Repository<SiteSetting>,
    private warehouseRepo?: Repository<Warehouse>,
    private warehousePermissionRepo?: Repository<WarehouseVendorPermission>,
  ) {}

  private async vendorCanUseWarehouse(warehouseId: string, vendorId: string): Promise<boolean> {
    if (!this.warehouseRepo) return true;
    const wh = await this.warehouseRepo.findOne({
      where: { id: warehouseId, is_active: true } as any,
    });
    if (!wh) return false;
    if ((wh as any).vendor_id === vendorId) return true;
    if (!this.warehousePermissionRepo) return false;
    const grant = await this.warehousePermissionRepo.findOne({
      where: {
        warehouse_id: warehouseId,
        vendor_id: vendorId,
        permission: WAREHOUSE_FULFILLMENT_PERMISSION,
        is_active: true,
      } as any,
    });
    return Boolean(grant);
  }

  /**
   * Resolve the fulfillment-origin warehouse for a shipment. Precedence:
   * caller-supplied → the vendor sub-order's stamped warehouse → the vendor's
   * default warehouse. Returns null if none can be determined.
   */
  private async resolveWarehouseId(
    explicit: string | null | undefined,
    vendorOrder: VendorOrder,
    vendorId: string,
  ): Promise<string | null> {
    if (explicit) {
      if (!(await this.vendorCanUseWarehouse(explicit, vendorId))) {
        throw new HttpError(
          422,
          "Warehouse not available for this vendor",
          "WAREHOUSE_NOT_AVAILABLE",
        );
      }
      return explicit;
    }
    const fromOrder = (vendorOrder as any).warehouse_id;
    if (fromOrder) {
      if (!(await this.vendorCanUseWarehouse(fromOrder, vendorId))) {
        throw new HttpError(
          422,
          "Warehouse not available for this vendor",
          "WAREHOUSE_NOT_AVAILABLE",
        );
      }
      return fromOrder;
    }
    if (!this.warehouseRepo) return null;
    const wh = await this.warehouseRepo.findOne({
      where: { vendor_id: vendorId, is_default: true } as any,
    });
    return wh ? (wh as any).id : null;
  }

  /**
   * The platform's reference cost for one shipment, in fils.
   *
   * Read per call rather than cached so a rate change takes effect on the next
   * shipment. Every failure mode falls back to the default instead of throwing:
   * a shipment must never fail to be created because a *reporting* rate is
   * missing or misconfigured. `siteSettingRepo` is an optional constructor
   * parameter and is genuinely undefined in some wirings.
   */
  private async resolveBaseCarrierCostFils(): Promise<number> {
    if (!this.siteSettingRepo) return BASE_CARRIER_COST_DEFAULT_FILS;
    try {
      const row = await this.siteSettingRepo.findOne({
        where: { key: BASE_CARRIER_COST_SETTING_KEY } as any,
      });
      const parsed = Number((row as any)?.value);
      return Number.isInteger(parsed) && parsed >= 0 ? parsed : BASE_CARRIER_COST_DEFAULT_FILS;
    } catch {
      return BASE_CARRIER_COST_DEFAULT_FILS;
    }
  }

  async createShipment(
    vendorOrderId: string,
    vendorId: string,
    data: CreateShipmentData,
    actorUserId: string | null = null,
  ): Promise<Shipment> {
    // 1. Find vendor_order with items, verify ownership and shippable status
    const vendorOrder = await this.vendorOrderRepo.findOne({
      where: { id: vendorOrderId } as any,
      relations: ["items"],
    });

    if (!vendorOrder || (vendorOrder as any).vendor_id !== vendorId) {
      throw new HttpError(404, "Vendor order not found", "VENDOR_ORDER_NOT_FOUND");
    }

    if (!SHIPPABLE_STATUSES.has(vendorOrder.status)) {
      throw new HttpError(
        409,
        "Vendor order is not in a shippable status",
        "VENDOR_ORDER_NOT_SHIPPABLE",
      );
    }

    // 2. Query existing shipment items via QueryBuilder
    const existingShipmentItems = await this.shipmentItemRepo
      .createQueryBuilder("si")
      .innerJoin("si.shipment", "s")
      .where("s.vendor_order_id = :vendorOrderId", { vendorOrderId })
      .getMany();

    // 3. Validate total shipped qty per order_item doesn't exceed ordered qty
    const shippedByItem = new Map<string, number>();
    for (const si of existingShipmentItems) {
      const current = shippedByItem.get(si.order_item_id) || 0;
      shippedByItem.set(si.order_item_id, current + si.quantity);
    }

    const orderItemMap = new Map<string, number>();
    for (const item of (vendorOrder as any).items) {
      orderItemMap.set(item.id, item.quantity);
    }

    // Default: every unshipped unit of every (non-cancelled) line.
    const requestedItems =
      data.items && data.items.length > 0
        ? data.items
        : ((vendorOrder as any).items as any[])
            .filter((item) => item.status !== OrderStatus.cancelled)
            .map((item) => ({
              order_item_id: item.id as string,
              quantity: Number(item.quantity) - (shippedByItem.get(item.id) || 0),
            }))
            .filter((item) => item.quantity > 0);
    if (requestedItems.length === 0) {
      throw new HttpError(409, "Nothing left to ship on this vendor order", "NOTHING_TO_SHIP");
    }

    for (const reqItem of requestedItems) {
      if (!orderItemMap.has(reqItem.order_item_id)) {
        throw new HttpError(
          400,
          "Order item does not belong to this vendor order",
          "ORDER_ITEM_NOT_IN_VENDOR_ORDER",
        );
      }
      const alreadyShipped = shippedByItem.get(reqItem.order_item_id) || 0;
      const orderedQty = orderItemMap.get(reqItem.order_item_id) || 0;
      if (alreadyShipped + reqItem.quantity > orderedQty) {
        throw new HttpError(
          400,
          "Shipped quantity exceeds ordered quantity",
          "SHIPPED_QUANTITY_EXCEEDS_ORDERED",
        );
      }
    }

    // 4. Create Shipment record
    const warehouseId = await this.resolveWarehouseId(data.warehouse_id, vendorOrder, vendorId);
    const isAutoBooked = data.auto_booked === true;
    const carrierCostFils = await this.resolveBaseCarrierCostFils();
    const shipment = this.shipmentRepo.create({
      vendor_order_id: vendorOrderId,
      vendor_id: vendorId,
      order_id: (vendorOrder as any).order_id,
      warehouse_id: warehouseId,
      tracking_number: data.tracking_number || null,
      external_shipment_id: data.external_shipment_id ?? null,
      carrier: data.carrier || null,
      carrier_service: data.carrier_service || null,
      tracking_url: data.tracking_url || null,
      label_url: data.label_url || null,
      pickup_code: data.pickup_code || null,
      weight_grams: data.weight_grams || null,
      estimated_delivery_at: data.estimated_delivery_at
        ? new Date(data.estimated_delivery_at)
        : null,
      shipped_at: isAutoBooked ? null : new Date(),
      status: ShipmentStatus.pending,
      carrier_cost_fils: carrierCostFils,
    } as any);

    const savedShipment = (await this.shipmentRepo.save(shipment)) as unknown as Shipment;

    // 5. Create ShipmentItem records
    const shipmentItems = requestedItems.map((item) =>
      this.shipmentItemRepo.create({
        shipment_id: (savedShipment as any).id,
        order_item_id: item.order_item_id,
        quantity: item.quantity,
      } as any),
    );
    await this.shipmentItemRepo.save(shipmentItems as any);

    // 6. Sequential transitions based on current status
    const actor = { userId: actorUserId, vendorId, role: "vendor" as const };
    const reason = "Shipment created";

    if (!isAutoBooked) {
      if (vendorOrder.status === OrderStatus.confirmed) {
        for (const next of [
          OrderStatus.processing,
          OrderStatus.ready_to_ship,
          OrderStatus.shipped,
        ]) {
          await this.orderStatusService.transitionVendorOrder(vendorOrderId, next, actor, reason);
        }
      } else if (vendorOrder.status === OrderStatus.processing) {
        await this.orderStatusService.transitionVendorOrder(
          vendorOrderId,
          OrderStatus.ready_to_ship,
          actor,
          reason,
        );
        await this.orderStatusService.transitionVendorOrder(
          vendorOrderId,
          OrderStatus.shipped,
          actor,
          reason,
        );
      } else if (vendorOrder.status === OrderStatus.ready_to_ship) {
        await this.orderStatusService.transitionVendorOrder(
          vendorOrderId,
          OrderStatus.shipped,
          actor,
          reason,
        );
      }
    }
    // If already shipped (split shipment), no transition needed

    // Emit shipment.created integration event after persistence and any
    // induced vendor_order transitions, gated by the
    // vendor_integrations_outbound_enabled site setting. Errors are swallowed
    // so a failed enqueue never blocks the shipment flow.
    if (this.integrationEventsQueue && this.siteSettingRepo) {
      try {
        await emitIfEnabled(this.integrationEventsQueue, this.siteSettingRepo, {
          event_type: IntegrationEventType.shipment_created,
          vendor_id: vendorId,
          payload: { shipment: savedShipment, vendor_order: vendorOrder },
          source_ref: {
            shipment_id: (savedShipment as any).id,
            vendor_order_id: vendorOrderId,
          },
          schema_version: 1,
        });
      } catch (err) {
        console.error("[order->integration] shipment.created emit failed", {
          shipment_id: (savedShipment as any)?.id,
          error: String(err),
        });
      }
    }

    return savedShipment;
  }

  async processWebhookEvent(data: WebhookEventData): Promise<void> {
    // 1. Find shipment by tracking_number, return silently if not found
    const shipment = await this.shipmentRepo.findOne({
      where: { tracking_number: data.tracking_number } as any,
      relations: ["items"],
    });

    if (!shipment) return;

    const externalInsertResult =
      data.external_event_id && data.provider_id
        ? await this.insertShipmentEvent(shipment, data, true)
        : null;
    if (externalInsertResult?.rowCount === 0) return;

    // 2. Forward-only status check
    const currentOrder = STATUS_ORDER[shipment.status] ?? 0;
    const newOrder = STATUS_ORDER[data.status] ?? 0;
    const isExternalCarrierEvent = Boolean(data.external_event_id && data.provider_id);

    // Reject if delivered (terminal positive state)
    if (currentOrder === 4) {
      if (isExternalCarrierEvent) return;
      throw new HttpError(
        409,
        "Invalid status progression: shipment already delivered",
        "INVALID_SHIPMENT_TRANSITION",
      );
    }

    // For non-terminal branches (failed_delivery, returned), only allow from non-delivered
    if (newOrder === -1 && currentOrder === 4) {
      if (isExternalCarrierEvent) return;
      throw new HttpError(
        409,
        "Invalid status progression: shipment already delivered",
        "INVALID_SHIPMENT_TRANSITION",
      );
    }

    // Reject backward progression for forward statuses
    if (newOrder >= 0 && currentOrder >= 0 && newOrder <= currentOrder) {
      if (isExternalCarrierEvent) return;
      throw new HttpError(409, "Invalid status progression", "INVALID_SHIPMENT_TRANSITION");
    }

    // 3. Idempotent insert via raw query with ON CONFLICT
    const insertResult = externalInsertResult ?? (await this.insertShipmentEvent(shipment, data));

    // If duplicate (rowCount 0), return early
    if (insertResult.rowCount === 0) return;

    // 4. Update shipment status
    const fromStatus = shipment.status;
    shipment.status = data.status;
    this.markShippedAtCarrierPossession(shipment, data.status);

    if (data.status === ShipmentStatus.delivered) {
      (shipment as any).delivered_at = new Date();
      // Mark items as delivered
      for (const item of shipment.items || []) {
        (item as any).is_delivered = true;
        (item as any).delivered_at = new Date();
      }
      if (shipment.items?.length) {
        // These are ShipmentItem rows (Shipment.items is @OneToMany(ShipmentItem)),
        // and is_delivered/delivered_at are ShipmentItem columns. Saving them via
        // orderItemRepo makes TypeORM insert into order_items with a null order_id.
        await this.shipmentItemRepo.save(shipment.items as any);
      }
    }

    await this.shipmentRepo.save(shipment);

    // Write audit history for webhook events
    const historyEntry = this.shipmentStatusHistoryRepo.create({
      shipment_id: (shipment as any).id,
      vendor_order_id: (shipment as any).vendor_order_id,
      from_status: fromStatus,
      to_status: data.status,
      changed_by: null,
      changed_by_role: "system",
      is_customer_visible: CUSTOMER_VISIBLE_STATUSES.has(data.status),
      reason: data.description || "Carrier webhook update",
      metadata: data.raw_payload || null,
    } as any);
    await this.shipmentStatusHistoryRepo.save(historyEntry);

    // 5. Trigger vendor_order transitions (catch errors silently)
    const systemActor = { userId: null, role: "system" as const };

    try {
      if (data.status === ShipmentStatus.picked_up || data.status === ShipmentStatus.in_transit) {
        await this.orderStatusService.transitionVendorOrder(
          (shipment as any).vendor_order_id,
          OrderStatus.shipped,
          systemActor,
          "Shipment picked up by carrier",
          undefined,
        );
      } else if (data.status === ShipmentStatus.out_for_delivery) {
        await this.orderStatusService.transitionVendorOrder(
          (shipment as any).vendor_order_id,
          OrderStatus.out_for_delivery,
          systemActor,
          "Shipment out for delivery",
          undefined,
        );
      } else if (data.status === ShipmentStatus.delivered) {
        await this.orderStatusService.transitionVendorOrder(
          (shipment as any).vendor_order_id,
          OrderStatus.delivered,
          systemActor,
          "Shipment delivered",
          undefined,
        );
      }
    } catch {
      // Silently catch transition errors
    }

    // Emit shipment.status_changed integration event for webhook-driven
    // status changes. Same gating + swallowing semantics as the
    // transitionShipmentStatus path.
    if (this.integrationEventsQueue && this.siteSettingRepo) {
      try {
        await emitIfEnabled(this.integrationEventsQueue, this.siteSettingRepo, {
          event_type: IntegrationEventType.shipment_status_changed,
          vendor_id: (shipment as any).vendor_id,
          payload: { shipment, transition: { from: fromStatus, to: data.status } },
          source_ref: {
            shipment_id: (shipment as any).id,
            vendor_order_id: (shipment as any).vendor_order_id,
          },
          schema_version: 1,
        });
      } catch (err) {
        console.error("[order->integration] shipment.status_changed emit failed (webhook)", {
          shipment_id: (shipment as any)?.id,
          error: String(err),
        });
      }
    }
  }

  async getTrackingForOrder(
    orderId: string,
    userId: string,
  ): Promise<Record<string, { shipments: any[] }>> {
    // 1. Find shipments with buyer ownership check
    const _shipments = await this.shipmentRepo.findOne({
      where: { order: { id: orderId, user_id: userId } } as any,
    });

    const allShipments = await this.shipmentRepo.find({
      where: { order: { id: orderId, user_id: userId } } as any,
      relations: ["items", "events"],
    } as any);

    // 2. Group by vendor_order_id, sort events by occurred_at
    const grouped: Record<string, { shipments: any[] }> = {};

    for (const shipment of allShipments || []) {
      const voId = (shipment as any).vendor_order_id;
      if (!grouped[voId]) {
        grouped[voId] = { shipments: [] };
      }

      const events = ((shipment as any).events || []).sort(
        (a: any, b: any) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime(),
      );

      grouped[voId].shipments.push({
        id: (shipment as any).id,
        tracking_number: (shipment as any).tracking_number,
        carrier: (shipment as any).carrier,
        status: shipment.status,
        shipped_at: (shipment as any).shipped_at,
        delivered_at: (shipment as any).delivered_at,
        estimated_delivery_at: (shipment as any).estimated_delivery_at,
        items: shipment.items,
        events,
      });
    }

    return grouped;
  }

  async transitionShipmentStatus(
    shipmentId: string,
    actor: Actor,
    toStatus: ShipmentStatus,
    reason: string,
    metadata?: Record<string, unknown>,
  ): Promise<Shipment> {
    const shipment = await this.shipmentRepo.findOne({
      where: { id: shipmentId } as any,
      relations: ["items"],
    });

    if (
      !shipment ||
      (actor.role === "vendor" && (shipment as any).vendor_id !== actorVendorId(actor))
    ) {
      throw new HttpError(404, "Shipment not found", "SHIPMENT_NOT_FOUND");
    }

    const fromStatus = shipment.status;

    // Forward-only validation
    const currentOrder = STATUS_ORDER[fromStatus] ?? 0;
    const newOrder = STATUS_ORDER[toStatus] ?? 0;

    if (currentOrder === 4) {
      throw new HttpError(
        409,
        "Invalid status progression: shipment already delivered",
        "INVALID_SHIPMENT_TRANSITION",
      );
    }

    if (newOrder >= 0 && currentOrder >= 0 && newOrder <= currentOrder) {
      throw new HttpError(409, "Invalid status progression", "INVALID_SHIPMENT_TRANSITION");
    }

    // Role-based permission check
    const allowed = actor.role === "admin" ? ADMIN_ALLOWED_STATUSES : VENDOR_ALLOWED_STATUSES;
    if (!allowed.has(toStatus)) {
      throw new HttpError(
        403,
        `Role ${actor.role} cannot transition to ${toStatus}`,
        "SHIPMENT_TRANSITION_FORBIDDEN",
      );
    }

    // Update shipment status
    shipment.status = toStatus;
    this.markShippedAtCarrierPossession(shipment, toStatus);

    if (toStatus === ShipmentStatus.delivered) {
      (shipment as any).delivered_at = new Date();
      for (const item of shipment.items || []) {
        (item as any).is_delivered = true;
        (item as any).delivered_at = new Date();
      }
      if (shipment.items?.length) {
        // These are ShipmentItem rows (Shipment.items is @OneToMany(ShipmentItem)),
        // and is_delivered/delivered_at are ShipmentItem columns. Saving them via
        // orderItemRepo makes TypeORM insert into order_items with a null order_id.
        await this.shipmentItemRepo.save(shipment.items as any);
      }
    }

    await this.shipmentRepo.save(shipment);

    // Write audit history
    const historyEntry = this.shipmentStatusHistoryRepo.create({
      shipment_id: shipmentId,
      vendor_order_id: (shipment as any).vendor_order_id,
      from_status: fromStatus,
      to_status: toStatus,
      changed_by: historyUserId(actor),
      changed_by_role: actor.role,
      is_customer_visible: CUSTOMER_VISIBLE_STATUSES.has(toStatus),
      reason,
      metadata,
    } as any);
    await this.shipmentStatusHistoryRepo.save(historyEntry);

    // Trigger vendor_order transitions
    try {
      if (toStatus === ShipmentStatus.picked_up || toStatus === ShipmentStatus.in_transit) {
        await this.orderStatusService.transitionVendorOrder(
          (shipment as any).vendor_order_id,
          OrderStatus.shipped,
          actor,
          reason,
          metadata,
        );
      } else if (toStatus === ShipmentStatus.out_for_delivery) {
        await this.orderStatusService.transitionVendorOrder(
          (shipment as any).vendor_order_id,
          OrderStatus.out_for_delivery,
          actor,
          reason,
          metadata,
        );
      } else if (toStatus === ShipmentStatus.delivered) {
        await this.orderStatusService.transitionVendorOrder(
          (shipment as any).vendor_order_id,
          OrderStatus.delivered,
          actor,
          reason,
          metadata,
        );
      }
    } catch {
      // Silently catch transition errors (same pattern as processWebhookEvent)
    }

    // Emit shipment.status_changed integration event after persistence,
    // gated by the vendor_integrations_outbound_enabled site setting. Errors
    // are swallowed so a failed enqueue never blocks the shipment flow.
    if (this.integrationEventsQueue && this.siteSettingRepo) {
      try {
        await emitIfEnabled(this.integrationEventsQueue, this.siteSettingRepo, {
          event_type: IntegrationEventType.shipment_status_changed,
          vendor_id: (shipment as any).vendor_id,
          payload: { shipment, transition: { from: fromStatus, to: toStatus } },
          source_ref: {
            shipment_id: (shipment as any).id,
            vendor_order_id: (shipment as any).vendor_order_id,
          },
          schema_version: 1,
        });
      } catch (err) {
        console.error("[order->integration] shipment.status_changed emit failed", {
          shipment_id: (shipment as any)?.id,
          error: String(err),
        });
      }
    }

    return shipment;
  }

  /**
   * Full raw carrier event feed for a shipment (every tracking ping, including
   * status-neutral and ignored/duplicate events), oldest first. Backs the admin
   * "Carrier events" section — a superset of getShipmentHistory, which only has
   * forward status changes.
   */
  async getShipmentEvents(shipmentId: string): Promise<ShipmentEvent[]> {
    return this.shipmentEventRepo.find({
      where: { shipment_id: shipmentId } as any,
      order: { occurred_at: "ASC", created_at: "ASC" },
    });
  }

  async getShipmentHistory(shipmentId: string): Promise<ShipmentStatusHistory[]> {
    return this.shipmentStatusHistoryRepo.find({
      where: { shipment_id: shipmentId } as any,
      order: { created_at: "DESC" } as any,
    });
  }

  private markShippedAtCarrierPossession(shipment: Shipment, status: ShipmentStatus): void {
    if (CARRIER_POSSESSION_STATUSES.has(status) && !(shipment as any).shipped_at) {
      (shipment as any).shipped_at = new Date();
    }
  }

  private insertShipmentEvent(
    shipment: Shipment,
    data: WebhookEventData,
    useExternalId = false,
  ): Promise<{ rowCount?: number }> {
    if (useExternalId) {
      return this.shipmentEventRepo.query(
        `INSERT INTO shipment_events (shipment_id, status, occurred_at, location, description, raw_payload, provider_id, external_event_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (provider_id, external_event_id) WHERE external_event_id IS NOT NULL DO NOTHING`,
        [
          (shipment as any).id,
          data.status,
          data.occurred_at,
          data.location || null,
          data.description || null,
          data.raw_payload ? JSON.stringify(data.raw_payload) : null,
          data.provider_id,
          data.external_event_id,
        ],
      );
    }

    return this.shipmentEventRepo.query(
      `INSERT INTO shipment_events (shipment_id, status, occurred_at, location, description, raw_payload)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (shipment_id, status, occurred_at) DO NOTHING`,
      [
        (shipment as any).id,
        data.status,
        data.occurred_at,
        data.location || null,
        data.description || null,
        data.raw_payload ? JSON.stringify(data.raw_payload) : null,
      ],
    );
  }
}
