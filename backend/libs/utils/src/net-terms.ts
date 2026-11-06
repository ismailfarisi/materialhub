/**
 * Net terms ("pay on invoice") rules, shared by checkout (order-service) and
 * the business account views (auth-service). Pure: no I/O.
 */

export type NetTerms = "net_30" | "net_60";

export const NET_TERMS_DAYS: Record<NetTerms, number> = { net_30: 30, net_60: 60 };

export function isNetTerms(v: unknown): v is NetTerms {
  return v === "net_30" || v === "net_60";
}

export function availableCreditFils(limitFils: number, outstandingFils: number): number {
  return Math.max(0, Math.trunc(limitFils) - Math.trunc(outstandingFils));
}

export type NetTermsBlockReason =
  | "no_business"
  | "not_verified"
  | "not_approved"
  | "overdue"
  | "over_credit"
  | "invalid_amount";

export interface NetTermsEligibilityInput {
  /** null when the user is not an active member of a business account. */
  verificationStatus: string | null;
  /** null when the business never applied for net terms. */
  creditStatus: string | null;
  creditLimitFils: number;
  outstandingFils: number;
  /** Unpaid net-terms orders past their due date. */
  overdueCount: number;
  /** The order total to put on terms (fils, VAT inclusive). */
  amountFils: number;
}

export type NetTermsEligibility =
  | { ok: true; availableFils: number }
  | { ok: false; reason: NetTermsBlockReason; availableFils: number };

/**
 * Order of checks matters for the message the buyer sees: account state
 * first, then overdue invoices (a hard stop even with credit left), then the
 * amount against the remaining credit.
 */
export function checkNetTermsEligibility(input: NetTermsEligibilityInput): NetTermsEligibility {
  const availableFils = availableCreditFils(input.creditLimitFils, input.outstandingFils);
  if (input.verificationStatus === null) return { ok: false, reason: "no_business", availableFils };
  if (input.verificationStatus !== "verified")
    return { ok: false, reason: "not_verified", availableFils };
  if (input.creditStatus !== "approved")
    return { ok: false, reason: "not_approved", availableFils };
  if (input.overdueCount > 0) return { ok: false, reason: "overdue", availableFils };
  if (!Number.isInteger(input.amountFils) || input.amountFils <= 0)
    return { ok: false, reason: "invalid_amount", availableFils };
  if (input.amountFils > availableFils) return { ok: false, reason: "over_credit", availableFils };
  return { ok: true, availableFils };
}

/** Due date = confirmation time + 30/60 calendar days. */
export function netTermsDueDate(confirmedAt: Date, terms: NetTerms): Date {
  return new Date(confirmedAt.getTime() + NET_TERMS_DAYS[terms] * 24 * 60 * 60 * 1000);
}

/** Whole days past due (0 when not yet due). */
export function daysOverdue(dueAt: Date, now: Date = new Date()): number {
  const ms = now.getTime() - dueAt.getTime();
  return ms <= 0 ? 0 : Math.floor(ms / (24 * 60 * 60 * 1000));
}

export type ReceivableStatus = "due" | "overdue" | "paid";

export function receivableStatus(
  paymentStatus: string,
  dueAt: Date | null,
  now: Date = new Date(),
): ReceivableStatus {
  if (paymentStatus === "captured") return "paid";
  if (dueAt && dueAt.getTime() < now.getTime()) return "overdue";
  return "due";
}

/**
 * SQL predicate (alias `o` = orders) for "unpaid net-terms order past its due
 * date". Shared so every count of overdue receivables uses one definition.
 */
export const OVERDUE_NET_TERMS_SQL = `o.payment_terms IS NOT NULL
  AND o.payment_status <> 'captured'
  AND o.status NOT IN ('cancelled', 'refunded')
  AND o.payment_due_at IS NOT NULL
  AND o.payment_due_at < now()
  AND o.deleted_at IS NULL`;
