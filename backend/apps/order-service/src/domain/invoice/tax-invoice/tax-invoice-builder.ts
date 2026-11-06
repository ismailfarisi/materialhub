// tax-invoice-builder.ts — pure shaping of an order into VAT tax invoice
// records (one per vendor sub-order, plus one platform invoice for shipping
// and surcharges). No I/O; numbers are assigned by the caller.
//
// Money model. Catalogue prices are VAT inclusive (5% UAE standard rate), so
// every amount the buyer paid is a gross amount. For each invoice:
//   line_net        = round(line_gross / 1.05)              (per line)
//   allowance_net   = round(allowance_gross / 1.05)         (discount share)
//   charge_net      = round(charge_gross / 1.05)
//   tax_exclusive   = Σ line_net − allowance_net + charge_net
//   vat             = round(tax_exclusive × 5 / 100)        (per VAT category)
//   tax_inclusive   = tax_exclusive + vat
//   payable         = what the buyer actually paid for this invoice (gross)
//   rounding        = payable − tax_inclusive                (a few fils at most)
// The invoices of one order add up (payable) to the order's grand_total.
import type {
  InvoiceAllowanceCharge,
  InvoiceLine,
  InvoiceParty,
  VatBreakdownRow,
} from "@materialhub/database";

export const UAE_VAT_RATE = 5;
const VAT_DIVISOR = 1 + UAE_VAT_RATE / 100;

/** Gross → net at 5%, in integer fils. */
export function netOfVat(grossFils: number): number {
  return Math.round(grossFils / VAT_DIVISOR);
}

/**
 * Split `total` into integer parts proportional to `weights` (largest
 * remainder), so the parts always add up to exactly `total`.
 */
export function allocateProportionally(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (total === 0 || sum === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (Math.max(0, w) / sum) * total);
  const parts = raw.map((r) => Math.floor(r));
  let left = total - parts.reduce((s, p) => s + p, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) parts[order[k]!.i]! += 1;
  return parts;
}

/**
 * UN/ECE Recommendation 20/21 unit codes. Variants carry no unit of measure
 * yet (workstream 1 adds it), so lines default to C62 ("one").
 * UNVERIFIED: confirm the codes PINT AE accepts for sheet, roll, pack and
 * carton with the ASP (Peppol accepts Rec 20 plus Rec 21 with an X prefix).
 */
export const UNIT_CODES: Record<string, string> = {
  unit: "C62",
  piece: "H87",
  sheet: "ST",
  roll: "XRO",
  pack: "XPK",
  carton: "XCT",
  box: "XBX",
  metre: "MTR",
  kg: "KGM",
};

export function unitCodeFor(uom: string | null | undefined): string {
  return (uom && UNIT_CODES[uom.toLowerCase()]) || "C62";
}

export interface InvoiceTotals {
  line_extension_fils: number;
  allowance_total_fils: number;
  charge_total_fils: number;
  tax_exclusive_fils: number;
  vat_total_fils: number;
  tax_inclusive_fils: number;
  rounding_fils: number;
  payable_fils: number;
  vat_breakdown: VatBreakdownRow[];
}

/** Totals for one invoice, all standard-rated (S, 5%). */
export function computeInvoiceTotals(
  lines: Pick<InvoiceLine, "line_net_fils" | "line_gross_fils">[],
  allowancesCharges: Array<InvoiceAllowanceCharge & { gross_fils: number }>,
): InvoiceTotals {
  const lineExtension = lines.reduce((s, l) => s + l.line_net_fils, 0);
  const allowance = allowancesCharges
    .filter((a) => !a.is_charge)
    .reduce((s, a) => s + a.amount_fils, 0);
  const charge = allowancesCharges
    .filter((a) => a.is_charge)
    .reduce((s, a) => s + a.amount_fils, 0);
  const taxExclusive = lineExtension - allowance + charge;
  const vat = Math.round((taxExclusive * UAE_VAT_RATE) / 100);
  const taxInclusive = taxExclusive + vat;
  const payable =
    lines.reduce((s, l) => s + l.line_gross_fils, 0) -
    allowancesCharges.filter((a) => !a.is_charge).reduce((s, a) => s + a.gross_fils, 0) +
    allowancesCharges.filter((a) => a.is_charge).reduce((s, a) => s + a.gross_fils, 0);
  return {
    line_extension_fils: lineExtension,
    allowance_total_fils: allowance,
    charge_total_fils: charge,
    tax_exclusive_fils: taxExclusive,
    vat_total_fils: vat,
    tax_inclusive_fils: taxInclusive,
    rounding_fils: payable - taxInclusive,
    payable_fils: payable,
    vat_breakdown: [
      { category: "S", rate: UAE_VAT_RATE, taxable_fils: taxExclusive, vat_fils: vat },
    ],
  };
}

export function makeLine(input: {
  line_no: number;
  source_id: string;
  description: string;
  sku: string | null;
  quantity: number;
  gross_fils: number;
  uom?: string | null;
}): InvoiceLine {
  const net = netOfVat(input.gross_fils);
  return {
    line_no: input.line_no,
    source_id: input.source_id,
    description: input.description,
    sku: input.sku,
    quantity: input.quantity,
    unit_code: unitCodeFor(input.uom),
    unit_price_excl_fils: input.quantity > 0 ? net / input.quantity : net,
    line_net_fils: net,
    vat_category: "S",
    vat_rate: UAE_VAT_RATE,
    line_gross_fils: input.gross_fils,
  };
}

// ── Order → invoice drafts ───────────────────────────────────────────────

export interface BuilderOrder {
  id: string;
  user_id: string;
  business_account_id: string | null;
  subtotal: number;
  discount_total: number;
  shipping_total: number;
  surcharge_total: number;
  grand_total: number;
  coupon_code: string | null;
  currency: string;
  payment_terms: string | null;
  payment_due_at: Date | string | null;
  vendorOrders: Array<{
    id: string;
    vendor_id: string;
    vendor_order_number: string;
    items: Array<{
      id: string;
      product_name: string;
      variant_name: string | null;
      product_sku: string | null;
      quantity: number;
      line_total: number;
      status?: string;
    }>;
  }>;
}

export interface InvoiceDraft {
  kind: "vendor" | "platform";
  order_id: string;
  vendor_order_id: string | null;
  vendor_id: string | null;
  buyer_user_id: string;
  business_account_id: string | null;
  issue_date: string;
  due_date: string | null;
  currency: string;
  seller: InvoiceParty;
  buyer: InvoiceParty;
  lines: InvoiceLine[];
  allowances_charges: InvoiceAllowanceCharge[];
  payment_terms: string;
  payment_method: string | null;
  einvoice_status: "not_applicable" | "ready";
  totals: InvoiceTotals;
}

/** Calendar date in Asia/Dubai (UTC+4, no DST). */
export function dubaiDate(d: Date): string {
  return new Date(d.getTime() + 4 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * Build one draft per vendor sub-order and, when shipping or a surcharge was
 * charged, one platform draft. An order-level discount is shared across the
 * vendor invoices in proportion to their goods totals.
 * UNVERIFIED (tax adviser): whether a platform-wide coupon should reduce the
 * vendor's taxable supply (as here) or be a platform-funded discount on a
 * separate document; and whether the marketplace or each vendor is the issuer.
 */
export function buildInvoiceDrafts(input: {
  order: BuilderOrder;
  sellers: Record<string, InvoiceParty>;
  platform: InvoiceParty;
  buyer: InvoiceParty;
  paymentMethod: string | null;
  issuedAt: Date;
}): InvoiceDraft[] {
  const { order } = input;
  const issueDate = dubaiDate(input.issuedAt);
  const dueDate = order.payment_due_at ? dubaiDate(new Date(order.payment_due_at)) : null;
  const terms = order.payment_terms ?? "immediate";
  // Peppol exchange only makes sense when the buyer has a TRN.
  const einvoice = input.buyer.trn ? ("ready" as const) : ("not_applicable" as const);

  const vendorGroups = order.vendorOrders.map((vo) => ({
    vo,
    gross: vo.items.reduce((s, i) => s + i.line_total, 0),
  }));
  const discountShares = allocateProportionally(
    order.discount_total,
    vendorGroups.map((g) => g.gross),
  );

  const drafts: InvoiceDraft[] = vendorGroups.map(({ vo }, idx) => {
    const lines = vo.items.map((it, i) =>
      makeLine({
        line_no: i + 1,
        source_id: it.id,
        description: it.variant_name ? `${it.product_name}, ${it.variant_name}` : it.product_name,
        sku: it.product_sku,
        quantity: it.quantity,
        gross_fils: it.line_total,
      }),
    );
    const share = discountShares[idx] ?? 0;
    const ac: Array<InvoiceAllowanceCharge & { gross_fils: number }> =
      share > 0
        ? [
            {
              is_charge: false,
              reason: order.coupon_code ? `Discount (${order.coupon_code})` : "Discount",
              amount_fils: netOfVat(share),
              gross_fils: share,
              vat_category: "S",
              vat_rate: UAE_VAT_RATE,
            },
          ]
        : [];
    const seller = input.sellers[vo.vendor_id] ?? {
      legal_name: "Vendor",
      trn: null,
      peppol_id: null,
      address: { line1: null, city: null, country_code: "AE" },
    };
    return {
      kind: "vendor",
      order_id: order.id,
      vendor_order_id: vo.id,
      vendor_id: vo.vendor_id,
      buyer_user_id: order.user_id,
      business_account_id: order.business_account_id,
      issue_date: issueDate,
      due_date: dueDate,
      currency: order.currency || "AED",
      seller,
      buyer: input.buyer,
      lines,
      allowances_charges: ac.map(({ gross_fils: _g, ...rest }) => rest),
      payment_terms: terms,
      payment_method: input.paymentMethod,
      einvoice_status: seller.trn ? einvoice : "not_applicable",
      totals: computeInvoiceTotals(lines, ac),
    };
  });

  const platformLines: InvoiceLine[] = [];
  if (order.shipping_total > 0) {
    platformLines.push(
      makeLine({
        line_no: platformLines.length + 1,
        source_id: `${order.id}:shipping`,
        description: "Delivery",
        sku: null,
        quantity: 1,
        gross_fils: order.shipping_total,
      }),
    );
  }
  if (order.surcharge_total > 0) {
    platformLines.push(
      makeLine({
        line_no: platformLines.length + 1,
        source_id: `${order.id}:surcharge`,
        description: "Payment surcharge",
        sku: null,
        quantity: 1,
        gross_fils: order.surcharge_total,
      }),
    );
  }
  if (platformLines.length > 0) {
    drafts.push({
      kind: "platform",
      order_id: order.id,
      vendor_order_id: null,
      vendor_id: null,
      buyer_user_id: order.user_id,
      business_account_id: order.business_account_id,
      issue_date: issueDate,
      due_date: dueDate,
      currency: order.currency || "AED",
      seller: input.platform,
      buyer: input.buyer,
      lines: platformLines,
      allowances_charges: [],
      payment_terms: terms,
      payment_method: input.paymentMethod,
      einvoice_status: input.platform.trn ? einvoice : "not_applicable",
      totals: computeInvoiceTotals(platformLines, []),
    });
  }
  return drafts;
}

/** "INV-<SELLER8>-<YYYY>-<NNNNNN>". */
export function formatInvoiceNumber(sellerCode: string, year: number, seq: number): string {
  return `INV-${sellerCode}-${year}-${String(seq).padStart(6, "0")}`;
}

export function sellerCodeFor(vendorId: string | null): string {
  return vendorId ? vendorId.replace(/-/g, "").slice(0, 8).toUpperCase() : "MH";
}

export function seriesFor(vendorId: string | null, year: number): string {
  return vendorId ? `vendor:${vendorId}:${year}` : `platform:${year}`;
}

/** Map a free-form address JSON (vendor or order) to an invoice address. */
export function partyAddress(raw: Record<string, unknown> | null | undefined) {
  const a = raw ?? {};
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    line1: s(a.line1) ?? s(a.address_line_1) ?? s(a.street) ?? null,
    line2: s(a.line2) ?? s(a.address_line_2) ?? s(a.area) ?? null,
    city: s(a.city) ?? null,
    emirate: s(a.emirate) ?? s(a.state) ?? null,
    po_box: s(a.po_box) ?? s(a.postal_code) ?? null,
    country_code: (s(a.country_code) ?? s(a.country) ?? "AE").slice(0, 2).toUpperCase(),
  };
}
