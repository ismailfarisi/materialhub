import { OrderStatus } from "@materialhub/database/src/enums/order.enums.ts";
import type { OrderStatusService } from "./order-status.service.ts";
import type { VendorOrderService } from "./vendor-order.service.ts";

export class VendorOrderController {
  constructor(
    private vendorOrderService: VendorOrderService,
    private orderStatusService: OrderStatusService,
  ) {}

  list(vendorId: string, query: any) {
    return this.vendorOrderService.listForVendor(vendorId, query);
  }

  getById(vendorOrderId: string, vendorId: string) {
    return this.vendorOrderService.getForVendor(vendorOrderId, vendorId);
  }

  /**
   * `vendorId` is the vendor the member acts for (ownership); `actorUserId`
   * is the member's own user id, which is what history records as
   * `changed_by` (an FK to users — a vendor id there violates it).
   */
  async transition(
    vendorOrderId: string,
    vendorId: string,
    status: string,
    actorUserId: string | null = null,
  ) {
    return this.orderStatusService.transitionVendorOrder(vendorOrderId, status as OrderStatus, {
      userId: actorUserId,
      vendorId,
      role: "vendor",
    });
  }

  async reject(
    vendorOrderId: string,
    vendorId: string,
    reason: string,
    actorUserId: string | null = null,
  ) {
    return this.orderStatusService.transitionVendorOrder(
      vendorOrderId,
      OrderStatus.cancelled,
      { userId: actorUserId, vendorId, role: "vendor" },
      reason,
    );
  }

  /**
   * Admin transitioning a vendor order. Same path as the vendor's own
   * transition endpoint but with role="admin", so the state machine's
   * admin-bypass targets (cancelled, delivered) are reachable from any
   * status. Used for manual delivery confirmation when a carrier
   * integration isn't wired up.
   */
  async adminTransition(
    vendorOrderId: string,
    actorUserId: string | null,
    status: string,
    reason?: string,
  ) {
    return this.orderStatusService.transitionVendorOrder(
      vendorOrderId,
      status as OrderStatus,
      { userId: actorUserId, role: "admin" },
      reason,
    );
  }
}
