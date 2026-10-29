import type { Return } from "@materialhub/database";
import type { ReturnItem } from "@materialhub/database";
import type { Order } from "@materialhub/database";
import type { VendorOrder } from "@materialhub/database";
import type { OrderItem } from "@materialhub/database";
import type { Inventory } from "@materialhub/database";
import type { InventoryMovement } from "@materialhub/database";
import type { User } from "@materialhub/database";
import type { WalletTransaction } from "@materialhub/database";
import {
  OrderStatus,
  type ReturnReason,
  ReturnStatus,
} from "@materialhub/database/src/enums/order.enums.ts";
import { BadRequestError, NotFoundError } from "@materialhub/plugins";
import type { Queue } from "bullmq";
// return.service.ts
import type { Repository } from "typeorm";
import type { CommissionReversalService } from "../commission/commission-reversal.service.ts";
import type { OrderStatusService } from "../order/order-status.service.ts";
import type { RefundService } from "../refund/refund.service.ts";
import { assertWithinReturnWindow } from "./return-window.ts";

/* ------------------------------------------------------------------ */
/*  Input types                                                       */
/* ------------------------------------------------------------------ */
interface CreateReturnItemInput {
  order_item_id: string;
  quantity: number;
  reason: ReturnReason;
  condition?: string | null;
}

interface CreateReturnInput {
  vendor_order_id: string;
  reason: ReturnReason;
  reason_details?: string | null;
  media_urls?: string[];
  items: CreateReturnItemInput[];
}

interface ApproveReturnInput {
  refund_amount: number;
  refund_method: string;
  items: { return_item_id: string; refund_amount: number }[];
}

interface UpdateShippingInput {
  return_shipping_carrier: string;
  return_tracking_number: string;
  return_shipping_cost?: number | null;
  return_shipping_paid_by?: string | null;
}

interface PaginatedQuery {
  page?: number;
  limit?: number;
  status?: string;
  vendor_id?: string;
}

/* ------------------------------------------------------------------ */
/*  Service                                                           */
/* ------------------------------------------------------------------ */
export class ReturnService {
  constructor(
    private returnRepo: Repository<Return>,
    private returnItemRepo: Repository<ReturnItem>,
    private orderRepo: Repository<Order>,
    private vendorOrderRepo: Repository<VendorOrder>,
    private orderItemRepo: Repository<OrderItem>,
    private inventoryRepo: Repository<Inventory>,
    private inventoryMovementRepo: Repository<InventoryMovement>,
    private userRepo: Repository<User>,
    private walletTransactionRepo: Repository<WalletTransaction>,
    private orderStatusService: OrderStatusService,
    private orderEventQueue: Queue,
    private refundService: RefundService,
    private commissionReversal: CommissionReversalService,
  ) {}

  /* ================================================================ */
  /*  createReturn                                                    */
  /* ================================================================ */
  async createReturn(
    orderId: string,
    userId: string,
    data: CreateReturnInput,
    now = new Date(),
  ): Promise<Return> {
    // 1. Find vendor_order, verify ownership + delivered status
    const vendorOrder = await this.vendorOrderRepo.findOne({
      where: { id: data.vendor_order_id } as any,
      relations: ["order"],
    });
    if (!vendorOrder) throw new NotFoundError("Vendor order not found");

    const order = (vendorOrder as any).order as Order;
    if (order.id !== orderId || order.user_id !== userId) {
      throw new NotFoundError("Vendor order not found");
    }
    if (vendorOrder.status !== OrderStatus.delivered) {
      throw new BadRequestError("Only delivered orders can be returned");
    }
    assertWithinReturnWindow(
      (order as any).delivered_at ?? (vendorOrder as any).updated_at,
      now,
      BadRequestError,
    );

    // 2. Validate quantities
    for (const item of data.items) {
      const orderItem = await this.orderItemRepo.findOne({
        where: { id: item.order_item_id } as any,
      });
      if (!orderItem) throw new NotFoundError("Order item not found");
      if ((orderItem as any).vendor_order_id !== data.vendor_order_id) {
        throw new BadRequestError("Order item does not belong to this vendor order");
      }

      // Sum existing return item quantities for this order item across
      // non-rejected returns — rejected returns shouldn't count toward the
      // cap so the buyer can re-submit after a rejection.
      const existingReturnItems = await this.returnItemRepo.find({
        where: { order_item_id: item.order_item_id } as any,
        relations: ["return_"],
      });
      const alreadyReturned = existingReturnItems.reduce(
        (sum: number, ri: any) =>
          ri.return_?.status === ReturnStatus.rejected ? sum : sum + ri.quantity,
        0,
      );

      const orderedQty = (orderItem as any).quantity;
      const remaining = orderedQty - alreadyReturned;
      if (item.quantity > remaining) {
        throw new BadRequestError(
          alreadyReturned > 0
            ? `You already have a return for this item in progress. ${remaining} of ${orderedQty} unit(s) remain available to return.`
            : `Return quantity (${item.quantity}) exceeds ordered quantity (${orderedQty}).`,
        );
      }
    }

    // 3. Generate return_number
    const count = await this.returnRepo.count();
    const year = new Date().getFullYear();
    const returnNumber = `RET-${year}-${String(count + 1).padStart(6, "0")}`;

    // 4. Create Return entity
    const returnEntity = this.returnRepo.create({
      return_number: returnNumber,
      order_id: orderId,
      vendor_order_id: data.vendor_order_id,
      user_id: userId,
      vendor_id: (vendorOrder as any).vendor_id,
      status: ReturnStatus.requested,
      reason: data.reason,
      reason_details: data.reason_details || null,
      media_urls: data.media_urls || [],
    } as any);
    const savedReturn = (await this.returnRepo.save(returnEntity)) as unknown as Return;

    // 5. Create ReturnItem records
    for (const item of data.items) {
      const returnItem = this.returnItemRepo.create({
        return_id: (savedReturn as any).id,
        order_item_id: item.order_item_id,
        quantity: item.quantity,
        reason: item.reason,
        condition: item.condition || null,
      } as any);
      await this.returnItemRepo.save(returnItem);
    }

    // 6. Transition order status
    await this.orderStatusService.transitionOrder(orderId, OrderStatus.refund_requested, {
      userId: "system",
      role: "system",
    });

    // 7. Enqueue event
    await this.orderEventQueue.add("return.requested", {
      type: "return.requested",
      returnId: (savedReturn as any).id,
      orderId,
      userId,
      timestamp: new Date().toISOString(),
    });

    return savedReturn;
  }

  /* ================================================================ */
  /*  approveReturn                                                   */
  /* ================================================================ */
  async approveReturn(
    returnId: string,
    adminId: string,
    data: ApproveReturnInput,
  ): Promise<Return> {
    const ret = await this.returnRepo.findOne({
      where: { id: returnId } as any,
      relations: ["returnItems"],
    });
    if (!ret) throw new NotFoundError("Return not found");
    if (ret.status !== ReturnStatus.requested) {
      throw new BadRequestError("Only requested returns can be approved");
    }

    ret.refund_amount = data.refund_amount;
    ret.refund_method = data.refund_method;
    ret.approved_at = new Date();
    ret.approved_by = adminId;
    ret.status = ReturnStatus.approved;

    // Update per-item refund amounts
    for (const itemData of data.items) {
      const returnItem = ((ret as any).returnItems || []).find(
        (ri: any) => ri.id === itemData.return_item_id,
      );
      if (returnItem) {
        returnItem.refund_amount = itemData.refund_amount;
        await this.returnItemRepo.save(returnItem);
      }
    }

    const saved = await this.returnRepo.save(ret);

    await this.orderEventQueue.add("return.approved", {
      type: "return.approved",
      returnId,
      adminId,
      timestamp: new Date().toISOString(),
    });

    return saved;
  }

  /* ================================================================ */
  /*  rejectReturn                                                    */
  /* ================================================================ */
  async rejectReturn(returnId: string, adminId: string, reason: string): Promise<Return> {
    const ret = await this.returnRepo.findOne({
      where: { id: returnId } as any,
    });
    if (!ret) throw new NotFoundError("Return not found");
    if (ret.status !== ReturnStatus.requested) {
      throw new BadRequestError("Only requested returns can be rejected");
    }

    ret.rejected_at = new Date();
    ret.rejection_reason = reason;
    ret.status = ReturnStatus.rejected;

    const saved = await this.returnRepo.save(ret);

    await this.orderEventQueue.add("return.rejected", {
      type: "return.rejected",
      returnId,
      adminId,
      reason,
      timestamp: new Date().toISOString(),
    });

    return saved;
  }

  /* ================================================================ */
  /*  updateReturnShipping                                            */
  /* ================================================================ */
  async updateReturnShipping(
    returnId: string,
    userId: string,
    data: UpdateShippingInput,
  ): Promise<Return> {
    const ret = await this.returnRepo.findOne({
      where: { id: returnId } as any,
    });
    if (!ret) throw new NotFoundError("Return not found");
    if (ret.user_id !== userId) throw new NotFoundError("Return not found");
    if (ret.status !== ReturnStatus.approved) {
      throw new BadRequestError("Only approved returns can have shipping updated");
    }

    ret.return_shipping_carrier = data.return_shipping_carrier;
    ret.return_tracking_number = data.return_tracking_number;
    ret.return_shipping_cost = data.return_shipping_cost ?? null;
    ret.return_shipping_paid_by = data.return_shipping_paid_by ?? null;
    ret.status = ReturnStatus.shipped_back;

    return this.returnRepo.save(ret);
  }

  /* ================================================================ */
  /*  markReceived                                                    */
  /* ================================================================ */
  async markReceived(returnId: string, vendorId: string, restock: boolean): Promise<Return> {
    const ret = await this.returnRepo.findOne({
      where: { id: returnId } as any,
      relations: ["returnItems", "returnItems.orderItem"],
    });
    if (!ret) throw new NotFoundError("Return not found");
    if (ret.vendor_id !== vendorId) throw new NotFoundError("Return not found");
    if (ret.status !== ReturnStatus.approved && ret.status !== ReturnStatus.shipped_back) {
      throw new BadRequestError("Return must be approved or shipped_back to mark as received");
    }

    ret.received_at = new Date();
    ret.restocked = restock;
    ret.status = ReturnStatus.received;

    // Restock inventory if requested
    if (restock) {
      for (const item of (ret as any).returnItems || []) {
        const orderItem = item.orderItem;
        if (!orderItem) continue;

        const inventory = await this.inventoryRepo.findOne({
          where: {
            product_id: orderItem.product_id,
            variant_id: orderItem.variant_id,
          } as any,
        });

        if (inventory) {
          const qtyBefore = (inventory as any).quantity_on_hand;
          const qtyAfter = qtyBefore + item.quantity;

          const movement = this.inventoryMovementRepo.create({
            inventory_id: (inventory as any).id,
            product_id: orderItem.product_id,
            variant_id: orderItem.variant_id,
            quantity: item.quantity,
            quantity_before: qtyBefore,
            quantity_after: qtyAfter,
            movement_type: "return_restock",
            reference_type: "return",
            reference_id: returnId,
          } as any);
          await this.inventoryMovementRepo.save(movement);

          (inventory as any).quantity_on_hand = qtyAfter;
          await this.inventoryRepo.save(inventory);
        }
      }
    }

    const saved = await this.returnRepo.save(ret);

    // Process refund automatically after receiving
    await this.processRefund(returnId);

    return saved;
  }

  /* ================================================================ */
  /*  processRefund                                                   */
  /* ================================================================ */
  async processRefund(returnId: string): Promise<void> {
    const ret = await this.returnRepo.findOne({
      where: { id: returnId } as any,
      relations: ["returnItems"],
    });
    if (!ret) throw new NotFoundError("Return not found");

    // Idempotency: skip if already refunded
    if (ret.refunded_at) return;

    const refundAmount = ret.refund_amount || 0;

    if (ret.refund_method === "wallet") {
      // SELECT FOR UPDATE on user
      const qb = this.userRepo.createQueryBuilder("user");
      const user = await qb
        .where("user.id = :id", { id: ret.user_id })
        .setLock("pessimistic_write")
        .getOne();

      if (!user) throw new NotFoundError("User not found");

      const balanceBefore = (user as any).wallet_balance;
      const balanceAfter = balanceBefore + refundAmount;

      const walletTx = this.walletTransactionRepo.create({
        user_id: ret.user_id,
        amount: refundAmount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        transaction_type: "refund",
        order_id: ret.order_id,
        reference_type: "return",
        reference_id: returnId,
      } as any);
      await this.walletTransactionRepo.save(walletTx);

      (user as any).wallet_balance = balanceAfter;
      await this.userRepo.save(user);
    } else {
      // Refund to the customer's original payment instrument (card / BNPL).
      // The single sink lives in RefundService — adding a gateway means
      // adding a case there, not here.
      await this.refundService.refundToOriginalPayment({
        orderId: ret.order_id,
        amount: refundAmount,
        referenceType: "return",
        referenceId: returnId,
        reason: "requested_by_customer",
      });
    }

    // Update return status
    ret.refunded_at = new Date();
    ret.status = ReturnStatus.refunded;
    await this.returnRepo.save(ret);

    // Update each order item's refunded_quantity and refunded_amount
    const returnItems = (ret as any).returnItems || [];
    const orderItemIds = returnItems.map((ri: any) => ri.order_item_id);

    if (orderItemIds.length > 0) {
      const orderItems = await this.orderItemRepo.find({
        where: orderItemIds.map((id: string) => ({ id })),
      });

      for (const oi of orderItems) {
        const matchingReturnItem = returnItems.find(
          (ri: any) => ri.order_item_id === (oi as any).id,
        );
        if (matchingReturnItem) {
          (oi as any).refunded_quantity += matchingReturnItem.quantity;
          (oi as any).refunded_amount += matchingReturnItem.refund_amount || 0;
          await this.orderItemRepo.save(oi);
        }
      }

      // Reverse the vendor's commission for each returned item — MUST run
      // after the `refunded_quantity`/`refunded_amount` save loop above,
      // because CommissionReversalService reads those persisted columns to
      // compute the surviving quantity. Calling it before that loop would
      // silently no-op (surviving quantity would read as unchanged).
      //
      // R3-C5: runs on a TRANSACTIONAL manager, not the base one. Passing
      // `this.orderItemRepo.manager` made the reversal a sequence of
      // independent autocommitted statements — and
      // `PayoutService.invalidateDraftForReversal` performs four of them
      // (soft-delete the draft, then release commissions / adjustments /
      // license holds). A failure after the first left the draft deleted
      // while its commissions still carried its `payout_id`: invisible to
      // `computePayoutTotals` (which requires `payout_id IS NULL`) and
      // unreachable by reject/retry/markPaid/markFailed (none of which use
      // `withDeleted`), so the vendor's whole balance for that draft became
      // permanently unpayable while the customer had already been refunded.
      // One transaction makes the soft-delete and the release commit or roll
      // back together.
      await this.orderItemRepo.manager.transaction(async (tx) => {
        await this.commissionReversal.reverseForItems(tx, {
          items: returnItems.map((ri: any) => ({
            orderItemId: ri.order_item_id,
            refundedQuantity: ri.quantity,
            refundedAmount: ri.refund_amount || 0,
          })),
          sourceType: "return",
          sourceId: returnId,
          reason: `Return ${returnId}`,
        });
      });
    }

    // Update order refund_total
    const order = await this.orderRepo.findOne({
      where: { id: ret.order_id } as any,
    });
    if (order) {
      (order as any).refund_total += refundAmount;
      await this.orderRepo.save(order);

      // Determine if fully or partially refunded
      const isFullRefund = (order as any).refund_total >= (order as any).grand_total;
      const newStatus = isFullRefund ? OrderStatus.refunded : OrderStatus.partially_refunded;

      await this.orderStatusService.transitionOrder(ret.order_id, newStatus, {
        userId: "system",
        role: "system",
      });
    }
  }

  /* ================================================================ */
  /*  List / Get helpers                                              */
  /* ================================================================ */
  async listForBuyer(
    userId: string,
    query: PaginatedQuery,
  ): Promise<{ data: Return[]; total: number }> {
    const page = query.page || 1;
    const limit = query.limit || 20;

    const qb = this.returnRepo
      .createQueryBuilder("return")
      .leftJoinAndSelect("return.order", "order")
      .leftJoinAndSelect("return.returnItems", "returnItems")
      .leftJoinAndSelect("returnItems.orderItem", "orderItem")
      .where("return.user_id = :userId", { userId })
      .orderBy("return.created_at", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    if (query.status) {
      qb.andWhere("return.status = :status", { status: query.status });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async getForBuyer(returnId: string, userId: string): Promise<Return | null> {
    return this.returnRepo.findOne({
      where: { id: returnId, user_id: userId } as any,
      relations: ["returnItems", "returnItems.orderItem"],
    });
  }

  async listForAdmin(query: PaginatedQuery): Promise<{ data: Return[]; total: number }> {
    const page = query.page || 1;
    const limit = query.limit || 20;

    const qb = this.returnRepo
      .createQueryBuilder("return")
      .leftJoinAndSelect("return.order", "order")
      .leftJoinAndSelect("return.returnItems", "returnItems")
      .leftJoinAndSelect("returnItems.orderItem", "orderItem")
      .orderBy("return.created_at", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    if (query.status) {
      qb.andWhere("return.status = :status", { status: query.status });
    }
    if (query.vendor_id) {
      qb.andWhere("return.vendor_id = :vendor_id", { vendor_id: query.vendor_id });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async listForVendor(
    vendorId: string,
    query: PaginatedQuery,
  ): Promise<{ data: Return[]; total: number }> {
    const page = query.page || 1;
    const limit = query.limit || 20;

    const qb = this.returnRepo
      .createQueryBuilder("return")
      .leftJoinAndSelect("return.order", "order")
      .leftJoinAndSelect("return.returnItems", "returnItems")
      .leftJoinAndSelect("returnItems.orderItem", "orderItem")
      .where("return.vendor_id = :vendorId", { vendorId })
      .orderBy("return.created_at", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    if (query.status) {
      qb.andWhere("return.status = :status", { status: query.status });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }
}
