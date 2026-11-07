// refund.service.ts
import type { Payment } from "@materialhub/database";
import type Stripe from "stripe";
import type { Repository } from "typeorm";

export interface RefundToOriginalPaymentInput {
  orderId: string;
  amount: number;
  referenceType: "return" | "dispute" | "order_cancellation" | "item_cancellation";
  referenceId: string;
  reason?: string;
}

export interface RefundResult {
  gateway: string;
  gatewayRefundId: string;
  amount: number;
}

/**
 * Single sink for "refund money back to the customer's original payment
 * instrument". Looks up the captured Payment row for the order, dispatches
 * to the right gateway, and updates `payments.refunded_amount` / `refunded_at`.
 *
 * Adding a new provider (Tabby / Tamara / Checkout.com) is a single new case
 * branch in `refundToOriginalPayment` — every refund entry point (returns,
 * disputes) already routes through here.
 *
 * Wallet refunds are NOT this service's job — the callers handle wallet
 * credits directly via WalletTransaction since those are internal ledger
 * movements rather than external gateway calls.
 */
export class RefundService {
  constructor(
    private paymentRepo: Repository<Payment>,
    private stripe: Stripe | null,
  ) {}

  /**
   * Gateway of the order's captured payment ("stripe", "cod", ...), or null
   * when nothing is captured. Callers use it to route a refund that cannot go
   * back to an instrument — cash on delivery has none — to the wallet instead
   * of failing in `refundToOriginalPayment`.
   */
  async getCapturedGateway(orderId: string): Promise<string | null> {
    const payment = await this.paymentRepo.findOne({
      where: { order_id: orderId, status: "captured" } as any,
    });
    return payment ? ((payment as any).gateway as string) : null;
  }

  async refundToOriginalPayment(input: RefundToOriginalPaymentInput): Promise<RefundResult> {
    const payment = await this.paymentRepo.findOne({
      where: { order_id: input.orderId, status: "captured" } as any,
    });
    if (!payment) {
      throw new Error(`No captured payment found for order ${input.orderId}`);
    }

    const priorRefunded = (payment as any).refunded_amount || 0;
    if (priorRefunded + input.amount > (payment as any).amount) {
      throw new Error(
        `Refund amount ${input.amount} exceeds remaining refundable balance ` +
          `(${(payment as any).amount - priorRefunded}) for order ${input.orderId}`,
      );
    }

    return this.executeGatewayRefund(
      payment,
      priorRefunded,
      input.amount,
      input.referenceType,
      input.referenceId,
      {
        order_id: input.orderId,
        reference_type: input.referenceType,
        reference_id: input.referenceId,
      },
      input.reason,
    );
  }

  /**
   * Shared gateway dispatch: given an already-validated captured Payment
   * row, issue the refund with the right provider and update
   * `refunded_amount`/`refunded_at`. `refundToOriginalPayment` validates its
   * own preconditions (existence, remaining balance) before calling this —
   * this method assumes they hold.
   */
  private async executeGatewayRefund(
    payment: Payment,
    priorRefunded: number,
    amount: number,
    referenceType: string,
    referenceId: string,
    metadata: Record<string, string>,
    reason?: string,
  ): Promise<RefundResult> {
    // Deterministic key — Stripe matches retries by this and returns the
    // original refund instead of creating a duplicate. Tabby / Tamara should
    // do the same when implemented.
    const idempotencyKey = `refund:${referenceType}:${referenceId}`;

    const gateway = (payment as any).gateway as string;
    let gatewayRefundId: string;

    switch (gateway) {
      case "stripe": {
        if (!this.stripe) {
          throw new Error("Stripe SDK is not configured — cannot refund");
        }
        const refund = await this.stripe.refunds.create(
          {
            payment_intent: (payment as any).gateway_payment_id,
            amount,
            reason: (reason as any) || "requested_by_customer",
            metadata,
          },
          { idempotencyKey },
        );
        gatewayRefundId = refund.id;
        break;
      }
      case "tabby":
        throw new Error("Tabby refunds not implemented yet");
      case "tamara":
        throw new Error("Tamara refunds not implemented yet");
      case "checkout_com":
        throw new Error("Checkout.com refunds not implemented yet");
      case "cod":
        throw new Error("Cannot refund COD payment to card — use wallet refund instead");
      default:
        throw new Error(`Unknown payment gateway: ${gateway}`);
    }

    (payment as any).refunded_amount = priorRefunded + amount;
    (payment as any).refunded_at = new Date();
    if (reason) {
      (payment as any).refund_reason = reason;
    }
    await this.paymentRepo.save(payment);

    return {
      gateway,
      gatewayRefundId,
      amount,
    };
  }
}
