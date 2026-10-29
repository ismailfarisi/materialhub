import type { OrderStatus } from "@materialhub/database/src/enums/order.enums.ts";
import type { AdminOrderCancellationService } from "./admin-order-cancellation.service.ts";
import type { OrderItemCancellationService } from "./order-item-cancellation.service.ts";
import type { OrderStatusService } from "./order-status.service.ts";
// order.controller.ts
import type { OrderQueryService } from "./order.service.ts";

export class OrderController {
  constructor(
    private orderService: OrderQueryService,
    private orderStatusService: OrderStatusService,
    private adminOrderCancellationService: AdminOrderCancellationService,
    private orderItemCancellationService: OrderItemCancellationService,
  ) {}

  list(userId: string, query: any) {
    return this.orderService.list(userId, query);
  }

  getById(orderId: string, userId: string) {
    return this.orderService.getById(orderId, userId);
  }

  adminGetById(orderId: string) {
    return this.orderService.adminGetById(orderId);
  }

  async cancel(orderId: string, userId: string, reason: string) {
    return this.orderStatusService.cancelOrder(orderId, { userId, role: "buyer" }, reason);
  }

  async adminTransition(orderId: string, adminId: string, status: string, reason?: string) {
    const before = await this.orderService.adminGetById(orderId);
    const order = await this.orderStatusService.transitionOrder(
      orderId,
      status as OrderStatus,
      { userId: adminId, role: "admin" },
      reason,
    );
    return { order, previous_status: before?.status as string | undefined };
  }

  async adminCancel(orderId: string, adminId: string, body: any) {
    return this.adminOrderCancellationService.cancelOrderAsAdmin(orderId, adminId, body);
  }

  async adminCancelItems(orderId: string, adminId: string, body: any) {
    return this.orderItemCancellationService.cancelItems(orderId, adminId, body);
  }

  async adminList(query: any) {
    return this.orderService.listAdmin(query);
  }

  async exportCsv(filters: any) {
    return this.orderService.exportCsv(filters);
  }
}
