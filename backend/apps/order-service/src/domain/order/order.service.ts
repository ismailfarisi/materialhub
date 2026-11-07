import type { Order, OrderItemCancellation } from "@materialhub/database";
// order.service.ts
import type { Repository } from "typeorm";

// Mirrors OrderItemCancellation.items — the entity's exported interface is not
// re-exported from the @materialhub/database barrel, so keep a local shape.
interface CancelledItemSnapshot {
  order_item_id: string;
  vendor_order_id: string;
  quantity: number;
  refund_amount: number;
}

/**
 * Flattens the joined live product onto each order item as `product_slug`,
 * so the buyer can reopen the product from their order.
 *
 * Null whenever the product is gone or no longer published — a link to an
 * unpublished product is a 404, which reads as a broken order page.
 */
function attachProductSlugs(order: Order): void {
  for (const vendorOrder of ((order as any).vendorOrders ?? []) as any[]) {
    for (const item of (vendorOrder.items ?? []) as any[]) {
      const product = item.product;
      item.product_slug = product?.status === "published" ? (product.slug ?? null) : null;
      // The join exists only to resolve the slug; don't leak the entity.
      item.product = undefined;
    }
  }
}

// Customer-facing shape: omits admin_id / gateway_refund_id (internal admin +
// payment-gateway plumbing the customer has no business seeing).
function toCustomerCancellation(c: OrderItemCancellation) {
  return {
    id: c.id,
    order_id: c.order_id,
    reason: c.reason,
    refund_amount: c.refund_amount,
    currency: c.currency,
    refund_method: c.refund_method,
    status: c.status,
    items: c.items as CancelledItemSnapshot[],
    created_at: c.created_at,
  };
}

/**
 * Stamp each order line with what was cancelled from it and why, so the
 * storefront can tell a cancelled line ("Cancelled: <reason>") from a returned
 * one — `refunded_quantity` counts both.
 */
export function annotateCancelledItems(order: any, cancellations: OrderItemCancellation[]): void {
  const byItem = new Map<string, { quantity: number; amount: number; reason: string | null }>();
  for (const c of cancellations) {
    for (const it of (c.items as CancelledItemSnapshot[] | null) ?? []) {
      const cur = byItem.get(it.order_item_id) ?? { quantity: 0, amount: 0, reason: null };
      cur.quantity += Number(it.quantity) || 0;
      cur.amount += Number(it.refund_amount) || 0;
      cur.reason = c.reason ?? cur.reason;
      byItem.set(it.order_item_id, cur);
    }
  }
  for (const vo of order?.vendorOrders ?? []) {
    for (const item of vo.items ?? []) {
      const hit = byItem.get(item.id);
      item.cancelled_quantity = hit?.quantity ?? 0;
      item.cancelled_amount = hit?.amount ?? 0;
      item.cancellation_reason = hit?.reason ?? null;
    }
  }
}

// Admin-facing shape: the full record.
function toAdminCancellation(c: OrderItemCancellation) {
  return {
    id: c.id,
    order_id: c.order_id,
    admin_id: c.admin_id,
    reason: c.reason,
    refund_amount: c.refund_amount,
    currency: c.currency,
    refund_method: c.refund_method,
    gateway_refund_id: c.gateway_refund_id,
    status: c.status,
    items: c.items as CancelledItemSnapshot[],
    created_at: c.created_at,
  };
}

export class OrderQueryService {
  constructor(
    private orderRepo: Repository<Order>,
    private cancellationRepo: Repository<OrderItemCancellation>,
  ) {}

  async list(
    userId: string,
    query: { page?: number; limit?: number; status?: string; from_date?: string; to_date?: string },
  ): Promise<{ data: Order[]; total: number }> {
    const page = Math.max(1, Math.trunc(Number(query.page)) || 1);
    const limit = query.limit || 20;

    const qb = this.orderRepo
      .createQueryBuilder("order")
      .leftJoinAndSelect("order.vendorOrders", "vendorOrders")
      .where("order.user_id = :userId", { userId })
      .orderBy("order.created_at", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    if (query.status) {
      qb.andWhere("order.status = :status", { status: query.status });
    }
    if (query.from_date) {
      qb.andWhere("order.created_at >= :from_date", { from_date: query.from_date });
    }
    if (query.to_date) {
      qb.andWhere("order.created_at <= :to_date", { to_date: query.to_date });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async getById(orderId: string, userId: string): Promise<Order | null> {
    const order = await this.orderRepo
      .createQueryBuilder("order")
      .leftJoinAndSelect("order.vendorOrders", "vendorOrders")
      .leftJoinAndSelect("vendorOrders.items", "items")
      // Order items snapshot the product name/image but not its slug, so the
      // live product is joined purely to build a link back to the PDP.
      .leftJoin("items.product", "itemProduct")
      .addSelect(["itemProduct.id", "itemProduct.slug", "itemProduct.status"])
      .leftJoinAndSelect("order.payments", "payments")
      .leftJoinAndSelect("order.statusHistory", "statusHistory")
      .leftJoinAndSelect("order.shipments", "shipments")
      .where("order.id = :orderId", { orderId })
      .andWhere("order.user_id = :userId", { userId })
      .getOne();

    if (!order) return null;

    attachProductSlugs(order);

    // Filter statusHistory to only customer-visible entries, sorted by created_at asc
    if (order.statusHistory) {
      order.statusHistory = (order.statusHistory as any[])
        .filter((h: any) => h.is_customer_visible === true)
        .sort(
          (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );
    }

    const cancellations = await this.cancellationRepo.find({
      where: { order_id: orderId, status: "completed" },
    });
    (order as any).cancellations = cancellations.map(toCustomerCancellation);
    annotateCancelledItems(order, cancellations);

    return order;
  }

  async adminGetById(orderId: string): Promise<Order | null> {
    const order = await this.orderRepo
      .createQueryBuilder("order")
      .leftJoinAndSelect("order.vendorOrders", "vendorOrders")
      .leftJoinAndSelect("vendorOrders.items", "items")
      // The admin panel renders shipments per vendor sub-order, so the
      // relation must be loaded on vendorOrders, not just the master order.
      .leftJoinAndSelect("vendorOrders.shipments", "vendorOrderShipments")
      .leftJoinAndSelect("order.payments", "payments")
      .leftJoinAndSelect("order.statusHistory", "statusHistory")
      .leftJoinAndSelect("order.shipments", "shipments")
      .where("order.id = :orderId", { orderId })
      .getOne();

    if (!order) return null;

    const cancellations = await this.cancellationRepo.find({ where: { order_id: orderId } });
    (order as any).cancellations = cancellations.map(toAdminCancellation);

    return order;
  }

  async listAdmin(query: {
    page?: number;
    limit?: number;
    status?: string;
    from_date?: string;
    to_date?: string;
    vendor_id?: string;
    user_id?: string;
  }): Promise<{ data: Order[]; total: number }> {
    const page = Math.max(1, Math.trunc(Number(query.page)) || 1);
    const limit = query.limit || 20;

    const qb = this.orderRepo
      .createQueryBuilder("order")
      .leftJoinAndSelect("order.vendorOrders", "vendorOrders")
      .orderBy("order.created_at", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    if (query.status) {
      qb.andWhere("order.status = :status", { status: query.status });
    }
    if (query.from_date) {
      qb.andWhere("order.created_at >= :from_date", { from_date: query.from_date });
    }
    if (query.to_date) {
      qb.andWhere("order.created_at <= :to_date", { to_date: query.to_date });
    }
    if (query.vendor_id) {
      qb.andWhere("vendorOrders.vendor_id = :vendor_id", { vendor_id: query.vendor_id });
    }
    if (query.user_id) {
      qb.andWhere("order.user_id = :user_id", { user_id: query.user_id });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async exportCsv(filters: {
    status?: string;
    vendor_id?: string;
    from_date?: string;
    to_date?: string;
    user_id?: string;
  }): Promise<string> {
    const qb = this.orderRepo
      .createQueryBuilder("order")
      .leftJoin("order.vendorOrders", "vendorOrders")
      .orderBy("order.created_at", "DESC");

    if (filters.status) {
      qb.andWhere("order.status = :status", { status: filters.status });
    }
    if (filters.vendor_id) {
      qb.andWhere("vendorOrders.vendor_id = :vendor_id", { vendor_id: filters.vendor_id });
    }
    if (filters.from_date) {
      qb.andWhere("order.created_at >= :from_date", { from_date: filters.from_date });
    }
    if (filters.to_date) {
      qb.andWhere("order.created_at <= :to_date", { to_date: filters.to_date });
    }
    if (filters.user_id) {
      qb.andWhere("order.user_id = :user_id", { user_id: filters.user_id });
    }

    const orders = await qb.getMany();

    const escapecsv = (val: string | null | undefined): string => {
      if (val === null || val === undefined) return '""';
      const str = String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const header = "order_number,status,grand_total,currency,created_at\n";
    const rows = orders
      .map(
        (order: Order) =>
          `${escapecsv(order.order_number)},${escapecsv(order.status)},${order.grand_total},${escapecsv(order.currency)},${order.created_at.toISOString()}`,
      )
      .join("\n");

    return header + rows;
  }
}
