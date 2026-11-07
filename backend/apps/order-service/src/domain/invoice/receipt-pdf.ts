import { config } from "@materialhub/config";
import PDFDocument from "pdfkit";
import type { ReceiptViewModel } from "./receipt-view-model.ts";

const INK = "#2c1810";
const MUTED = "#7a5c4a";

// Renders a single-page A4 receipt to a Buffer. Pure w.r.t. the view model;
// the only external read is platform legal identity from config.
export function renderReceiptPdf(vm: ReceiptViewModel): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Header
    doc.fillColor(INK).fontSize(22).text(config.invoice.legalName, { continued: false });
    doc.moveDown(0.2);
    doc
      .fillColor(MUTED)
      .fontSize(11)
      .text(vm.statusLabel ? `Order Receipt — ${vm.statusLabel}` : "Order Receipt");
    doc.moveDown(0.6);

    // Meta
    doc.fillColor(INK).fontSize(11);
    doc.text(`Order: ${vm.reference}`);
    doc.text(`Date: ${vm.dateLabel}`);
    if (config.invoice.trn) doc.text(`TRN: ${config.invoice.trn}`);
    doc.moveDown(0.6);

    // Bill to (business accounts): legal name and buyer TRN.
    if (vm.buyer) {
      doc.fillColor(MUTED).fontSize(9).text("BILL TO");
      doc.fillColor(INK).fontSize(11).text(vm.buyer.legalName);
      doc.text(vm.buyer.trn ? `Buyer TRN: ${vm.buyer.trn}` : "Buyer TRN: not registered");
      doc.moveDown(0.6);
    }

    // Ship to
    doc.fillColor(MUTED).fontSize(9).text("SHIP TO");
    doc.fillColor(INK).fontSize(11).text(vm.address.name);
    for (const line of vm.address.lines) doc.text(line);
    if (vm.address.phone) doc.text(vm.address.phone);
    doc.moveDown(0.6);

    // Vendor groups + items
    for (const group of vm.vendorGroups) {
      doc.fillColor(MUTED).fontSize(9).text(group.vendorName.toUpperCase(), 50);
      if (group.vendorTrn) doc.fontSize(8).text(`Seller TRN: ${group.vendorTrn}`, 50);
      doc.fillColor(INK).fontSize(10);
      for (const it of group.items) {
        const label = it.variant ? `${it.name} — ${it.variant}` : it.name;
        const y = doc.y;
        doc.text(label, 50, y, { width: 340 });
        doc.text(it.qtyUnitLabel, 390, y, { width: 90 });
        doc.text(it.lineTotal, 480, y, { width: 65, align: "right" });
        doc.moveDown(0.3);
      }
      doc.moveDown(0.3);
    }

    // Totals ladder
    const row = (label: string, value: string) => {
      const y = doc.y;
      doc.fillColor(MUTED).fontSize(10).text(label, 350, y, { width: 100 });
      doc.fillColor(INK).text(value, 450, y, { width: 95, align: "right" });
      doc.moveDown(0.25);
    };
    doc.moveDown(0.4);
    row("Subtotal", vm.totals.subtotal);
    if (vm.totals.discount)
      row(
        `Discount${vm.totals.couponCode ? ` (${vm.totals.couponCode})` : ""}`,
        vm.totals.discount,
      );
    row("Shipping", vm.totals.shipping);
    if (vm.totals.surcharge) row("Surcharge", vm.totals.surcharge);
    row("VAT (5%)", vm.totals.vat);
    if (vm.totals.refund) row("Refunded", vm.totals.refund);
    doc.moveDown(0.2);
    const y = doc.y;
    doc
      .fillColor(INK)
      .fontSize(12)
      .text(vm.statusLabel ? "Order total" : "Total", 350, y, { width: 100 });
    doc.fontSize(12).text(vm.totals.grandTotal, 450, y, { width: 95, align: "right" });
    doc.moveDown(0.25);
    row("Paid", vm.totals.paid);
    if (vm.statusLabel) {
      doc.moveDown(0.4);
      doc
        .fillColor(MUTED)
        .fontSize(10)
        .text(`This order was ${vm.statusLabel.toLowerCase()}. Nothing more is due.`, 50);
    }

    doc.end();
  });
}
