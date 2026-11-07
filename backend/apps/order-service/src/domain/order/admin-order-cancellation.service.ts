import type {
  Order,
  Payment,
  Shipment,
  User,
  Vendor,
  VendorCarrierAccount,
  WalletTransaction,
} from "@materialhub/database";
import { PaymentStatus, ShipmentStatus } from "@materialhub/database/src/enums.ts";
import type { EncryptionService } from "@materialhub/utils";
import type { FindOptionsWhere, Repository } from "typeorm";
import type { RefundService } from "../refund/refund.service.ts";
import { resolveShippingAccount } from "../shipment/auto-shipment.job.ts";
import type { ShipmentTrackingService } from "../shipment/shipment-tracking.service.ts";
import type { ShippingProviderRegistry } from "../shipment/shipping-provider-adapter.ts";
import type { OrderStatusService } from "./order-status.service.ts";

interface AdminCancelInput {
  reason: string;
  refund?: boolean;
  cancel_fulfillment?: boolean;
}

interface CancelledShipmentSummary {
  shipment_id: string;
  carrier: string | null;
  carrier_cancelled: boolean;
  pickup_cancelled: boolean;
}

const TERMINAL_SHIPMENT_STATUSES = new Set<ShipmentStatus>([
  ShipmentStatus.delivered,
  ShipmentStatus.cancelled,
  ShipmentStatus.returned,
]);

export class AdminOrderCancellationService {
  constructor(
    private orderRepo: Repository<Order>,
    private shipmentRepo: Repository<Shipment>,
    private vendorRepo: Repository<Vendor>,
    private accountRepo: Repository<VendorCarrierAccount>,
    private orderStatusService: OrderStatusService,
    private shipmentTrackingService: ShipmentTrackingService,
    private refundService: RefundService,
    private registry: ShippingProviderRegistry,
    private encryption: EncryptionService,
    private paymentRepo: Repository<Payment>,
    private userRepo: Repository<User>,
    private walletTransactionRepo: Repository<WalletTransaction>,
  ) {}

  async cancelOrderAsAdmin(orderId: string, adminId: string, input: AdminCancelInput) {
    const reason = input.reason.trim();
    if (!reason) throw new Error("Cancellation reason is required");

    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new Error("Order not found");

    const cancelledShipments = input.cancel_fulfillment
      ? await this.cancelActiveShipments(orderId, adminId, reason)
      : [];

    const cancelledOrder = await this.orderStatusService.cancelOrder(
      orderId,
      { userId: adminId, role: "admin" },
      reason,
    );

    const refund = input.refund ? await this.refundRemainingOrderAmount(orderId, reason) : null;

    return {
      order: cancelledOrder,
      refund,
      cancelled_shipments: cancelledShipments,
    };
  }

  private async refundRemainingOrderAmount(orderId: string, reason: string) {
    // Re-load the order fresh: `cancelOrder` already flipped its status to
    // `cancelled` in the DB, so mutating (and saving) a pre-cancel snapshot
    // here would clobber that status back.
    const order = await this.orderRepo.findOne({
      where: { id: orderId } as FindOptionsWhere<Order>,
    });
    if (!order) return null;

    const alreadyRefunded = Number(order.refund_total ?? 0);
    const grandTotal = Number(order.grand_total ?? 0);
    const amount = Math.max(0, grandTotal - alreadyRefunded);
    if (amount <= 0) return null;

    const payment = await this.paymentRepo.findOne({
      where: { order_id: orderId } as FindOptionsWhere<Payment>,
      order: { created_at: "DESC" } as any,
    });

    // COD has no card/BNPL instrument to refund to. Cash only exists to refund
    // once the courier collected it — which is exactly when the COD payment is
    // marked `captured` on delivery. Not captured ⇒ nothing was ever paid ⇒
    // nothing to refund. Captured ⇒ credit it back to the customer's wallet.
    // Net terms: nothing was paid until an admin marks the receivable paid.
    // Unpaid ⇒ the credit is released by the cancellation hook, no refund.
    // Paid ⇒ the buyer paid by bank transfer; refund the same way, manually.
    if (payment?.gateway === "net_terms") {
      if (payment.status !== PaymentStatus.captured) return null;
      order.admin_notes = appendAdminNote(
        order.admin_notes,
        `Net-terms order cancelled after payment: refund AED ${(amount / 100).toFixed(2)} by bank transfer (${reason})`,
      );
      await this.orderRepo.save(order);
      return { manual: true, method: "bank_transfer", amount };
    }
    if ((payment as any)?.gateway === "cod") {
      const collected = (payment as any).status === "captured";
      if (!collected) return null;
      return this.refundCodToWallet(order, amount, reason);
    }

    const result = await this.refundService.refundToOriginalPayment({
      orderId,
      amount,
      referenceType: "order_cancellation",
      referenceId: orderId,
      reason: "requested_by_customer",
    });

    order.refund_total = alreadyRefunded + amount;
    order.payment_status =
      order.refund_total >= grandTotal ? PaymentStatus.refunded : PaymentStatus.partially_refunded;
    order.admin_notes = appendAdminNote(order.admin_notes, `Cancellation refund issued: ${reason}`);
    await this.orderRepo.save(order);

    return result;
  }

  // Credits the customer's wallet with `amount`. Mirrors the wallet-refund
  // ledger movement in ReturnService.processRefund — a pessimistic lock on the
  // user row keeps the balance snapshot consistent under concurrent credits.
  private async refundCodToWallet(order: Order, amount: number, reason: string) {
    const alreadyRefunded = Number(order.refund_total ?? 0);
    const grandTotal = Number(order.grand_total ?? 0);

    // One transaction: a pessimistic lock needs one (outside it TypeORM
    // throws "open transaction is required for pessimistic lock", a 500), and
    // the ledger row, balance and order totals must commit together.
    const walletTx = await this.userRepo.manager.transaction(async (m) => {
      const userRepo = m.getRepository(this.userRepo.target);
      const walletRepo = m.getRepository(this.walletTransactionRepo.target);
      const orderRepo = m.getRepository(this.orderRepo.target);

      const user = await userRepo
        .createQueryBuilder("user")
        .where("user.id = :id", { id: (order as any).user_id })
        .setLock("pessimistic_write")
        .getOne();
      if (!user) throw new Error("User not found for wallet refund");

      const balanceBefore = Number((user as any).wallet_balance ?? 0);
      const balanceAfter = balanceBefore + amount;

      const tx = walletRepo.create({
        user_id: (order as any).user_id,
        amount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        transaction_type: "refund",
        order_id: order.id,
        reference_type: "order_cancellation",
        reference_id: order.id,
      } as any);
      await walletRepo.save(tx);

      (user as any).wallet_balance = balanceAfter;
      await userRepo.save(user);

      order.refund_total = alreadyRefunded + amount;
      order.payment_status =
        order.refund_total >= grandTotal
          ? PaymentStatus.refunded
          : PaymentStatus.partially_refunded;
      order.admin_notes = appendAdminNote(
        order.admin_notes,
        `Cancellation wallet refund issued: ${reason}`,
      );
      await orderRepo.save(order);
      return tx;
    });

    return {
      gateway: "wallet",
      gatewayRefundId: (walletTx as any).id,
      amount,
    };
  }

  private async cancelActiveShipments(
    orderId: string,
    adminId: string,
    reason: string,
  ): Promise<CancelledShipmentSummary[]> {
    const shipments = await this.shipmentRepo.find({
      where: { order_id: orderId } as FindOptionsWhere<Shipment>,
    });
    const summaries: CancelledShipmentSummary[] = [];

    for (const shipment of shipments) {
      if (TERMINAL_SHIPMENT_STATUSES.has(shipment.status)) continue;

      const carrier = String(shipment.carrier ?? "").toLowerCase();
      let carrierCancelled = false;
      let pickupCancelled = false;

      if (carrier === "postaplus") {
        const creds = await this.resolveCarrierCredentials(shipment.vendor_id);
        const adapter = this.registry.get("postaplus");
        if (!adapter?.cancelShipment) {
          throw new Error("PostaPlus shipment cancellation is not supported");
        }
        const trackingNumber = shipment.external_shipment_id ?? shipment.tracking_number;
        if (trackingNumber) {
          await adapter.cancelShipment({ trackingNumber, reason }, creds);
          carrierCancelled = true;
        }
        const pickupCode = shipment.pickup_code;
        if (pickupCode) {
          if (!adapter.cancelPickup)
            throw new Error("PostaPlus pickup cancellation is not supported");
          await adapter.cancelPickup({ pickupCode, reason }, creds);
          pickupCancelled = true;
        }
      }

      await this.shipmentTrackingService.transitionShipmentStatus(
        shipment.id,
        { userId: adminId, role: "admin" },
        ShipmentStatus.cancelled,
        reason,
        {
          carrier_cancelled: carrierCancelled,
          pickup_cancelled: pickupCancelled,
          carrier: shipment.carrier ?? null,
        },
      );

      summaries.push({
        shipment_id: shipment.id,
        carrier: shipment.carrier ?? null,
        carrier_cancelled: carrierCancelled,
        pickup_cancelled: pickupCancelled,
      });
    }

    return summaries;
  }

  private async resolveCarrierCredentials(vendorId: string): Promise<Record<string, string>> {
    const vendor = await this.vendorRepo.findOne({
      where: { id: vendorId },
    });
    const account = await resolveShippingAccount(this.accountRepo, vendor);
    if (!account) {
      throw new Error("No usable PostaPlus account found for shipment cancellation");
    }
    if (account.provider?.code !== "postaplus") {
      throw new Error("Resolved carrier account is not PostaPlus");
    }
    return this.encryption.decryptObject<Record<string, string>>(account.credentials_encrypted);
  }
}

function appendAdminNote(existing: string | null | undefined, note: string): string {
  return existing ? `${existing}\n${note}` : note;
}
