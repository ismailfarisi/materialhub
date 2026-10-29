import type { Commission, Order, User, Vendor, VendorOrder } from "@materialhub/database";
import type { Repository } from "typeorm";
import { vendorVisibleOrderPredicate } from "../order/vendor-order-visibility.ts";

export class DashboardService {
  constructor(
    private orderRepo: Repository<Order>,
    private vendorOrderRepo: Repository<VendorOrder>,
    private userRepo: Repository<User>,
    private vendorRepo: Repository<Vendor>,
    private commissionRepo: Repository<Commission>,
  ) {}

  async adminStats() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400000);

    const [
      gmvResult,
      gmvPrevResult,
      activeVendors,
      newUsers30d,
      newUsersPrev30d,
      totalOrders,
      totalOrdersPrev,
      statusBreakdown,
    ] = await Promise.all([
      this.orderRepo
        .createQueryBuilder("o")
        .select("COALESCE(SUM(o.grand_total), 0)", "total")
        .where("o.payment_status = :ps", { ps: "captured" })
        .andWhere("o.deleted_at IS NULL")
        .andWhere("o.created_at >= :since", { since: thirtyDaysAgo })
        .getRawOne(),
      this.orderRepo
        .createQueryBuilder("o")
        .select("COALESCE(SUM(o.grand_total), 0)", "total")
        .where("o.payment_status = :ps", { ps: "captured" })
        .andWhere("o.deleted_at IS NULL")
        .andWhere("o.created_at >= :from", { from: sixtyDaysAgo })
        .andWhere("o.created_at < :to", { to: thirtyDaysAgo })
        .getRawOne(),
      this.vendorRepo.count({ where: { status: "approved" as any, deleted_at: null as any } }),
      this.userRepo
        .createQueryBuilder("u")
        .where("u.created_at >= :since", { since: thirtyDaysAgo })
        .andWhere("u.deleted_at IS NULL")
        .getCount(),
      this.userRepo
        .createQueryBuilder("u")
        .where("u.created_at >= :from", { from: sixtyDaysAgo })
        .andWhere("u.created_at < :to", { to: thirtyDaysAgo })
        .andWhere("u.deleted_at IS NULL")
        .getCount(),
      this.orderRepo
        .createQueryBuilder("o")
        .where("o.created_at >= :since", { since: thirtyDaysAgo })
        .andWhere("o.deleted_at IS NULL")
        .getCount(),
      this.orderRepo
        .createQueryBuilder("o")
        .where("o.created_at >= :from", { from: sixtyDaysAgo })
        .andWhere("o.created_at < :to", { to: thirtyDaysAgo })
        .andWhere("o.deleted_at IS NULL")
        .getCount(),
      this.orderRepo
        .createQueryBuilder("o")
        .select("o.status", "status")
        .addSelect("COUNT(o.id)", "count")
        .where("o.deleted_at IS NULL")
        .groupBy("o.status")
        .getRawMany(),
    ]);

    const gmv = Number(gmvResult?.total ?? 0);
    const gmvPrev = Number(gmvPrevResult?.total ?? 0);

    return {
      gmv,
      gmv_change: gmvPrev > 0 ? Math.round(((gmv - gmvPrev) / gmvPrev) * 100) : null,
      active_vendors: activeVendors,
      active_vendors_change: null,
      new_users_30d: newUsers30d,
      new_users_30d_change:
        newUsersPrev30d > 0
          ? Math.round(((newUsers30d - newUsersPrev30d) / newUsersPrev30d) * 100)
          : null,
      total_orders: totalOrders,
      total_orders_change:
        totalOrdersPrev > 0
          ? Math.round(((totalOrders - totalOrdersPrev) / totalOrdersPrev) * 100)
          : null,
      order_status_breakdown: statusBreakdown.map((r: any) => ({
        status: r.status,
        count: Number(r.count),
      })),
    };
  }

  async adminRevenue(period: string) {
    const days = period === "30d" ? 30 : period === "90d" ? 90 : 7;
    const since = new Date(Date.now() - days * 86400000);
    const result = await this.orderRepo
      .createQueryBuilder("o")
      .select("DATE(o.created_at)", "date")
      .addSelect("COALESCE(SUM(o.grand_total), 0)", "revenue")
      .addSelect("COUNT(o.id)", "orders")
      .where("o.payment_status = :ps", { ps: "captured" })
      .andWhere("o.deleted_at IS NULL")
      .andWhere("o.created_at >= :since", { since })
      .groupBy("DATE(o.created_at)")
      .orderBy("DATE(o.created_at)", "ASC")
      .getRawMany();

    return result.map((r: any) => ({
      date: r.date,
      revenue: Number(r.revenue),
      orders: Number(r.orders),
    }));
  }

  async vendorStats(vendorId: string) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 86400000);

    const [revToday, revYesterday, ordersToday, ordersYesterday] = await Promise.all([
      this.vendorOrderRepo
        .createQueryBuilder("vo")
        .select("COALESCE(SUM(vo.vendor_total), 0)", "total")
        .where("vo.vendor_id = :vid", { vid: vendorId })
        .andWhere("vo.created_at >= :since", { since: todayStart })
        .andWhere("vo.status NOT IN (:...excluded)", { excluded: ["cancelled"] })
        .andWhere("vo.deleted_at IS NULL")
        .andWhere(vendorVisibleOrderPredicate("vo"))
        .getRawOne(),
      this.vendorOrderRepo
        .createQueryBuilder("vo")
        .select("COALESCE(SUM(vo.vendor_total), 0)", "total")
        .where("vo.vendor_id = :vid", { vid: vendorId })
        .andWhere("vo.created_at >= :from", { from: yesterdayStart })
        .andWhere("vo.created_at < :to", { to: todayStart })
        .andWhere("vo.status NOT IN (:...excluded)", { excluded: ["cancelled"] })
        .andWhere("vo.deleted_at IS NULL")
        .andWhere(vendorVisibleOrderPredicate("vo"))
        .getRawOne(),
      this.vendorOrderRepo
        .createQueryBuilder("vo")
        .where("vo.vendor_id = :vid", { vid: vendorId })
        .andWhere("vo.created_at >= :since", { since: todayStart })
        .andWhere("vo.deleted_at IS NULL")
        .andWhere(vendorVisibleOrderPredicate("vo"))
        .getCount(),
      this.vendorOrderRepo
        .createQueryBuilder("vo")
        .where("vo.vendor_id = :vid", { vid: vendorId })
        .andWhere("vo.created_at >= :from", { from: yesterdayStart })
        .andWhere("vo.created_at < :to", { to: todayStart })
        .andWhere("vo.deleted_at IS NULL")
        .andWhere(vendorVisibleOrderPredicate("vo"))
        .getCount(),
    ]);

    const revenueToday = Number(revToday?.total ?? 0);
    const revenueYesterday = Number(revYesterday?.total ?? 0);

    return {
      revenue_today: revenueToday,
      revenue_today_change:
        revenueYesterday > 0
          ? Math.round(((revenueToday - revenueYesterday) / revenueYesterday) * 100)
          : null,
      orders_today: ordersToday,
      orders_today_change:
        ordersYesterday > 0
          ? Math.round(((ordersToday - ordersYesterday) / ordersYesterday) * 100)
          : null,
      page_views: null,
      page_views_change: null,
      conversion_rate: null,
      conversion_rate_change: null,
    };
  }

  async vendorRevenue(vendorId: string, period: string) {
    const days = period === "30d" ? 30 : period === "90d" ? 90 : 7;
    const since = new Date(Date.now() - days * 86400000);
    const result = await this.vendorOrderRepo
      .createQueryBuilder("vo")
      .select("DATE(vo.created_at)", "date")
      .addSelect("COALESCE(SUM(vo.vendor_total), 0)", "revenue")
      .addSelect("COUNT(vo.id)", "orders")
      .where("vo.vendor_id = :vid", { vid: vendorId })
      .andWhere("vo.status NOT IN (:...excluded)", { excluded: ["cancelled"] })
      .andWhere("vo.deleted_at IS NULL")
      .andWhere(vendorVisibleOrderPredicate("vo"))
      .andWhere("vo.created_at >= :since", { since })
      .groupBy("DATE(vo.created_at)")
      .orderBy("DATE(vo.created_at)", "ASC")
      .getRawMany();

    return result.map((r: any) => ({
      date: r.date,
      revenue: Number(r.revenue),
      orders: Number(r.orders),
    }));
  }
}
