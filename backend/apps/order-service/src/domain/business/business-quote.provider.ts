// business-quote.provider.ts — the business add-on to the checkout quote:
// the net_terms payment method and the `business` block.
import type { BusinessQuoteProvider } from "../checkout/quote/quote.service.ts";
import { needsApproval } from "./business-context.ts";
import { NET_TERMS_REASON_KEYS, type NetTermsService } from "./net-terms.service.ts";
import type { OrderApprovalService } from "./order-approval.service.ts";

export class BusinessQuote implements BusinessQuoteProvider {
  constructor(
    private netTerms: NetTermsService,
    private approvals: OrderApprovalService,
  ) {}

  async forQuote(input: {
    userId: string;
    goodsTotalFils: number;
    grandTotalFils: number;
    cartHash: string;
  }) {
    const ctx = await this.netTerms.context(input.userId);
    if (!ctx) return { paymentMethod: null, business: null };

    const approvalRequired = needsApproval(ctx, input.goodsTotalFils);
    const approval = approvalRequired
      ? await this.approvals.latestForCart(input.userId, input.cartHash)
      : null;

    // Offer "Pay on invoice" only to businesses that have (or had) approved
    // terms; never advertise it to accounts that never applied.
    let paymentMethod = null;
    const credit = ctx.credit;
    const eligibility = this.netTerms.eligibility(ctx, input.grandTotalFils);
    if (credit && (credit.status === "approved" || credit.status === "suspended")) {
      paymentMethod = {
        id: "net_terms",
        available: eligibility.ok,
        surcharge_fils: 0,
        surcharge_type: "fixed" as const,
        max_amount_fils: eligibility.availableFils,
        reason_key: eligibility.ok ? null : NET_TERMS_REASON_KEYS[eligibility.reason],
        reason_params: eligibility.ok
          ? null
          : {
              available: {
                value: eligibility.availableFils,
                type: "money" as const,
                currency: "AED",
              },
              terms: { value: credit.terms, type: "string" as const },
            },
      };
    }

    return {
      paymentMethod,
      business: {
        legal_name: ctx.legalName,
        trn: ctx.trn,
        billing_address: ctx.billingAddress,
        role: ctx.role,
        verification_status: ctx.verificationStatus,
        approval_threshold_fils: ctx.approvalThresholdFils,
        approval_required: approvalRequired && approval?.status !== "approved",
        approval,
        net_terms:
          credit && credit.status === "approved"
            ? {
                terms: credit.terms,
                status: credit.status,
                credit_limit_fils: credit.creditLimitFils,
                available_fils: eligibility.availableFils,
              }
            : null,
      },
    };
  }
}
