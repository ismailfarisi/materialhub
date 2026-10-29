import type { Dispute } from "@materialhub/database";
import type { DisputeMessage } from "@materialhub/database";
import type { Order } from "@materialhub/database";
import type { OrderItem } from "@materialhub/database";
import type { VendorOrder } from "@materialhub/database";
import type { User } from "@materialhub/database";
import type { WalletTransaction } from "@materialhub/database";
import { DisputeStatus, OrderStatus } from "@materialhub/database/src/enums/order.enums.ts";
import type { Queue } from "bullmq";
// dispute.service.ts
import type { Repository } from "typeorm";
import type { CommissionReversalService } from "../commission/commission-reversal.service.ts";
import type { OrderStatusService } from "../order/order-status.service.ts";
import type { RefundService } from "../refund/refund.service.ts";
import { type DisputeItemBalance, distributeDisputeResolution } from "./dispute-reversal-calc.ts";

/* ------------------------------------------------------------------ */
/*  Input types                                                       */
/* ------------------------------------------------------------------ */
interface OpenDisputeInput {
  category: string;
  description: string;
  evidence_urls?: string[];
  vendor_order_id?: string;
}

interface ResolveDisputeInput {
  decision: "buyer" | "seller";
  resolution: string;
  resolution_amount?: number;
  refund_method?: "wallet" | "original_payment";
}

interface AddMessageInput {
  message: string;
  attachment_urls?: string[];
  is_internal?: boolean;
}

interface PaginatedQuery {
  page?: number;
  limit?: number;
  status?: string;
}

/* ------------------------------------------------------------------ */
/*  Service                                                           */
/* ------------------------------------------------------------------ */
export class DisputeService {
  constructor(
    private disputeRepo: Repository<Dispute>,
    private disputeMessageRepo: Repository<DisputeMessage>,
    private orderRepo: Repository<Order>,
    private vendorOrderRepo: Repository<VendorOrder>,
    private userRepo: Repository<User>,
    private walletTransactionRepo: Repository<WalletTransaction>,
    private orderStatusService: OrderStatusService,
    private orderEventQueue: Queue,
    private refundService: RefundService,
    private orderItemRepo: Repository<OrderItem>,
    private commissionReversal: CommissionReversalService,
  ) {}

  /* ================================================================ */
  /*  openDispute                                                     */
  /* ================================================================ */
  async openDispute(orderId: string, userId: string, data: OpenDisputeInput): Promise<Dispute> {
    // 1. Find order, verify ownership
    const order = await this.orderRepo.findOne({
      where: { id: orderId } as any,
    });
    if (!order || (order as any).user_id !== userId) {
      throw new Error("Order not found");
    }

    // 2. Verify status: delivered (or shipped for item_not_received)
    const status = (order as any).status;
    const allowShipped = data.category === "item_not_received" && status === OrderStatus.shipped;
    if (status !== OrderStatus.delivered && !allowShipped) {
      throw new Error("Order must be delivered to open a dispute");
    }

    // 3. Derive vendor_id from vendor orders
    const vendorOrders = await this.vendorOrderRepo.find({
      where: { order_id: orderId } as any,
    });

    let vendorOrderId: string | null = null;
    let vendorId: string;

    if (data.vendor_order_id) {
      const match = vendorOrders.find((vo: any) => vo.id === data.vendor_order_id);
      if (!match) throw new Error("Vendor order not found");
      vendorOrderId = (match as any).id;
      vendorId = (match as any).vendor_id;
    } else if (vendorOrders.length === 1) {
      vendorOrderId = (vendorOrders[0] as any).id;
      vendorId = (vendorOrders[0] as any).vendor_id;
    } else {
      throw new Error("vendor_order_id is required when order has multiple vendors");
    }

    // 4. Generate dispute_number
    const count = await this.disputeRepo.count();
    const year = new Date().getFullYear();
    const disputeNumber = `DSP-${year}-${String(count + 1).padStart(6, "0")}`;

    // 5. Create Dispute
    const deadlineAt = new Date();
    deadlineAt.setDate(deadlineAt.getDate() + 7);

    const dispute = this.disputeRepo.create({
      dispute_number: disputeNumber,
      order_id: orderId,
      vendor_order_id: vendorOrderId,
      vendor_id: vendorId,
      opened_by: userId,
      status: DisputeStatus.opened,
      category: data.category,
      description: data.description,
      evidence_urls: data.evidence_urls || [],
      deadline_at: deadlineAt,
    } as any);
    const saved = (await this.disputeRepo.save(dispute)) as unknown as Dispute;

    // 6. Transition order to disputed
    await this.orderStatusService.transitionOrder(orderId, OrderStatus.disputed, {
      userId: "system",
      role: "system",
    });

    // 7. Enqueue event
    await this.orderEventQueue.add("dispute.opened", {
      type: "dispute.opened",
      disputeId: (saved as any).id,
      orderId,
      userId,
      timestamp: new Date().toISOString(),
    });

    return saved;
  }

  /* ================================================================ */
  /*  assignDispute                                                   */
  /* ================================================================ */
  async assignDispute(disputeId: string, _adminId: string, assigneeId: string): Promise<Dispute> {
    const dispute = await this.disputeRepo.findOne({
      where: { id: disputeId } as any,
    });
    if (!dispute) throw new Error("Dispute not found");
    if (dispute.status !== DisputeStatus.opened) {
      throw new Error("Only opened disputes can be assigned");
    }

    dispute.assigned_to = assigneeId;
    dispute.status = DisputeStatus.under_review;

    return this.disputeRepo.save(dispute);
  }

  /* ================================================================ */
  /*  escalateDispute                                                 */
  /* ================================================================ */
  async escalateDispute(disputeId: string, _adminId: string): Promise<Dispute> {
    const dispute = await this.disputeRepo.findOne({
      where: { id: disputeId } as any,
    });
    if (!dispute) throw new Error("Dispute not found");
    if (dispute.status !== DisputeStatus.under_review) {
      throw new Error("Only under_review disputes can be escalated");
    }

    dispute.escalated_at = new Date();
    dispute.status = DisputeStatus.escalated;

    return this.disputeRepo.save(dispute);
  }

  /* ================================================================ */
  /*  resolveDispute                                                  */
  /* ================================================================ */
  async resolveDispute(
    disputeId: string,
    adminId: string,
    data: ResolveDisputeInput,
  ): Promise<Dispute> {
    const dispute = await this.disputeRepo.findOne({
      where: { id: disputeId } as any,
    });
    if (!dispute) throw new Error("Dispute not found");
    if (
      dispute.status !== DisputeStatus.under_review &&
      dispute.status !== DisputeStatus.escalated
    ) {
      throw new Error("Dispute must be under_review or escalated to resolve");
    }

    dispute.resolution = data.resolution;
    dispute.resolution_amount = data.resolution_amount ?? null;
    dispute.resolved_at = new Date();
    dispute.resolved_by = adminId;

    if (data.decision === "buyer") {
      dispute.status = DisputeStatus.resolved_buyer;

      // Refund: default to wallet (existing behavior) unless caller asks for
      // original_payment. The single sink for card / BNPL refunds lives in
      // RefundService — same one returns use.
      if (data.resolution_amount && data.resolution_amount > 0) {
        if (data.refund_method === "original_payment") {
          await this.refundService.refundToOriginalPayment({
            orderId: dispute.order_id,
            amount: data.resolution_amount,
            referenceType: "dispute",
            referenceId: disputeId,
            reason: "requested_by_customer",
          });
        } else {
          const qb = this.userRepo.createQueryBuilder("user");
          const user = await qb
            .where("user.id = :id", { id: dispute.opened_by })
            .setLock("pessimistic_write")
            .getOne();
          if (!user) throw new Error("User not found");

          const balanceBefore = (user as any).wallet_balance;
          const balanceAfter = balanceBefore + data.resolution_amount;

          const walletTx = this.walletTransactionRepo.create({
            user_id: dispute.opened_by,
            amount: data.resolution_amount,
            balance_before: balanceBefore,
            balance_after: balanceAfter,
            transaction_type: "dispute_refund",
            reference_type: "dispute",
            reference_id: disputeId,
          } as any);
          await this.walletTransactionRepo.save(walletTx);

          (user as any).wallet_balance = balanceAfter;
          await this.userRepo.save(user);
        }

        // Reverse the vendor's commission for the disputed vendor order —
        // MUST run after the refund above (either branch) has actually
        // moved the money, and after `reverseDisputedCommission` persists
        // each order item's `refunded_amount`, since CommissionReversalService
        // reads that column fresh from the DB to compute the surviving
        // quantity. Calling it before the item save would silently no-op.
        await this.reverseDisputedCommission(dispute, disputeId, data.resolution_amount);
      }

      // Transition order to refund_requested
      await this.orderStatusService.transitionOrder(
        dispute.order_id,
        OrderStatus.refund_requested,
        { userId: adminId, role: "admin" },
      );
    } else {
      // seller decision
      dispute.status = DisputeStatus.resolved_seller;

      // Transition order back to delivered
      await this.orderStatusService.transitionOrder(dispute.order_id, OrderStatus.delivered, {
        userId: adminId,
        role: "admin",
      });
    }

    return this.disputeRepo.save(dispute);
  }

  /* ================================================================ */
  /*  reverseDisputedCommission (private helper)                      */
  /* ================================================================ */
  // Disputes have no per-item breakdown (unlike returns — a dispute is
  // opened against a single vendor_order_id, not specific order items), so
  // `resolution_amount` — the money actually returned to the buyer — is
  // distributed across every order item under the disputed vendor_order in
  // proportion to each item's OUTSTANDING balance (line_total minus what it
  // has already had refunded), via the pure `distributeDisputeResolution`
  // helper. A resolution_amount equal to the outstanding total still
  // forfeits everything (preserving the old full-cancel behaviour); a
  // partial resolution (e.g. a goodwill credit) only claws back its actual
  // proportional share, leaving the vendor's earning on the rest intact.
  //
  // This FIRST persists each order item's `refunded_amount` (so the counter
  // update happens before we read it back), THEN calls
  // CommissionReversalService — which re-reads that same column from the
  // DB to compute the surviving quantity/amount. Reversing the order is
  // what turns this into a silent no-op.
  private async reverseDisputedCommission(
    dispute: Dispute,
    disputeId: string,
    resolutionAmount: number | undefined,
  ): Promise<void> {
    if (!resolutionAmount || resolutionAmount <= 0) return;
    const vendorOrderId = (dispute as any).vendor_order_id;
    if (!vendorOrderId) return;

    const items = await this.orderItemRepo.find({
      where: { vendor_order_id: vendorOrderId } as any,
    });
    if (!items || items.length === 0) return;

    const byId = new Map((items as any[]).map((oi) => [oi.id, oi]));
    const balances: DisputeItemBalance[] = (items as any[]).map((oi) => ({
      orderItemId: oi.id,
      outstanding: Math.max(0, oi.line_total - (oi.refunded_amount || 0)),
    }));

    const { shares, distributed, clamped } = distributeDisputeResolution(
      balances,
      resolutionAmount,
    );

    if (clamped) {
      const totalOutstanding = balances.reduce((sum, b) => sum + b.outstanding, 0);
      console.warn(
        `[reverseDisputedCommission] resolution_amount ${resolutionAmount} exceeds outstanding ` +
          `total ${totalOutstanding} for vendor_order ${vendorOrderId} (dispute ${disputeId}); ` +
          `clamping distribution to ${distributed}`,
      );
    }
    if (shares.length === 0 || distributed <= 0) return;

    const reversalItems: Array<{
      orderItemId: string;
      refundedQuantity: number;
      refundedAmount: number;
    }> = [];
    for (const share of shares) {
      if (share.amount <= 0) continue;
      const oi = byId.get(share.orderItemId);
      if (!oi) continue;
      oi.refunded_amount = (oi.refunded_amount || 0) + share.amount;
      await this.orderItemRepo.save(oi);
      reversalItems.push({
        orderItemId: oi.id,
        refundedQuantity: 0,
        refundedAmount: share.amount,
      });
    }
    if (reversalItems.length === 0) return;

    // R3-C5: transactional manager, not the base one — see the identical
    // note in return.service.confirmRefund. `invalidateDraftForReversal`
    // soft-deletes the draft and then releases its claims in separate
    // statements; untransacted, a failure between them strands the vendor's
    // entire balance for that draft permanently (unclaimable and
    // unreachable), with the customer already refunded.
    await this.orderItemRepo.manager.transaction(async (tx) => {
      await this.commissionReversal.reverseForItems(tx, {
        items: reversalItems,
        sourceType: "dispute",
        sourceId: disputeId,
        reason: `Dispute ${disputeId}`,
      });
    });
  }

  /* ================================================================ */
  /*  closeDispute                                                    */
  /* ================================================================ */
  async closeDispute(disputeId: string, _adminId: string): Promise<Dispute> {
    const dispute = await this.disputeRepo.findOne({
      where: { id: disputeId } as any,
    });
    if (!dispute) throw new Error("Dispute not found");
    if (
      dispute.status !== DisputeStatus.resolved_buyer &&
      dispute.status !== DisputeStatus.resolved_seller
    ) {
      throw new Error("Only resolved disputes can be closed");
    }

    dispute.status = DisputeStatus.closed;

    return this.disputeRepo.save(dispute);
  }

  /* ================================================================ */
  /*  addMessage                                                      */
  /* ================================================================ */
  async addMessage(
    disputeId: string,
    senderId: string,
    senderRole: string,
    data: AddMessageInput,
  ): Promise<DisputeMessage> {
    const dispute = await this.disputeRepo.findOne({
      where: { id: disputeId } as any,
    });
    if (!dispute) throw new Error("Dispute not found");
    if (dispute.status === DisputeStatus.closed) {
      throw new Error("Cannot add messages to a closed dispute");
    }

    // is_internal only allowed for admin/super_admin
    const isInternal = data.is_internal ?? false;
    if (isInternal && senderRole !== "admin" && senderRole !== "super_admin") {
      throw new Error("Only admins can send internal messages");
    }

    const message = this.disputeMessageRepo.create({
      dispute_id: disputeId,
      sender_id: senderId,
      sender_role: senderRole,
      message: data.message,
      attachment_urls: data.attachment_urls || [],
      is_internal: isInternal,
    } as any);

    return this.disputeMessageRepo.save(message) as unknown as Promise<DisputeMessage>;
  }

  /* ================================================================ */
  /*  getMessages                                                     */
  /* ================================================================ */
  async getMessages(disputeId: string, role: string): Promise<DisputeMessage[]> {
    const qb = this.disputeMessageRepo
      .createQueryBuilder("msg")
      .where("msg.dispute_id = :disputeId", { disputeId })
      .orderBy("msg.created_at", "ASC");

    const messages = await qb.getMany();

    // Filter out internal messages for non-admin roles
    if (role !== "admin" && role !== "super_admin") {
      return messages.filter((m: any) => !m.is_internal);
    }

    return messages;
  }

  /* ================================================================ */
  /*  List / Get helpers                                              */
  /* ================================================================ */
  async listForBuyer(
    userId: string,
    query: PaginatedQuery,
  ): Promise<{ data: Dispute[]; total: number }> {
    const page = query.page || 1;
    const limit = query.limit || 20;

    const qb = this.disputeRepo
      .createQueryBuilder("dispute")
      .where("dispute.opened_by = :userId", { userId })
      .orderBy("dispute.created_at", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    if (query.status) {
      qb.andWhere("dispute.status = :status", { status: query.status });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async getForBuyer(disputeId: string, userId: string): Promise<Dispute | null> {
    return this.disputeRepo.findOne({
      where: { id: disputeId, opened_by: userId } as any,
    });
  }

  async listForAdmin(query: PaginatedQuery): Promise<{ data: Dispute[]; total: number }> {
    const page = query.page || 1;
    const limit = query.limit || 20;

    const qb = this.disputeRepo
      .createQueryBuilder("dispute")
      .orderBy("dispute.created_at", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    if (query.status) {
      qb.andWhere("dispute.status = :status", { status: query.status });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }
}
