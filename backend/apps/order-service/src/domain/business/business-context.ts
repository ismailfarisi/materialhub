// business-context.ts — what checkout needs to know about the buyer's
// business account: membership, verification, approval limit and net terms.
import { OVERDUE_NET_TERMS_SQL } from "@materialhub/utils";
import type { EntityManager } from "typeorm";

export interface BusinessContext {
  businessAccountId: string;
  memberId: string;
  role: "admin" | "approver" | "buyer";
  legalName: string;
  tradeName: string | null;
  trn: string | null;
  peppolId: string | null;
  tradeLicenceNumber: string;
  tradeLicenceIssuer: string | null;
  billingAddress: Record<string, unknown>;
  verificationStatus: string;
  approvalThresholdFils: number | null;
  credit: {
    status: string;
    terms: "net_30" | "net_60";
    creditLimitFils: number;
    outstandingFils: number;
  } | null;
  overdueCount: number;
}

/**
 * Load the caller's active business membership. Returns null for ordinary
 * (retail) buyers. Raw SQL keeps order-service free of auth-service code; the
 * tables are shared through @materialhub/database.
 */
export async function loadBusinessContext(
  manager: EntityManager,
  userId: string,
): Promise<BusinessContext | null> {
  const rows = await manager.query(
    `SELECT m.id AS member_id, m.role, b.id AS business_account_id, b.legal_name, b.trade_name,
            b.trn, b.peppol_participant_id, b.trade_licence_number, b.trade_licence_issuer,
            b.billing_address, b.verification_status, b.approval_threshold_fils,
            c.status AS credit_status, c.terms AS credit_terms,
            c.credit_limit_fils, c.outstanding_fils
       FROM business_members m
       JOIN business_accounts b ON b.id = m.business_account_id AND b.deleted_at IS NULL
       LEFT JOIN business_credit_accounts c ON c.business_account_id = b.id
      WHERE m.user_id = $1 AND m.status = 'active'
      LIMIT 1`,
    [userId],
  );
  const r = rows?.[0];
  if (!r) return null;
  const overdue = await manager.query(
    `SELECT COUNT(*)::int AS count FROM orders o
      WHERE o.business_account_id = $1 AND ${OVERDUE_NET_TERMS_SQL}`,
    [r.business_account_id],
  );
  return {
    businessAccountId: r.business_account_id,
    memberId: r.member_id,
    role: r.role,
    legalName: r.legal_name,
    tradeName: r.trade_name ?? null,
    trn: r.trn ?? null,
    peppolId: r.peppol_participant_id ?? null,
    tradeLicenceNumber: r.trade_licence_number,
    tradeLicenceIssuer: r.trade_licence_issuer ?? null,
    billingAddress: r.billing_address ?? {},
    verificationStatus: r.verification_status,
    approvalThresholdFils:
      r.approval_threshold_fils === null || r.approval_threshold_fils === undefined
        ? null
        : Number(r.approval_threshold_fils),
    credit: r.credit_status
      ? {
          status: r.credit_status,
          terms: r.credit_terms,
          creditLimitFils: Number(r.credit_limit_fils ?? 0),
          outstandingFils: Number(r.outstanding_fils ?? 0),
        }
      : null,
    overdueCount: Number(overdue?.[0]?.count ?? 0),
  };
}

/**
 * Does this order need an approver's sign-off? Only `buyer` members, only
 * when the business set a limit, only above it. Admins and approvers never
 * need approval for their own orders.
 */
export function needsApproval(ctx: BusinessContext | null, amountFils: number): boolean {
  if (!ctx || ctx.role !== "buyer") return false;
  if (ctx.approvalThresholdFils === null) return false;
  return amountFils > ctx.approvalThresholdFils;
}

/** The billing snapshot stored on the order and printed on the invoices. */
export function businessBillingSnapshot(ctx: BusinessContext): Record<string, unknown> {
  const a = ctx.billingAddress as Record<string, unknown>;
  return {
    type: "business",
    business_account_id: ctx.businessAccountId,
    legal_name: ctx.legalName,
    trade_name: ctx.tradeName,
    trn: ctx.trn,
    peppol_participant_id: ctx.peppolId,
    trade_licence_number: ctx.tradeLicenceNumber,
    trade_licence_issuer: ctx.tradeLicenceIssuer,
    full_name: ctx.legalName,
    address_line_1: a.line1 ?? null,
    address_line_2: a.line2 ?? null,
    city: a.city ?? null,
    emirate: a.emirate ?? null,
    po_box: a.po_box ?? null,
    country_code: a.country_code ?? "AE",
  };
}
