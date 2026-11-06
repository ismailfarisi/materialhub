import type { InvoiceParty, TaxInvoice } from "@materialhub/database";
import PDFDocument from "pdfkit";

const INK = "#171a21";
const MUTED = "#555b64";

function money(fils: number): string {
  const neg = fils < 0;
  const abs = Math.abs(fils);
  const s = (abs / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}AED ${s}`;
}

function addressLines(a: {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  emirate?: string | null;
  po_box?: string | null;
  country_code?: string | null;
}): string[] {
  return [
    a.line1,
    a.line2,
    [a.city, a.emirate, a.country_code].filter(Boolean).join(", "),
    a.po_box ? `PO Box ${a.po_box}` : null,
  ].filter((l): l is string => Boolean(l?.trim()));
}

/**
 * A4 VAT tax invoice for one stored tax_invoices row. Headed "Tax invoice"
 * only when the seller has a TRN (a seller without one cannot issue a tax
 * invoice); otherwise "Invoice".
 */
export function renderTaxInvoicePdf(inv: TaxInvoice, orderNumber: string): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const title = inv.seller?.trn ? "Tax invoice" : "Invoice";
    doc.fillColor(INK).fontSize(20).text(title);
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor(MUTED);
    doc.text(`Invoice number: ${inv.invoice_number}`);
    doc.text(`Issue date: ${inv.issue_date}`);
    if (inv.due_date) doc.text(`Due date: ${inv.due_date}`);
    doc.text(`Order: ${orderNumber}`);
    const terms =
      inv.payment_terms === "net_30"
        ? "Net 30 days"
        : inv.payment_terms === "net_60"
          ? "Net 60 days"
          : "Paid at checkout";
    doc.text(`Payment terms: ${terms}`);
    doc.moveDown(0.8);

    const top = doc.y;
    const block = (x: number, label: string, p: InvoiceParty) => {
      doc.fillColor(MUTED).fontSize(8).text(label, x, top, { width: 230 });
      doc
        .fillColor(INK)
        .fontSize(10)
        .text(p.legal_name ?? "", x, doc.y, { width: 230 });
      for (const l of addressLines(p.address ?? {})) doc.text(l, x, doc.y, { width: 230 });
      doc.text(p.trn ? `TRN: ${p.trn}` : "TRN: not registered", x, doc.y, { width: 230 });
      if (p.registration_id)
        doc.text(`Trade licence: ${p.registration_id}`, x, doc.y, { width: 230 });
      return doc.y;
    };
    const yA = block(50, "SELLER", inv.seller);
    const yB = block(310, "BUYER", inv.buyer);
    doc.y = Math.max(yA, yB) + 18;

    // Lines
    const head = doc.y;
    doc.fillColor(MUTED).fontSize(8);
    doc.text("DESCRIPTION", 50, head, { width: 220 });
    doc.text("QTY", 270, head, { width: 40, align: "right" });
    doc.text("UNIT (EXCL. VAT)", 315, head, { width: 80, align: "right" });
    doc.text("VAT", 400, head, { width: 40, align: "right" });
    doc.text("AMOUNT (EXCL. VAT)", 445, head, { width: 100, align: "right" });
    doc.moveDown(0.6);
    doc.fillColor(INK).fontSize(9.5);
    for (const l of inv.lines ?? []) {
      const y = doc.y;
      doc.text(l.description, 50, y, { width: 220 });
      const h = doc.y;
      doc.text(String(l.quantity), 270, y, { width: 40, align: "right" });
      doc.text(money(Math.round(l.unit_price_excl_fils)), 315, y, { width: 80, align: "right" });
      doc.text(`${l.vat_rate}%`, 400, y, { width: 40, align: "right" });
      doc.text(money(l.line_net_fils), 445, y, { width: 100, align: "right" });
      doc.y = Math.max(h, doc.y) + 4;
    }
    doc.moveDown(0.6);

    const row = (label: string, value: string, strong = false) => {
      const y = doc.y;
      doc.fillColor(strong ? INK : MUTED).fontSize(strong ? 11 : 9.5);
      doc.text(label, 300, y, { width: 140 });
      doc.fillColor(INK).text(value, 440, y, { width: 105, align: "right" });
      doc.moveDown(0.25);
    };
    row("Line total (excl. VAT)", money(inv.line_extension_fils));
    for (const ac of inv.allowances_charges ?? []) {
      row(ac.reason, `${ac.is_charge ? "" : "-"}${money(ac.amount_fils)}`);
    }
    row("Taxable amount", money(inv.tax_exclusive_fils));
    for (const v of inv.vat_breakdown ?? []) row(`VAT ${v.rate}%`, money(v.vat_fils));
    row("Total incl. VAT", money(inv.tax_inclusive_fils));
    if (inv.rounding_fils) row("Rounding", money(inv.rounding_fils));
    doc.moveDown(0.2);
    row(inv.payment_status === "paid" ? "Paid" : "Amount due", money(inv.payable_fils), true);

    doc.moveDown(1.2);
    doc
      .fillColor(MUTED)
      .fontSize(8)
      .text(
        "Issued through MaterialHub. Amounts in UAE dirhams. Prices on MaterialHub include VAT; the VAT shown is the 5% included in what you paid.",
        50,
        doc.y,
        { width: 495 },
      );
    doc.end();
  });
}
