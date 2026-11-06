// ubl.ts — UBL 2.1 Invoice XML for a stored tax invoice, following the
// Peppol PINT AE (UAE) profile as far as we could verify it. Pure and
// deterministic: the same tax_invoices row always gives the same XML.
//
// Status of the mapping (see also docs/business/business-accounts.md):
// - VERIFIED against UBL 2.1 / EN 16931 / Peppol BIS 3 (the base PINT builds
//   on): element names and order, the BT numbers noted below, the totals
//   arithmetic (BR-CO-10, BR-CO-13, BR-CO-15, BR-CO-16), VAT category S at 5%,
//   UNCL1001 code 380, UNCL4461 payment means codes, ISO 4217 AED.
// - UNVERIFIED against the final UAE PINT AE specification and the FTA data
//   dictionary. Each is marked `UNVERIFIED` where it is written. A tax
//   adviser or the chosen ASP must confirm them before go-live.
import type { InvoiceLine, InvoiceParty } from "@materialhub/database";
import { UAE_PEPPOL_SCHEME, tinFromTrn } from "@materialhub/utils";

/** UNVERIFIED: PINT AE customization identifier as published for billing. */
export const PINT_AE_CUSTOMIZATION_ID = "urn:peppol:pint:billing-1@ae-1";
/** Peppol billing process (BT-23). */
export const PEPPOL_BILLING_PROFILE_ID = "urn:peppol:bis:billing";
/**
 * UNVERIFIED: UAE "invoice transaction type" flags (BTAE-02), an 8-character
 * binary string (free zone, deemed supply, margin scheme, summary invoice,
 * continuous supply, disclosed agent billing, supply through e-commerce,
 * exports). "00000000" = an ordinary domestic supply. Whether marketplace
 * sales must set the e-commerce flag is a question for the tax adviser.
 */
export const DEFAULT_TRANSACTION_TYPE = "00000000";

export interface UblInvoiceInput {
  invoice_number: string;
  type_code: string;
  issue_date: string;
  due_date: string | null;
  currency: string;
  seller: InvoiceParty;
  buyer: InvoiceParty;
  lines: InvoiceLine[];
  allowances_charges: Array<{
    is_charge: boolean;
    reason: string;
    amount_fils: number;
    vat_category: string;
    vat_rate: number;
  }>;
  vat_breakdown: Array<{ category: string; rate: number; taxable_fils: number; vat_fils: number }>;
  line_extension_fils: number;
  allowance_total_fils: number;
  charge_total_fils: number;
  tax_exclusive_fils: number;
  vat_total_fils: number;
  tax_inclusive_fils: number;
  rounding_fils: number;
  payable_fils: number;
  payment_terms: string;
  payment_method: string | null;
  /** Buyer's order reference (BT-13), e.g. the MaterialHub order number. */
  order_reference?: string | null;
}

export function escapeXml(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Fils → "123.45". */
export function amount(fils: number): string {
  const neg = fils < 0;
  const abs = Math.abs(Math.round(fils));
  return `${neg ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Unit price (fractional fils) → AED with up to 6 decimals, trailing zeros trimmed. */
export function unitPrice(fils: number): string {
  return (fils / 100).toFixed(6).replace(/(\.\d\d\d*?)0+$/, "$1");
}

/** Quantities: integers as-is, decimals up to 4 places. */
function quantity(q: number): string {
  return Number.isInteger(q) ? String(q) : q.toFixed(4).replace(/0+$/, "");
}

/**
 * UNCL4461 payment means: 30 credit transfer (net terms), 48 bank card,
 * 10 cash (COD). UNVERIFIED: the code BNPL (Tabby/Tamara) settlements should
 * carry; we use ZZZ ("mutually defined").
 */
export function paymentMeansCode(method: string | null): string {
  switch (method) {
    case "net_terms":
    case "bank_transfer":
      return "30";
    case "stripe":
    case "credit_card":
    case "debit_card":
      return "48";
    case "cash_on_delivery":
      return "10";
    default:
      return "ZZZ";
  }
}

function termsNote(terms: string): string | null {
  if (terms === "net_30") return "Net 30 days";
  if (terms === "net_60") return "Net 60 days";
  return "Paid at checkout";
}

class Xml {
  private out: string[] = [];
  private depth = 0;
  open(tag: string, attrs: Record<string, string> = {}) {
    this.out.push(`${"  ".repeat(this.depth)}<${tag}${attrStr(attrs)}>`);
    this.depth++;
    return this;
  }
  close(tag: string) {
    this.depth--;
    this.out.push(`${"  ".repeat(this.depth)}</${tag}>`);
    return this;
  }
  el(tag: string, value: string | null | undefined, attrs: Record<string, string> = {}) {
    if (value === null || value === undefined || value === "") return this;
    this.out.push(
      `${"  ".repeat(this.depth)}<${tag}${attrStr(attrs)}>${escapeXml(value)}</${tag}>`,
    );
    return this;
  }
  toString() {
    return this.out.join("\n");
  }
}

function attrStr(attrs: Record<string, string>) {
  return Object.entries(attrs)
    .map(([k, v]) => ` ${k}="${escapeXml(v)}"`)
    .join("");
}

function party(x: Xml, p: InvoiceParty, role: "seller" | "buyer") {
  x.open("cac:Party");
  // BT-34 / BT-49 electronic address. UNVERIFIED: scheme 0235 with the
  // 10-digit TIN as the value (see libs/utils/src/trn.ts).
  const tin = tinFromTrn(p.trn);
  if (tin) x.el("cbc:EndpointID", tin, { schemeID: UAE_PEPPOL_SCHEME });
  x.open("cac:PartyName")
    .el("cbc:Name", p.trade_name || p.legal_name)
    .close("cac:PartyName");
  x.open("cac:PostalAddress");
  x.el("cbc:StreetName", p.address.line1);
  x.el("cbc:AdditionalStreetName", p.address.line2 ?? null);
  x.el("cbc:CityName", p.address.city);
  x.el("cbc:PostalZone", p.address.po_box ?? null);
  // UNVERIFIED: PINT AE may require the emirate as a code (e.g. DXB, AUH)
  // in CountrySubentity; we send what the account holds.
  x.el("cbc:CountrySubentity", p.address.emirate ?? null);
  x.open("cac:Country")
    .el("cbc:IdentificationCode", p.address.country_code || "AE")
    .close("cac:Country");
  x.close("cac:PostalAddress");
  if (p.trn) {
    // BT-31 seller VAT identifier / BT-48 buyer VAT identifier = TRN.
    x.open("cac:PartyTaxScheme")
      .el("cbc:CompanyID", p.trn)
      .open("cac:TaxScheme")
      .el("cbc:ID", "VAT")
      .close("cac:TaxScheme")
      .close("cac:PartyTaxScheme");
  }
  x.open("cac:PartyLegalEntity");
  x.el("cbc:RegistrationName", p.legal_name); // BT-27 / BT-44
  // BT-30 / BT-47 legal registration identifier: the trade licence number.
  // UNVERIFIED: PINT AE's scheme/identifier-type attribute and the issuing
  // authority field (BTAE-11/12 style) for trade licences.
  x.el("cbc:CompanyID", p.registration_id ?? null);
  x.close("cac:PartyLegalEntity");
  if (role === "buyer" && p.email) {
    x.open("cac:Contact").el("cbc:ElectronicMail", p.email).close("cac:Contact");
  }
  x.close("cac:Party");
}

export function buildUblInvoice(inv: UblInvoiceInput): string {
  const cur = inv.currency || "AED";
  const money = { currencyID: cur };
  const x = new Xml();
  x.open("Invoice", {
    xmlns: "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
    "xmlns:cac": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
    "xmlns:cbc": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
  });
  x.el("cbc:UBLVersionID", "2.1");
  x.el("cbc:CustomizationID", PINT_AE_CUSTOMIZATION_ID); // BT-24 (UNVERIFIED value)
  x.el("cbc:ProfileID", PEPPOL_BILLING_PROFILE_ID); // BT-23
  x.el("cbc:ProfileExecutionID", DEFAULT_TRANSACTION_TYPE); // BTAE-02 (UNVERIFIED)
  x.el("cbc:ID", inv.invoice_number); // BT-1
  x.el("cbc:IssueDate", inv.issue_date); // BT-2
  x.el("cbc:DueDate", inv.due_date); // BT-9
  x.el("cbc:InvoiceTypeCode", inv.type_code || "380"); // BT-3
  x.el("cbc:DocumentCurrencyCode", cur); // BT-5
  // BT-6 tax currency: AED is the invoice currency, so it is the same.
  // UNVERIFIED: whether PINT AE wants TaxCurrencyCode present even when equal.
  x.el("cbc:TaxCurrencyCode", "AED");
  if (inv.order_reference) {
    x.open("cac:OrderReference").el("cbc:ID", inv.order_reference).close("cac:OrderReference");
  }

  x.open("cac:AccountingSupplierParty");
  party(x, inv.seller, "seller");
  x.close("cac:AccountingSupplierParty");
  x.open("cac:AccountingCustomerParty");
  party(x, inv.buyer, "buyer");
  x.close("cac:AccountingCustomerParty");

  // BG-16 payment instructions.
  x.open("cac:PaymentMeans");
  x.el("cbc:PaymentMeansCode", paymentMeansCode(inv.payment_method));
  x.el("cbc:PaymentID", inv.invoice_number); // BT-83 remittance information
  x.close("cac:PaymentMeans");
  x.open("cac:PaymentTerms").el("cbc:Note", termsNote(inv.payment_terms)).close("cac:PaymentTerms"); // BT-20

  // BG-20 / BG-21 document-level allowances and charges.
  for (const ac of inv.allowances_charges) {
    x.open("cac:AllowanceCharge");
    x.el("cbc:ChargeIndicator", ac.is_charge ? "true" : "false");
    x.el("cbc:AllowanceChargeReason", ac.reason);
    x.el("cbc:Amount", amount(ac.amount_fils), money);
    x.open("cac:TaxCategory")
      .el("cbc:ID", ac.vat_category)
      .el("cbc:Percent", String(ac.vat_rate))
      .open("cac:TaxScheme")
      .el("cbc:ID", "VAT")
      .close("cac:TaxScheme")
      .close("cac:TaxCategory");
    x.close("cac:AllowanceCharge");
  }

  // BG-23 VAT breakdown.
  x.open("cac:TaxTotal");
  x.el("cbc:TaxAmount", amount(inv.vat_total_fils), money); // BT-110
  for (const row of inv.vat_breakdown) {
    x.open("cac:TaxSubtotal");
    x.el("cbc:TaxableAmount", amount(row.taxable_fils), money); // BT-116
    x.el("cbc:TaxAmount", amount(row.vat_fils), money); // BT-117
    x.open("cac:TaxCategory");
    x.el("cbc:ID", row.category); // BT-118
    x.el("cbc:Percent", String(row.rate)); // BT-119
    x.open("cac:TaxScheme").el("cbc:ID", "VAT").close("cac:TaxScheme");
    x.close("cac:TaxCategory");
    x.close("cac:TaxSubtotal");
  }
  x.close("cac:TaxTotal");

  // BG-22 document totals.
  x.open("cac:LegalMonetaryTotal");
  x.el("cbc:LineExtensionAmount", amount(inv.line_extension_fils), money); // BT-106
  x.el("cbc:TaxExclusiveAmount", amount(inv.tax_exclusive_fils), money); // BT-109
  x.el("cbc:TaxInclusiveAmount", amount(inv.tax_inclusive_fils), money); // BT-112
  if (inv.allowance_total_fils)
    x.el("cbc:AllowanceTotalAmount", amount(inv.allowance_total_fils), money); // BT-107
  if (inv.charge_total_fils) x.el("cbc:ChargeTotalAmount", amount(inv.charge_total_fils), money); // BT-108
  if (inv.rounding_fils) x.el("cbc:PayableRoundingAmount", amount(inv.rounding_fils), money); // BT-114
  x.el("cbc:PayableAmount", amount(inv.payable_fils), money); // BT-115
  x.close("cac:LegalMonetaryTotal");

  // BG-25 invoice lines.
  for (const l of inv.lines) {
    x.open("cac:InvoiceLine");
    x.el("cbc:ID", String(l.line_no)); // BT-126
    x.el("cbc:InvoicedQuantity", quantity(l.quantity), { unitCode: l.unit_code }); // BT-129/130
    x.el("cbc:LineExtensionAmount", amount(l.line_net_fils), money); // BT-131
    // UNVERIFIED: PINT AE line-level VAT amount (BTAE-08 style). UBL allows
    // a line TaxTotal; Peppol BIS 3 does not use it.
    x.open("cac:TaxTotal")
      .el("cbc:TaxAmount", amount(Math.round((l.line_net_fils * l.vat_rate) / 100)), money)
      .close("cac:TaxTotal");
    x.open("cac:Item");
    x.el("cbc:Name", l.description); // BT-153
    if (l.sku) {
      x.open("cac:SellersItemIdentification")
        .el("cbc:ID", l.sku)
        .close("cac:SellersItemIdentification"); // BT-155
    }
    x.open("cac:ClassifiedTaxCategory")
      .el("cbc:ID", l.vat_category) // BT-151
      .el("cbc:Percent", String(l.vat_rate)) // BT-152
      .open("cac:TaxScheme")
      .el("cbc:ID", "VAT")
      .close("cac:TaxScheme")
      .close("cac:ClassifiedTaxCategory");
    x.close("cac:Item");
    // BT-146 net unit price; up to 6 decimals so quantity × price rounds to
    // the line amount (PEPPOL-EN16931-R120).
    x.open("cac:Price")
      .el("cbc:PriceAmount", unitPrice(l.unit_price_excl_fils), money)
      .close("cac:Price");
    x.close("cac:InvoiceLine");
  }

  x.close("Invoice");
  return `<?xml version="1.0" encoding="UTF-8"?>\n${x.toString()}\n`;
}
