// Pure shaping of a payout + its claimed commissions and adjustments into a
// print-ready vendor statement. No I/O, no formatting library — deterministic
// and fully unit-testable, same shape as invoice/receipt-view-model.ts.
//
// The money ladder here is a deliberate port of the admin panel's
// `buildPayoutBreakdown` (apps/admin-panel/src/components/payouts/
// payout-actions.helpers.ts). The statement the vendor receives and the
// figures the operator approved on screen MUST agree line for line, so the
// derivation is copied rather than reinvented:
//
//   net_amount = items_net - shipping_contribution_total + adjustment_total
//   items_net  = net_amount + shipping_contribution_total - adjustment_total
//
// `items_net` (the sum of commission.vendor_earning) is not stored on the
// payout row, so it is recovered from that identity. The VAT + tax-on-
// commission wedge is likewise unstored and recovered as the residual
// `gross - commission - items_net` — exact, because every figure is integer
// fils.
//
// `carrier_cost_total` is NOT part of the ladder. computePayoutTotals never
// deducts it; the real shipping deduction is `shipping_contribution_total`.
// It is deliberately omitted from the vendor statement entirely rather than
// shown outside the sum as the admin UI does — a reference rate the vendor
// was never charged has no place on a document that says what they are owed.

export interface PayoutStatementSource {
  payout: {
    payout_reference: string;
    period_start: string;
    period_end: string;
    status: string;
    currency: string;
    gross_amount: number;
    commission_total: number;
    adjustment_total: number;
    shipping_contribution_total: number;
    net_amount: number;
    gateway_reference: string | null;
    processed_at: Date | string | null;
    created_at: Date | string;
  };
  vendor: {
    business_name?: string | null;
    name?: string | null;
    vat_number?: string | null;
  } | null;
  /** Already masked by the caller — this module never sees plaintext. */
  bank: {
    bank_name: string;
    account_holder_name: string;
    account_number_masked: string;
    iban_masked: string | null;
    currency: string;
  } | null;
  commissions: Array<{
    created_at: Date | string;
    item_total: number;
    commission_amount: number;
    tax_on_commission: number;
    vendor_earning: number;
    order?: { order_number?: string | null } | null;
    order_item?: {
      product_name?: string | null;
      variant_name?: string | null;
      quantity?: number | null;
    } | null;
  }>;
  /**
   * The TRUE number of commissions claimed by this payout, which may exceed
   * `commissions.length` — the caller fetches at most STATEMENT_LINE_CAP rows.
   * Kept separate so "showing the first N of TOTAL" is honest rather than
   * counting the capped array against itself.
   */
  commissionCount: number;
  adjustments: Array<{
    created_at: Date | string;
    amount_fils: number;
    reason: string;
  }>;
  platform: {
    legalName: string;
    trn: string | null;
  };
  /** Injected so the view model stays deterministic under test. */
  generatedAt: Date;
}

export interface StatementLine {
  dateLabel: string;
  reference: string;
  description: string;
  gross: string;
  commission: string;
  net: string;
}

export interface StatementAdjustmentLine {
  dateLabel: string;
  reason: string;
  amount: string;
  /** True when the adjustment reduces what the vendor is owed. */
  isDeduction: boolean;
}

export interface StatementLadderRow {
  label: string;
  amount: string;
  kind: "line" | "subtotal" | "total";
  /** Rendered with a leading minus and in the deduction colour. */
  isDeduction: boolean;
}

export interface PayoutStatementViewModel {
  platformName: string;
  platformTrn: string | null;
  reference: string;
  statusLabel: string;
  periodLabel: string;
  generatedLabel: string;
  paidLabel: string | null;
  paymentReference: string | null;
  vendorName: string;
  vendorVatNumber: string | null;
  bank: {
    bankName: string;
    accountHolderName: string;
    accountNumberMasked: string;
    ibanMasked: string | null;
  } | null;
  lines: StatementLine[];
  /** True when `lines` was capped — the PDF says so rather than silently truncating. */
  linesTruncated: boolean;
  totalLineCount: number;
  adjustments: StatementAdjustmentLine[];
  ladder: StatementLadderRow[];
  netAmount: string;
  /**
   * A statement for a `pending` draft describes money that has NOT been sent.
   * Set so the renderer can stamp it, rather than letting a vendor read a
   * draft as a remittance advice.
   */
  isProvisional: boolean;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Line cap. A payout period with thousands of commissions would otherwise
 * render a hundred-page PDF on a single request thread; the per-line detail
 * stops being useful long before that and the ladder totals (which come from
 * the stored payout row, never from these lines) stay correct regardless.
 */
export const STATEMENT_LINE_CAP = 250;

function money(fils: number, currency: string): string {
  return `${currency} ${(fils / 100).toFixed(2)}`;
}

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}

function formatDate(v: Date | string | null): string {
  if (v == null) return "—";
  const d = toDate(v);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * `period_start`/`period_end` are DATE columns and arrive as "YYYY-MM-DD".
 * Parsing those through `new Date()` is safe (UTC midnight), but going via
 * the string keeps a period boundary from drifting a day under any local
 * timezone interpretation.
 */
function formatDateOnly(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return formatDate(iso);
  const [, y, mo, d] = m;
  return `${Number(d)} ${MONTHS[Number(mo) - 1]} ${y}`;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Draft — not yet paid",
  processing: "Payment in progress",
  paid: "Paid",
  failed: "Payment failed",
};

function describeCommission(c: PayoutStatementSource["commissions"][number]): string {
  const name = c.order_item?.product_name?.trim();
  if (name) {
    const variant = c.order_item?.variant_name?.trim();
    const qty = c.order_item?.quantity;
    const label = variant ? `${name} — ${variant}` : name;
    return qty && qty > 1 ? `${label} × ${qty}` : label;
  }
  return "Order item";
}

function vendorDisplayName(vendor: PayoutStatementSource["vendor"]): string {
  const candidates = [vendor?.business_name, vendor?.name];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return "Vendor";
}

export function buildPayoutStatementViewModel(
  src: PayoutStatementSource,
): PayoutStatementViewModel {
  const { payout } = src;
  const currency = payout.currency || "AED";

  // Ported verbatim from buildPayoutBreakdown — see this file's header for why.
  const itemsNet = payout.net_amount + payout.shipping_contribution_total - payout.adjustment_total;
  const vatAndCommissionTax = payout.gross_amount - payout.commission_total - itemsNet;

  const ladder: StatementLadderRow[] = [
    {
      label: "Gross sales (customer paid, VAT incl.)",
      amount: money(payout.gross_amount, currency),
      kind: "line",
      isDeduction: false,
    },
    {
      label: "Platform commission",
      amount: money(payout.commission_total, currency),
      kind: "line",
      isDeduction: true,
    },
    {
      label: "VAT + tax on commission",
      amount: money(vatAndCommissionTax, currency),
      kind: "line",
      isDeduction: true,
    },
    {
      label: "Your earnings",
      amount: money(itemsNet, currency),
      kind: "subtotal",
      isDeduction: false,
    },
  ];

  // Only rendered when non-zero: a statement listing "Shipping contribution
  // AED 0.00" invites the question of what it would have been.
  if (payout.shipping_contribution_total !== 0) {
    ladder.push({
      label: "Shipping contribution",
      amount: money(payout.shipping_contribution_total, currency),
      kind: "line",
      isDeduction: true,
    });
  }
  if (payout.adjustment_total !== 0) {
    ladder.push({
      label: "Adjustments",
      amount: money(Math.abs(payout.adjustment_total), currency),
      kind: "line",
      isDeduction: payout.adjustment_total < 0,
    });
  }
  ladder.push({
    label: "Net payout",
    amount: money(payout.net_amount, currency),
    kind: "total",
    isDeduction: false,
  });

  // The caller already caps its query; the slice is defence in depth so a
  // future caller that forgets cannot produce a hundred-page PDF.
  const lines: StatementLine[] = src.commissions.slice(0, STATEMENT_LINE_CAP).map((c) => ({
    dateLabel: formatDate(c.created_at),
    reference: c.order?.order_number?.trim() || "—",
    description: describeCommission(c),
    gross: money(c.item_total, currency),
    commission: money(c.commission_amount + c.tax_on_commission, currency),
    net: money(c.vendor_earning, currency),
  }));

  return {
    platformName: src.platform.legalName,
    platformTrn: src.platform.trn,
    reference: payout.payout_reference,
    statusLabel: STATUS_LABELS[payout.status] ?? payout.status,
    periodLabel: `${formatDateOnly(payout.period_start)} – ${formatDateOnly(payout.period_end)}`,
    generatedLabel: formatDate(src.generatedAt),
    paidLabel: payout.status === "paid" ? formatDate(payout.processed_at) : null,
    paymentReference: payout.gateway_reference?.trim() || null,
    vendorName: vendorDisplayName(src.vendor),
    vendorVatNumber: src.vendor?.vat_number?.trim() || null,
    bank: src.bank
      ? {
          bankName: src.bank.bank_name,
          accountHolderName: src.bank.account_holder_name,
          accountNumberMasked: src.bank.account_number_masked,
          ibanMasked: src.bank.iban_masked,
        }
      : null,
    lines,
    linesTruncated: src.commissionCount > lines.length,
    totalLineCount: src.commissionCount,
    adjustments: src.adjustments.map((a) => ({
      dateLabel: formatDate(a.created_at),
      reason: a.reason,
      amount: money(Math.abs(a.amount_fils), currency),
      isDeduction: a.amount_fils < 0,
    })),
    ladder,
    netAmount: money(payout.net_amount, currency),
    isProvisional: payout.status !== "paid",
  };
}

/**
 * Filename for the download. Kept next to the view model because the two must
 * agree on the reference, and because it is the one piece of the response an
 * operator sees before opening the file.
 */
export function payoutStatementFilename(reference: string): string {
  const safe = reference.replace(/[^A-Za-z0-9._-]/g, "-");
  return `payout-statement-${safe}.pdf`;
}
