// vendor-order.service.ts
import type { OrderItemCancellation } from "@materialhub/database";
import type { VendorOrder } from "@materialhub/database/src/entities/vendor-order.entity.ts";
import type { Repository } from "typeorm";
import { vendorVisibleOrderPredicate } from "./vendor-order-visibility.ts";

/** The customer's shipping-address snapshot, as stored on the master order. */
export type ShipToAddress = Record<string, unknown>;

interface ListFilters {
  page?: number;
  limit?: number;
  status?: string;
  from_date?: string;
  to_date?: string;
}

// Mirrors OrderItemCancellation.items — the entity's exported interface is not
// re-exported from the @materialhub/database barrel, so keep a local shape.
interface CancelledItemSnapshot {
  order_item_id: string;
  vendor_order_id: string;
  quantity: number;
  refund_amount: number;
}

// Vendor-facing shape: like the admin shape but with gateway_refund_id
// stripped (payment-gateway internals aren't the vendor's business), and the
// `items` snapshot filtered down to only this vendor_order's own line items —
// a cancellation can span multiple vendors on a multi-vendor order, and a
// vendor must never see another vendor's item-level refund detail.
function toVendorCancellation(vendorOrderItemIds: Set<string>) {
  return (c: OrderItemCancellation) => {
    const items = (c.items as CancelledItemSnapshot[]).filter((it) =>
      vendorOrderItemIds.has(it.order_item_id),
    );
    if (items.length === 0) return null;
    return {
      id: c.id,
      order_id: c.order_id,
      reason: c.reason,
      refund_amount: c.refund_amount,
      currency: c.currency,
      refund_method: c.refund_method,
      status: c.status,
      items,
      created_at: c.created_at,
    };
  };
}

export class VendorOrderService {
  constructor(
    private vendorOrderRepo: Repository<VendorOrder>,
    private cancellationRepo: Repository<OrderItemCancellation>,
  ) {}

  async listForVendor(
    vendorId: string,
    filters: ListFilters,
  ): Promise<{ data: VendorOrder[]; total: number }> {
    const page = filters.page || 1;
    const limit = filters.limit || 20;

    const qb = this.vendorOrderRepo
      .createQueryBuilder("vo")
      .leftJoinAndSelect("vo.items", "items")
      .leftJoinAndSelect("vo.order", "order")
      .where("vo.vendor_id = :vendorId", { vendorId })
      .andWhere("vo.deleted_at IS NULL")
      .andWhere(vendorVisibleOrderPredicate("vo"));

    if (filters.status) qb.andWhere("vo.status = :status", { status: filters.status });
    if (filters.from_date)
      qb.andWhere("vo.created_at >= :fromDate", { fromDate: filters.from_date });
    if (filters.to_date)
      qb.andWhere("vo.created_at <= :toDate", { toDate: `${filters.to_date}T23:59:59.999Z` });

    qb.orderBy("vo.created_at", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async getForVendor(
    vendorOrderId: string,
    vendorId: string,
  ): Promise<(VendorOrder & { ship_to: ShipToAddress }) | null> {
    const vo = await this.vendorOrderRepo.findOne({
      where: { id: vendorOrderId, vendor_id: vendorId },
      relations: ["items", "order", "shipments"],
    });
    if (!vo) return null;

    // Vendor sub-orders ship to the customer's address on the master order.
    const ship_to: ShipToAddress = (vo.order?.shipping_address as ShipToAddress) ?? {};

    const vendorOrderItemIds = new Set((vo.items ?? []).map((item: any) => item.id));
    const cancellationRows = await this.cancellationRepo.find({
      where: { order_id: vo.order_id, status: "completed" },
    });
    const cancellations = cancellationRows
      .map(toVendorCancellation(vendorOrderItemIds))
      .filter((c): c is NonNullable<typeof c> => c !== null);

    return Object.assign(vo, { ship_to, cancellations });
  }
}
