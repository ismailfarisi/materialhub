import { FlashDeal } from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";
import type { DataSource, EntityManager } from "typeorm";

export interface ResolvedDeal {
  flashDealId: string;
  dealPrice: number;
  originalPrice: number;
}

export class DealSoldOutError extends HttpError {
  constructor(flashDealId: string) {
    super(409, `Flash deal ${flashDealId} is sold out`, "DEAL_SOLD_OUT");
  }
}

export class FlashDealApplicator {
  constructor(private dataSource: DataSource) {}

  async resolveForLine(productId: string, variantId: string | null): Promise<ResolvedDeal | null> {
    const row = await this.dataSource
      .createQueryBuilder()
      .select(["fd.id AS id", "fd.deal_price AS deal_price", "fd.original_price AS original_price"])
      .from(FlashDeal, "fd")
      .where("fd.product_id = :productId")
      .andWhere("(fd.variant_id = :variantId OR fd.variant_id IS NULL)")
      .andWhere("fd.is_active = true")
      .andWhere("fd.starts_at <= NOW()")
      .andWhere("fd.expires_at > NOW()")
      .andWhere("(fd.quantity_limit IS NULL OR fd.quantity_sold < fd.quantity_limit)")
      .andWhere("fd.deleted_at IS NULL")
      .orderBy("fd.variant_id", "DESC", "NULLS LAST")
      .addOrderBy("fd.starts_at", "DESC")
      .limit(1)
      .setParameters({ productId, variantId })
      .getRawOne<{
        id: string;
        deal_price: number;
        original_price: number;
      }>();

    if (!row) return null;
    return {
      flashDealId: row.id,
      dealPrice: row.deal_price,
      originalPrice: row.original_price,
    };
  }

  async validateAndIncrement(
    manager: EntityManager,
    flashDealId: string,
    qty: number,
  ): Promise<void> {
    if (qty <= 0) return;
    const row = await manager
      .createQueryBuilder()
      .select([
        "fd.id AS id",
        "fd.quantity_limit AS quantity_limit",
        "fd.quantity_sold AS quantity_sold",
        "fd.is_active AS is_active",
        "fd.starts_at AS starts_at",
        "fd.expires_at AS expires_at",
        "fd.deleted_at AS deleted_at",
      ])
      .from(FlashDeal, "fd")
      .where("fd.id = :flashDealId")
      .setLock("pessimistic_write")
      .setParameters({ flashDealId })
      .getRawOne<{
        id: string;
        quantity_limit: number | null;
        quantity_sold: number;
        is_active: boolean;
        starts_at: Date;
        expires_at: Date;
        deleted_at: Date | null;
      }>();

    if (!row) throw new DealSoldOutError(flashDealId);
    if (row.deleted_at !== null) throw new DealSoldOutError(flashDealId);
    if (!row.is_active) throw new DealSoldOutError(flashDealId);

    const now = Date.now();
    if (new Date(row.starts_at).getTime() > now) throw new DealSoldOutError(flashDealId);
    if (new Date(row.expires_at).getTime() <= now) throw new DealSoldOutError(flashDealId);

    if (row.quantity_limit !== null && row.quantity_sold + qty > row.quantity_limit) {
      throw new DealSoldOutError(flashDealId);
    }

    await manager
      .createQueryBuilder()
      .update(FlashDeal)
      .set({ quantity_sold: () => `quantity_sold + ${qty}` })
      .where("id = :flashDealId")
      .setParameter("flashDealId", flashDealId)
      .execute();
  }

  async decrement(manager: EntityManager, flashDealId: string, qty: number): Promise<void> {
    if (qty <= 0) return;
    await manager
      .createQueryBuilder()
      .update(FlashDeal)
      .set({ quantity_sold: () => `GREATEST(0, quantity_sold - ${qty})` })
      .where("id = :flashDealId")
      .setParameter("flashDealId", flashDealId)
      .execute();
  }
}
