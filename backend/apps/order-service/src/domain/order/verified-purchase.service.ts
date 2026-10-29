import { type Order, OrderStatus } from "@materialhub/database";
import type { Repository } from "typeorm";

export interface DeliveredItemRow {
  product_id: string;
  name: string;
  thumbnail_url: string | null;
  variant_label: string | null;
  delivered_at: string | null;
}

/**
 * Determines whether a given user has a verified purchase of a given product.
 * Used by internal services (e.g. reels-service) to gate product tagging
 * to customers who have actually received the product.
 */
export class VerifiedPurchaseService {
  constructor(private readonly orderRepo: Repository<Order>) {}

  async hasVerifiedPurchase(userId: string, productId: string): Promise<boolean> {
    const count = await this.orderRepo
      .createQueryBuilder("o")
      .innerJoin("o.items", "i")
      .where("o.user_id = :userId", { userId })
      .andWhere("i.product_id = :productId", { productId })
      .andWhere("o.status IN (:...statuses)", {
        statuses: [OrderStatus.delivered, OrderStatus.partially_delivered],
      })
      .getCount();
    return count > 0;
  }

  async listDeliveredItems(opts: {
    userId: string;
    q: string | null;
    limit: number;
  }): Promise<DeliveredItemRow[]> {
    const { userId, q, limit } = opts;
    const clampedLimit = Math.min(Math.max(limit, 1), 50);
    // An item counts as delivered if EITHER:
    //   1. A shipment_item row says so (carrier-driven happy path), OR
    //   2. The vendor_order it belongs to is in a delivered state.
    //
    // The (2) fallback covers COD orders and admin manual deliveries that
    // don't go through the carrier flow — without it, taggable products
    // never see those items even after the order is shown as delivered
    // everywhere else.
    //
    // delivered_at is taken from the shipment when present, otherwise from
    // the vendor order's updated_at as the closest proxy.
    const qb = this.orderRepo
      .createQueryBuilder("o")
      .innerJoin("o.items", "oi")
      .innerJoin("vendor_orders", "vo", "vo.id = oi.vendor_order_id")
      .leftJoin(
        "shipment_items",
        "si",
        "si.order_item_id = oi.id AND si.is_delivered = TRUE AND si.deleted_at IS NULL",
      )
      .select([
        "oi.product_id                                 AS product_id",
        "oi.product_name                               AS name",
        "oi.product_image_url                          AS thumbnail_url",
        "oi.variant_name                               AS variant_label",
        "COALESCE(si.delivered_at, vo.updated_at)      AS delivered_at",
      ])
      .where("o.user_id = :userId", { userId })
      .andWhere("oi.deleted_at IS NULL")
      .andWhere("o.deleted_at IS NULL")
      .andWhere("vo.deleted_at IS NULL")
      .andWhere("(si.id IS NOT NULL OR vo.status IN (:...deliveredStates))", {
        deliveredStates: [OrderStatus.delivered, OrderStatus.partially_delivered],
      })
      .andWhere(
        `NOT EXISTS (
          SELECT 1 FROM return_items ri
          JOIN returns r ON r.id = ri.return_id
          WHERE ri.order_item_id = oi.id
            AND ri.deleted_at IS NULL
            AND r.deleted_at IS NULL
            AND r.status IN ('approved','shipped_back','received','refunded')
        )`,
      )
      .orderBy("COALESCE(si.delivered_at, vo.updated_at)", "DESC", "NULLS LAST")
      .addOrderBy("oi.id", "DESC")
      .limit(clampedLimit);

    if (q && q.trim().length > 0) {
      qb.andWhere("oi.product_name ILIKE :qLike", { qLike: `%${q}%` });
    }

    const raw = await qb.getRawMany();
    return raw.map((r) => ({
      product_id: r.product_id,
      name: r.name,
      thumbnail_url: r.thumbnail_url ?? null,
      variant_label: r.variant_label ?? null,
      delivered_at:
        r.delivered_at instanceof Date ? r.delivered_at.toISOString() : (r.delivered_at ?? null),
    }));
  }
}
