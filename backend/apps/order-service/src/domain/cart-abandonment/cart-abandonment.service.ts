import { AppDataSource, Cart, CartAbandoned, CartItem, Order } from "@materialhub/database";

export class CartAbandonmentService {
  private get abandonedRepo() {
    return AppDataSource.getRepository(CartAbandoned);
  }
  private get cartRepo() {
    return AppDataSource.getRepository(Cart);
  }
  private get cartItemRepo() {
    return AppDataSource.getRepository(CartItem);
  }
  private get orderRepo() {
    return AppDataSource.getRepository(Order);
  }

  async detectAbandoned(): Promise<number> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const staleCarts = await this.cartRepo
      .createQueryBuilder("c")
      .where("c.last_activity_at < :cutoff", { cutoff: oneHourAgo })
      .andWhere("c.item_count > 0")
      .andWhere("c.deleted_at IS NULL")
      .andWhere((qb) => {
        const sub = qb
          .subQuery()
          .select("ca.cart_id")
          .from(CartAbandoned, "ca")
          .where("ca.cart_id = c.id")
          .getQuery();
        return `c.id NOT IN ${sub}`;
      })
      .getMany();

    let created = 0;
    for (const cart of staleCarts) {
      const hasOrder = cart.user_id
        ? await this.orderRepo
            .createQueryBuilder("o")
            .where("o.user_id = :uid", { uid: cart.user_id })
            .andWhere("o.created_at > :since", { since: cart.last_activity_at })
            .getOne()
        : null;

      if (hasOrder) continue;

      const items = await this.cartItemRepo.find({
        where: { cart_id: cart.id },
        relations: ["product", "variant"],
      });

      const snapshot = {
        items: items.map((i) => ({
          product_id: i.product_id,
          variant_id: i.variant_id,
          vendor_id: i.vendor_id,
          quantity: i.quantity,
          unit_price: i.unit_price,
          line_total: i.line_total,
          product_name: (i as any).product?.name ?? null,
        })),
      };

      const abandoned = this.abandonedRepo.create({
        cart_id: cart.id,
        user_id: cart.user_id,
        guest_session_id: cart.guest_session_id,
        cart_snapshot: snapshot,
        cart_total: cart.subtotal,
        currency: cart.currency,
        item_count: cart.item_count,
        abandoned_at: cart.last_activity_at,
      });

      await this.abandonedRepo.save(abandoned);
      created++;
    }

    return created;
  }

  async markRecovered(userId: string, orderId: string): Promise<void> {
    const abandoned = await this.abandonedRepo
      .createQueryBuilder("ca")
      .where("ca.user_id = :userId", { userId })
      .andWhere("ca.recovered_at IS NULL")
      .orderBy("ca.abandoned_at", "DESC")
      .getOne();

    if (abandoned) {
      abandoned.recovered_at = new Date();
      abandoned.recovered_order_id = orderId;
      await this.abandonedRepo.save(abandoned);
    }
  }

  async getCartsForReminder(reminderNumber: 1 | 2 | 3): Promise<CartAbandoned[]> {
    const thresholds: Record<number, number> = {
      1: 60 * 60 * 1000,
      2: 24 * 60 * 60 * 1000,
      3: 72 * 60 * 60 * 1000,
    };

    const threshold = new Date(Date.now() - thresholds[reminderNumber]!);

    return this.abandonedRepo
      .createQueryBuilder("ca")
      .where("ca.recovered_at IS NULL")
      .andWhere("ca.reminder_sent_count = :count", { count: reminderNumber - 1 })
      .andWhere("ca.abandoned_at <= :threshold", { threshold })
      .andWhere("ca.email IS NOT NULL OR ca.user_id IS NOT NULL")
      .andWhere("ca.deleted_at IS NULL")
      .leftJoinAndSelect("ca.user", "user")
      .getMany();
  }

  async markReminderSent(id: string): Promise<void> {
    const record = await this.abandonedRepo.findOneOrFail({ where: { id } });
    record.reminder_sent_count += 1;
    record.last_reminder_at = new Date();
    await this.abandonedRepo.save(record);
  }

  async getStats() {
    const totalAbandoned = await this.abandonedRepo
      .createQueryBuilder("ca")
      .where("ca.deleted_at IS NULL")
      .getCount();
    const totalRecovered = await this.abandonedRepo
      .createQueryBuilder("ca")
      .where("ca.recovered_at IS NOT NULL")
      .andWhere("ca.deleted_at IS NULL")
      .getCount();

    const recoveredRevenue = await this.abandonedRepo
      .createQueryBuilder("ca")
      .select("COALESCE(SUM(ca.cart_total), 0)", "total")
      .where("ca.recovered_at IS NOT NULL")
      .andWhere("ca.deleted_at IS NULL")
      .getRawOne();

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const totalCartsWithActivity = await this.cartRepo
      .createQueryBuilder("c")
      .where("c.last_activity_at > :since", { since: thirtyDaysAgo })
      .andWhere("c.item_count > 0")
      .getCount();

    return {
      total_abandoned: totalAbandoned,
      total_recovered: totalRecovered,
      abandonment_rate:
        totalCartsWithActivity > 0
          ? Math.round((totalAbandoned / totalCartsWithActivity) * 100)
          : 0,
      recovery_rate: totalAbandoned > 0 ? Math.round((totalRecovered / totalAbandoned) * 100) : 0,
      revenue_recovered: Number.parseInt(recoveredRevenue?.total ?? "0"),
    };
  }

  async purgeOld(daysOld = 30): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);
    const result = await this.abandonedRepo
      .createQueryBuilder()
      .delete()
      .from(CartAbandoned)
      .where("abandoned_at < :cutoff", { cutoff })
      .execute();
    return result.affected ?? 0;
  }
}
