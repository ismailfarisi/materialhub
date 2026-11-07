import type { Dispute } from "@materialhub/database";
import type { DisputeMessage } from "@materialhub/database";
import type { Order } from "@materialhub/database";
import type { OrderItem } from "@materialhub/database";
import type { VendorOrder } from "@materialhub/database";
import type { User } from "@materialhub/database";
import type { WalletTransaction } from "@materialhub/database";
import { DisputeStatus, OrderStatus } from "@materialhub/database/src/enums/order.enums.ts";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@materialhub/plugins";
import type { Queue } from "bullmq";
// dispute.service.ts
import type { EntityManager, Repository } from "typeorm";
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
      throw new NotFoundError("Order not found");
    }

    // 2. Verify status: delivered (or shipped for item_not_received)
    const status = (order as any).status;
    const allowShipped = data.category === "item_not_received" && status === OrderStatus.shipped;
    if (status !== OrderStatus.delivered && !allowShipped) {
      throw new BadRequestError("Order must be delivered to open a dispute");
    }

    // 3. Derive vendor_id from vendor orders
    const vendorOrders = await this.vendorOrderRepo.find({
      where: { order_id: orderId } as any,
    });

    let vendorOrderId: string | null = null;
    let vendorId: string;

    if (data.vendor_order_id) {
      const match = vendorOrders.find((vo: any) => vo.id === data.vendor_order_id);
      if (!match) throw new NotFoundError("Vendor order not found");
      vendorOrderId = (match as any).id;
      vendorId = (match as any).vendor_id;
    } else if (vendorOrders.length === 1) {
      vendorOrderId = (vendorOrders[0] as any).id;
      vendorId = (vendorOrders[0] as any).vendor_id;
    } else {
      throw new BadRequestError("vendor_order_id is required when order has multiple vendors");
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
  /**
   * Assign (or re-assign) a dispute to an admin. The first assignment moves an
   * `opened` dispute into `under_review`; re-assigning an `under_review` or
   * `escalated` dispute only changes the owner. The assignee must be a real
   * admin account — the old UI posted placeholder ids that 400'd on uuid
   * format, and a non-admin uuid would have been stored silently.
   */
  async assignDispute(disputeId: string, _adminId: string, assigneeId: string): Promise<Dispute> {
    const dispute = await this.disputeRepo.findOne({
      where: { id: disputeId } as any,
    });
    if (!dispute) throw new NotFoundError("Dispute not found");
    const assignable = [
      DisputeStatus.opened,
      DisputeStatus.under_review,
      DisputeStatus.escalated,
    ] as DisputeStatus[];
    if (!assignable.includes(dispute.status)) {
      throw new BadRequestError("Only open disputes can be assigned");
    }

    const assignee = await this.userRepo.findOne({ where: { id: assigneeId } as any });
    const assigneeRole = (assignee as any)?.role;
    if (!assignee || (assigneeRole !== "admin" && assigneeRole !== "super_admin")) {
      throw new BadRequestError("Assignee must be an admin user");
    }

    dispute.assigned_to = assigneeId;
    if (dispute.status === DisputeStatus.opened) {
      dispute.status = DisputeStatus.under_review;
    }

    return this.disputeRepo.save(dispute);
  }

  /* ================================================================ */
  /*  escalateDispute                                                 */
  /* ================================================================ */
  async escalateDispute(disputeId: string, _adminId: string): Promise<Dispute> {
    const dispute = await this.disputeRepo.findOne({
      where: { id: disputeId } as any,
    });
    if (!dispute) throw new NotFoundError("Dispute not found");
    if (dispute.status !== DisputeStatus.under_review) {
      throw new BadRequestError("Only under_review disputes can be escalated");
    }

    dispute.escalated_at = new Date();
    dispute.status = DisputeStatus.escalated;

    return this.disputeRepo.save(dispute);
  }

  /* ================================================================ */
  /*  resolveDispute                                                  */
  /* ================================================================ */
  /**
   * Resolve a dispute. Everything that writes money or ledger rows runs in ONE
   * transaction that starts by locking the dispute row (`FOR UPDATE`):
   *
   *   lock dispute -> status check -> item refunded_amount + commission
   *   reversal -> wallet credit (locks the user row) -> save dispute ->
   *   card/BNPL refund (last, see below) -> COMMIT
   *
   * Before this, the wallet branch took `pessimistic_write` on the base
   * manager, which TypeORM refuses outside a transaction ("open transaction
   * is required for pessimistic lock"), so every buyer-favour resolution with
   * an amount 500'd.
   *
   * Idempotency: the row lock serialises concurrent resolves, and a dispute
   * already resolved the same way is returned as-is (no second credit or
   * refund) — a retry after a timeout is safe. Resolving it the OTHER way is a
   * 409. The gateway refund is the last statement inside the transaction, so
   * any earlier failure rolls back with no money moved; the gateway call
   * itself carries a deterministic idempotency key (`refund:dispute:<id>`).
   *
   * The order status transition runs after commit (OrderStatusService owns
   * its own transaction); on a replay it is retried only while the order is
   * still `disputed`, so a retry also completes a transition that failed the
   * first time.
   */
  async resolveDispute(
    disputeId: string,
    adminId: string,
    data: ResolveDisputeInput,
  ): Promise<Dispute> {
    const amount = data.decision === "buyer" ? (data.resolution_amount ?? 0) : 0;

    const { dispute, replay } = await this.disputeRepo.manager.transaction(async (tx) => {
      const disputeRepo = tx.withRepository(this.disputeRepo);
      const locked = await disputeRepo.findOne({
        where: { id: disputeId } as any,
        lock: { mode: "pessimistic_write" },
      });
      if (!locked) throw new NotFoundError("Dispute not found");

      const resolvedAs =
        locked.status === DisputeStatus.resolved_buyer
          ? "buyer"
          : locked.status === DisputeStatus.resolved_seller
            ? "seller"
            : null;
      if (resolvedAs) {
        if (resolvedAs === data.decision) return { dispute: locked, replay: true };
        throw new ConflictError(`Dispute is already resolved in the ${resolvedAs}'s favour`);
      }
      if (
        locked.status !== DisputeStatus.under_review &&
        locked.status !== DisputeStatus.escalated
      ) {
        throw new BadRequestError("Dispute must be under_review or escalated to resolve");
      }

      locked.resolution = data.resolution;
      locked.resolution_amount =
        data.decision === "buyer" ? (data.resolution_amount ?? null) : null;
      locked.resolved_at = new Date();
      locked.resolved_by = adminId;
      locked.status =
        data.decision === "buyer" ? DisputeStatus.resolved_buyer : DisputeStatus.resolved_seller;

      const toOriginalPayment = amount > 0 && data.refund_method === "original_payment";
      if (amount > 0) {
        // Ledger first (item refunded_amount, then the commission reversal
        // that re-reads it — same transaction, so it sees the new value).
        await this.reverseDisputedCommission(tx, locked, disputeId, amount);
        if (!toOriginalPayment) {
          await this.creditWallet(tx, locked, disputeId, amount);
        }
      }

      const saved = await disputeRepo.save(locked);

      if (toOriginalPayment) {
        await this.refundService.refundToOriginalPayment({
          orderId: locked.order_id,
          amount,
          referenceType: "dispute",
          referenceId: disputeId,
          reason: "requested_by_customer",
        });
      }

      return { dispute: saved, replay: false };
    });

    const target =
      dispute.status === DisputeStatus.resolved_buyer
        ? OrderStatus.refund_requested
        : OrderStatus.delivered;
    let shouldTransition = !replay;
    if (replay) {
      const order = await this.orderRepo.findOne({ where: { id: dispute.order_id } as any });
      shouldTransition = (order as any)?.status === OrderStatus.disputed;
    }
    if (shouldTransition) {
      await this.orderStatusService.transitionOrder(dispute.order_id, target, {
        userId: adminId,
        role: "admin",
      });
    }

    return dispute;
  }

  /* ================================================================ */
  /*  creditWallet (private helper)                                   */
  /* ================================================================ */
  /** Wallet credit for a buyer-favour resolution, on the caller's transaction. */
  private async creditWallet(
    tx: EntityManager,
    dispute: Dispute,
    disputeId: string,
    amount: number,
  ): Promise<void> {
    const walletRepo = tx.withRepository(this.walletTransactionRepo);
    // Belt and braces next to the dispute row lock: never credit the same
    // dispute twice, even if a row was left behind by an older code path.
    const existing = await walletRepo.findOne({
      where: {
        reference_type: "dispute",
        reference_id: disputeId,
        transaction_type: "dispute_refund",
      } as any,
    });
    if (existing) return;

    const user = await tx
      .withRepository(this.userRepo)
      .createQueryBuilder("user")
      .where("user.id = :id", { id: dispute.opened_by })
      .setLock("pessimistic_write")
      .getOne();
    if (!user) throw new NotFoundError("Buyer account not found");

    const balanceBefore = Number((user as any).wallet_balance ?? 0);
    const balanceAfter = balanceBefore + amount;

    const walletTx = walletRepo.create({
      user_id: dispute.opened_by,
      order_id: dispute.order_id,
      amount,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      transaction_type: "dispute_refund",
      reference_type: "dispute",
      reference_id: disputeId,
      description: `Dispute ${(dispute as any).dispute_number ?? disputeId} resolved in your favour`,
    } as any);
    await walletRepo.save(walletTx);

    (user as any).wallet_balance = balanceAfter;
    await tx.withRepository(this.userRepo).save(user);
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
    tx: EntityManager,
    dispute: Dispute,
    disputeId: string,
    resolutionAmount: number | undefined,
  ): Promise<void> {
    if (!resolutionAmount || resolutionAmount <= 0) return;
    const vendorOrderId = (dispute as any).vendor_order_id;
    if (!vendorOrderId) return;

    const itemRepo = tx.withRepository(this.orderItemRepo);
    const items = await itemRepo.find({
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
      await itemRepo.save(oi);
      reversalItems.push({
        orderItemId: oi.id,
        refundedQuantity: 0,
        refundedAmount: share.amount,
      });
    }
    if (reversalItems.length === 0) return;

    // R3-C5: transactional manager, not the base one — the caller's
    // resolve transaction. `invalidateDraftForReversal` soft-deletes the
    // draft and then releases its claims in separate statements; it must
    // commit or roll back together with the refund that caused it.
    await this.commissionReversal.reverseForItems(tx, {
      items: reversalItems,
      sourceType: "dispute",
      sourceId: disputeId,
      reason: `Dispute ${disputeId}`,
    });
  }

  /* ================================================================ */
  /*  closeDispute                                                    */
  /* ================================================================ */
  async closeDispute(disputeId: string, _adminId: string): Promise<Dispute> {
    const dispute = await this.disputeRepo.findOne({
      where: { id: disputeId } as any,
    });
    if (!dispute) throw new NotFoundError("Dispute not found");
    if (
      dispute.status !== DisputeStatus.resolved_buyer &&
      dispute.status !== DisputeStatus.resolved_seller
    ) {
      throw new BadRequestError("Only resolved disputes can be closed");
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
    if (!dispute) throw new NotFoundError("Dispute not found");
    if (dispute.status === DisputeStatus.closed) {
      throw new BadRequestError("Cannot add messages to a closed dispute");
    }

    // is_internal only allowed for admin/super_admin
    const isInternal = data.is_internal ?? false;
    if (isInternal && senderRole !== "admin" && senderRole !== "super_admin") {
      throw new ForbiddenError("Only admins can send internal messages");
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
  /*  assertParticipant                                               */
  /* ================================================================ */
  /**
   * Resolve a dispute for a caller on the shared /disputes/:id/messages
   * thread. Admins see any dispute; a customer only the disputes they
   * opened. A customer asking for someone else's dispute gets the SAME
   * NotFound as a non-existent id, so existence is not leaked.
   */
  async assertParticipant(disputeId: string, userId: string, role: string): Promise<Dispute> {
    const dispute = await this.disputeRepo.findOne({
      where: { id: disputeId } as any,
    });
    if (!dispute) throw new NotFoundError("Dispute not found");
    if (role === "admin" || role === "super_admin") return dispute;
    if (role === "customer" && (dispute as any).opened_by === userId) return dispute;
    throw new NotFoundError("Dispute not found");
  }

  /**
   * The vendor side of the thread: only the supplier the dispute is against
   * (`dispute.vendor_id`, resolved from the caller's active vendor
   * membership) may read or post. Anything else is the same 404 as an
   * unknown id.
   */
  async assertVendorParticipant(disputeId: string, vendorId: string): Promise<Dispute> {
    const dispute = await this.disputeRepo.findOne({
      where: { id: disputeId } as any,
    });
    if (!dispute || (dispute as any).vendor_id !== vendorId) {
      throw new NotFoundError("Dispute not found");
    }
    return dispute;
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
    query: PaginatedQuery & { order_id?: string },
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
    if (query.order_id) {
      qb.andWhere("dispute.order_id = :orderId", { orderId: query.order_id });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async getForBuyer(disputeId: string, userId: string): Promise<Dispute | null> {
    return this.disputeRepo.findOne({
      where: { id: disputeId, opened_by: userId } as any,
    });
  }

  /** Disputes raised against one supplier, newest first. */
  async listForVendor(
    vendorId: string,
    query: PaginatedQuery & { order_id?: string },
  ): Promise<{ data: DisputeSummary[]; total: number }> {
    const page = query.page || 1;
    const limit = query.limit || 20;

    const qb = this.summaryQuery()
      .where("dispute.vendor_id = :vendorId", { vendorId })
      .orderBy("dispute.created_at", "DESC")
      .skip((page - 1) * limit)
      .take(limit);
    if (query.status) qb.andWhere("dispute.status = :status", { status: query.status });
    if (query.order_id) qb.andWhere("dispute.order_id = :orderId", { orderId: query.order_id });

    const [rows, total] = await qb.getManyAndCount();
    return { data: rows.map((d) => toDisputeSummary(d, "vendor")), total };
  }

  async getForVendor(disputeId: string, vendorId: string): Promise<DisputeSummary> {
    const dispute = await this.summaryQuery()
      .where("dispute.id = :disputeId", { disputeId })
      .andWhere("dispute.vendor_id = :vendorId", { vendorId })
      .getOne();
    if (!dispute) throw new NotFoundError("Dispute not found");
    return toDisputeSummary(dispute, "vendor");
  }

  async listForAdmin(
    query: PaginatedQuery & { assigned_to?: string },
  ): Promise<{ data: DisputeSummary[]; total: number }> {
    const page = query.page || 1;
    const limit = query.limit || 20;

    const qb = this.summaryQuery()
      .orderBy("dispute.created_at", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    if (query.status) {
      qb.andWhere("dispute.status = :status", { status: query.status });
    }
    if (query.assigned_to) {
      qb.andWhere("dispute.assigned_to = :assignedTo", { assignedTo: query.assigned_to });
    }

    const [rows, total] = await qb.getManyAndCount();
    return { data: rows.map((d) => toDisputeSummary(d, "admin")), total };
  }

  /** GET /admin/disputes/:id — the case file plus the full thread (internal notes included). */
  async getForAdmin(disputeId: string): Promise<DisputeSummary & { messages: DisputeMessage[] }> {
    const dispute = await this.summaryQuery()
      .where("dispute.id = :disputeId", { disputeId })
      .getOne();
    if (!dispute) throw new NotFoundError("Dispute not found");
    const messages = await this.getMessages(disputeId, "admin");
    return { ...toDisputeSummary(dispute, "admin"), messages };
  }

  /**
   * Dispute plus the display fields of its order, vendor order, supplier,
   * buyer and assignee. Only named columns are selected from the joined
   * users: a plain leftJoinAndSelect would ship password hashes and wallet
   * balances to the panel.
   */
  private summaryQuery() {
    return this.disputeRepo
      .createQueryBuilder("dispute")
      .leftJoin("dispute.order", "order")
      .addSelect([
        "order.id",
        "order.order_number",
        "order.status",
        "order.grand_total",
        "order.refund_total",
        "order.currency",
      ])
      .leftJoin("dispute.vendorOrder", "vendorOrder")
      .addSelect([
        "vendorOrder.id",
        "vendorOrder.vendor_order_number",
        "vendorOrder.status",
        "vendorOrder.vendor_total",
      ])
      .leftJoin("dispute.vendor", "vendor")
      .addSelect(["vendor.id", "vendor.name"])
      .leftJoin("dispute.openedByUser", "buyer")
      .addSelect(["buyer.id", "buyer.first_name", "buyer.last_name", "buyer.email"])
      .leftJoin("dispute.assignedToUser", "assignee")
      .addSelect(["assignee.id", "assignee.first_name", "assignee.last_name", "assignee.email"]);
  }
}

/* ------------------------------------------------------------------ */
/*  Response shape                                                    */
/* ------------------------------------------------------------------ */
export interface DisputeSummary {
  id: string;
  dispute_number: string;
  status: string;
  category: string;
  description: string;
  evidence_urls: string[];
  order_id: string;
  order_number: string | null;
  order_status: string | null;
  order_total: number | null;
  order_refund_total: number | null;
  currency: string;
  vendor_order_id: string | null;
  vendor_order_number: string | null;
  vendor_order_total: number | null;
  vendor_id: string;
  vendor_name: string | null;
  opened_by?: string;
  buyer_name?: string | null;
  buyer_email?: string | null;
  assigned_to?: string | null;
  assigned_to_name?: string | null;
  resolution: string | null;
  resolution_amount: number | null;
  resolved_at: Date | null;
  escalated_at: Date | null;
  deadline_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function personName(p: any): string | null {
  if (!p) return null;
  const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
  return name || p.email || null;
}

/**
 * Flatten a dispute row (with the joins from `summaryQuery`) for the panels.
 * The vendor view leaves out the buyer's email and the admin assignee: a
 * supplier sees the buyer's name only, as on its order screens.
 */
export function toDisputeSummary(d: any, audience: "admin" | "vendor"): DisputeSummary {
  const base: DisputeSummary = {
    id: d.id,
    dispute_number: d.dispute_number,
    status: d.status,
    category: d.category,
    description: d.description,
    evidence_urls: d.evidence_urls ?? [],
    order_id: d.order_id,
    order_number: d.order?.order_number ?? null,
    order_status: d.order?.status ?? null,
    order_total: d.order?.grand_total ?? null,
    order_refund_total: d.order?.refund_total ?? null,
    currency: d.order?.currency ?? "AED",
    vendor_order_id: d.vendor_order_id ?? null,
    vendor_order_number: d.vendorOrder?.vendor_order_number ?? null,
    vendor_order_total: d.vendorOrder?.vendor_total ?? null,
    vendor_id: d.vendor_id,
    vendor_name: d.vendor?.name ?? null,
    resolution: d.resolution ?? null,
    resolution_amount: d.resolution_amount ?? null,
    resolved_at: d.resolved_at ?? null,
    escalated_at: d.escalated_at ?? null,
    deadline_at: d.deadline_at ?? null,
    created_at: d.created_at,
    updated_at: d.updated_at,
  };
  if (audience === "vendor") {
    return { ...base, buyer_name: d.openedByUser?.first_name ?? null };
  }
  return {
    ...base,
    opened_by: d.opened_by,
    buyer_name: personName(d.openedByUser),
    buyer_email: d.openedByUser?.email ?? null,
    assigned_to: d.assigned_to ?? null,
    assigned_to_name: personName(d.assignedToUser),
  };
}
