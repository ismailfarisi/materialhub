import { describe, expect, test } from "bun:test";
import { buildInvoiceDrafts } from "../tax-invoice/tax-invoice-builder.ts";
import { amount, buildUblInvoice, escapeXml, paymentMeansCode, unitPrice } from "./ubl.ts";

/** Minimal well-formedness check: every open tag closes in order. */
function assertWellFormed(xml: string) {
  const body = xml.replace(/^<\?xml[^>]*\?>/, "");
  const stack: string[] = [];
  for (const m of body.matchAll(/<(\/?)([A-Za-z][\w:.-]*)([^>]*?)(\/?)>/g)) {
    const [, closing, name, , selfClosing] = m;
    if (selfClosing) continue;
    if (closing) {
      expect(stack.pop()).toBe(name);
    } else stack.push(name!);
  }
  expect(stack).toEqual([]);
}

function tagIndex(xml: string, tag: string) {
  const i = xml.indexOf(`<${tag}`);
  expect(i).toBeGreaterThan(-1);
  return i;
}

const [draft] = buildInvoiceDrafts({
  order: {
    id: "o-1",
    user_id: "u-1",
    business_account_id: "b-1",
    subtotal: 103650,
    discount_total: 1050,
    shipping_total: 0,
    surcharge_total: 0,
    grand_total: 102600,
    coupon_code: null,
    currency: "AED",
    payment_terms: "net_30",
    payment_due_at: "2026-12-06T10:00:00Z",
    vendorOrders: [
      {
        id: "vo-a",
        vendor_id: "3f2a9c1b-0000-4000-8000-000000000001",
        vendor_order_number: "MH-1001-V1",
        items: [
          {
            id: "i1",
            product_name: "Greyboard 2.0 mm",
            variant_name: "70×100 cm",
            product_sku: "GB-20",
            quantity: 100,
            line_total: 48000,
          },
          {
            id: "i2",
            product_name: "Book cloth & linen <blue>",
            variant_name: null,
            product_sku: null,
            quantity: 3,
            line_total: 55650,
          },
        ],
      },
    ],
  },
  sellers: {
    "3f2a9c1b-0000-4000-8000-000000000001": {
      legal_name: "Emirates Board & Paper Trading LLC",
      trn: "100987654300003",
      peppol_id: "0235:1009876543",
      registration_id: "DED-778812",
      address: {
        line1: "Ras Al Khor Industrial 1",
        city: "Dubai",
        emirate: "Dubai",
        country_code: "AE",
      },
    },
  },
  platform: {
    legal_name: "MaterialHub",
    trn: null,
    peppol_id: null,
    address: { line1: null, city: "Dubai", country_code: "AE" },
  },
  buyer: {
    legal_name: "Gulf Rigid Box Workshop LLC",
    trn: "100234567800003",
    peppol_id: "0235:1002345678",
    registration_id: "SHJ-55120",
    email: "accounts@gulfrigidbox.example",
    address: {
      line1: "Industrial Area 13",
      city: "Sharjah",
      emirate: "Sharjah",
      po_box: "22011",
      country_code: "AE",
    },
  },
  paymentMethod: "net_terms",
  issuedAt: new Date("2026-11-06T10:00:00Z"),
});

const inv = {
  ...draft!,
  ...draft!.totals,
  invoice_number: "INV-3F2A9C1B-2026-000001",
  type_code: "380",
  order_reference: "MH-1001",
};
const xml = buildUblInvoice(inv);

describe("UBL 2.1 export", () => {
  test("is well-formed and declares the UBL namespaces", () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    assertWellFormed(xml);
    expect(xml).toContain('xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"');
    expect(xml).toContain("<cbc:UBLVersionID>2.1</cbc:UBLVersionID>");
  });

  test("carries the PINT AE profile identifiers", () => {
    expect(xml).toContain(
      "<cbc:CustomizationID>urn:peppol:pint:billing-1@ae-1</cbc:CustomizationID>",
    );
    expect(xml).toContain("<cbc:ProfileID>urn:peppol:bis:billing</cbc:ProfileID>");
  });

  test("header fields: number, dates, type, currency, order reference", () => {
    expect(xml).toContain("<cbc:ID>INV-3F2A9C1B-2026-000001</cbc:ID>");
    expect(xml).toContain("<cbc:IssueDate>2026-11-06</cbc:IssueDate>");
    expect(xml).toContain("<cbc:DueDate>2026-12-06</cbc:DueDate>");
    expect(xml).toContain("<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>");
    expect(xml).toContain("<cbc:DocumentCurrencyCode>AED</cbc:DocumentCurrencyCode>");
    expect(xml).toContain("<cac:OrderReference>");
  });

  test("seller and buyer TRNs, legal names and Peppol endpoints", () => {
    expect(xml).toContain('<cbc:EndpointID schemeID="0235">1009876543</cbc:EndpointID>');
    expect(xml).toContain('<cbc:EndpointID schemeID="0235">1002345678</cbc:EndpointID>');
    expect(xml).toContain("<cbc:CompanyID>100987654300003</cbc:CompanyID>");
    expect(xml).toContain("<cbc:CompanyID>100234567800003</cbc:CompanyID>");
    expect(xml).toContain(
      "<cbc:RegistrationName>Emirates Board &amp; Paper Trading LLC</cbc:RegistrationName>",
    );
    expect(xml).toContain(
      "<cbc:RegistrationName>Gulf Rigid Box Workshop LLC</cbc:RegistrationName>",
    );
  });

  test("totals match the stored record and reconcile", () => {
    expect(xml).toContain(
      `<cbc:LineExtensionAmount currencyID="AED">${amount(inv.line_extension_fils)}</cbc:LineExtensionAmount>`,
    );
    expect(xml).toContain(
      `<cbc:TaxExclusiveAmount currencyID="AED">${amount(inv.tax_exclusive_fils)}</cbc:TaxExclusiveAmount>`,
    );
    expect(xml).toContain(
      `<cbc:TaxInclusiveAmount currencyID="AED">${amount(inv.tax_inclusive_fils)}</cbc:TaxInclusiveAmount>`,
    );
    expect(xml).toContain(
      `<cbc:AllowanceTotalAmount currencyID="AED">${amount(inv.allowance_total_fils)}</cbc:AllowanceTotalAmount>`,
    );
    expect(xml).toContain(`<cbc:PayableAmount currencyID="AED">1026.00</cbc:PayableAmount>`);
    expect(inv.tax_inclusive_fils + inv.rounding_fils).toBe(102600);
    // VAT breakdown: category S at 5%.
    expect(xml).toMatch(
      /<cac:TaxSubtotal>[\s\S]*<cbc:ID>S<\/cbc:ID>[\s\S]*<cbc:Percent>5<\/cbc:Percent>/,
    );
  });

  test("lines: quantity with unit code, net amount, price × qty ≈ amount", () => {
    expect(xml).toContain('<cbc:InvoicedQuantity unitCode="C62">100</cbc:InvoicedQuantity>');
    const l1 = inv.lines[0]!;
    expect(xml).toContain(
      `<cbc:PriceAmount currencyID="AED">${unitPrice(l1.unit_price_excl_fils)}</cbc:PriceAmount>`,
    );
    expect(Math.round(Number(unitPrice(l1.unit_price_excl_fils)) * 100 * l1.quantity)).toBe(
      l1.line_net_fils,
    );
    // Text is escaped.
    expect(xml).toContain("Book cloth &amp; linen &lt;blue&gt;");
  });

  test("payment means: credit transfer for net terms, terms note", () => {
    expect(xml).toContain("<cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>");
    expect(xml).toContain("<cbc:Note>Net 30 days</cbc:Note>");
  });

  test("elements appear in UBL 2.1 schema order", () => {
    const order = [
      "cbc:UBLVersionID",
      "cbc:CustomizationID",
      "cbc:ProfileID",
      "cbc:ID",
      "cbc:IssueDate",
      "cbc:DueDate",
      "cbc:InvoiceTypeCode",
      "cbc:DocumentCurrencyCode",
      "cac:OrderReference",
      "cac:AccountingSupplierParty",
      "cac:AccountingCustomerParty",
      "cac:PaymentMeans",
      "cac:PaymentTerms",
      "cac:AllowanceCharge",
      "cac:TaxTotal",
      "cac:LegalMonetaryTotal",
      "cac:InvoiceLine",
    ];
    const idx = order.map((t) => tagIndex(xml, t));
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });

  test("is deterministic", () => {
    expect(buildUblInvoice(inv)).toBe(xml);
  });
});

describe("helpers", () => {
  test("amount formatting", () => {
    expect(amount(102600)).toBe("1026.00");
    expect(amount(5)).toBe("0.05");
    expect(amount(-1930)).toBe("-19.30");
  });
  test("unit price keeps up to 6 decimals and at least 2", () => {
    expect(unitPrice(45714 / 100)).toBe("4.5714");
    expect(unitPrice(1000)).toBe("10.00");
    expect(unitPrice(53000 / 3)).toBe("176.666667");
  });
  test("escaping and payment means codes", () => {
    expect(escapeXml(`a&b<c>"d'`)).toBe("a&amp;b&lt;c&gt;&quot;d&apos;");
    expect(paymentMeansCode("cash_on_delivery")).toBe("10");
    expect(paymentMeansCode("stripe")).toBe("48");
    expect(paymentMeansCode("tabby")).toBe("ZZZ");
  });
});
