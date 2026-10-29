import PDFDocument from "pdfkit";
import type { PayoutStatementViewModel } from "./payout-statement-view-model.ts";

// Renders a multi-page A4 vendor payout statement to a Buffer. Pure w.r.t. the
// view model — every figure and label is already resolved there, so this file
// only lays out. Mirrors invoice/receipt-pdf.ts's structure and palette.

const INK = "#2c1810";
const MUTED = "#7a5c4a";
const RULE = "#e2d6cc";
const DEDUCT = "#a2402f";

const PAGE_MARGIN = 50;
const CONTENT_WIDTH = 595.28 - PAGE_MARGIN * 2; // A4 width minus both margins
const BOTTOM_LIMIT = 780; // start a new page below this y

// Detail-table column geometry (x offset from the left margin, width).
const COL = {
  date: { x: 0, w: 68 },
  ref: { x: 70, w: 92 },
  desc: { x: 166, w: 143 },
  gross: { x: 313, w: 60 },
  commission: { x: 377, w: 60 },
  net: { x: 441, w: 54 },
} as const;

export function renderPayoutStatementPdf(vm: PayoutStatementViewModel): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = PAGE_MARGIN;
    const right = PAGE_MARGIN + CONTENT_WIDTH;

    const rule = () => {
      doc.strokeColor(RULE).lineWidth(0.5).moveTo(left, doc.y).lineTo(right, doc.y).stroke();
      doc.moveDown(0.4);
    };

    // Guards every table row: pdfkit will happily draw past the page edge when
    // rows are positioned absolutely (as they must be, to align columns).
    const pageBreakIfNeeded = (needed = 18) => {
      if (doc.y + needed > BOTTOM_LIMIT) {
        doc.addPage();
        return true;
      }
      return false;
    };

    // ── Header ──────────────────────────────────────────────────────────
    doc.fillColor(INK).fontSize(22).text(vm.platformName);
    doc.moveDown(0.2);
    doc.fillColor(MUTED).fontSize(11).text("Vendor Payout Statement");
    doc.moveDown(0.6);

    doc.fillColor(INK).fontSize(11);
    doc.text(`Statement: ${vm.reference}`);
    doc.text(`Period: ${vm.periodLabel}`);
    doc.text(`Status: ${vm.statusLabel}`);
    if (vm.paidLabel) doc.text(`Paid on: ${vm.paidLabel}`);
    if (vm.paymentReference) doc.text(`Payment reference: ${vm.paymentReference}`);
    doc.text(`Generated: ${vm.generatedLabel}`);
    if (vm.platformTrn) doc.text(`TRN: ${vm.platformTrn}`);
    doc.moveDown(0.6);

    // A draft or in-flight payout is not a remittance advice. Say so before
    // any figure is read, not in a footnote.
    if (vm.isProvisional) {
      doc
        .fillColor(DEDUCT)
        .fontSize(9)
        .text(
          "PROVISIONAL — this statement reflects a payout that has not been confirmed as paid. " +
            "Figures may change until settlement.",
          { width: CONTENT_WIDTH },
        );
      doc.moveDown(0.6);
    }

    // ── Vendor + bank ───────────────────────────────────────────────────
    doc.fillColor(MUTED).fontSize(9).text("PAID TO");
    doc.fillColor(INK).fontSize(11).text(vm.vendorName);
    if (vm.vendorVatNumber) {
      doc.fillColor(MUTED).fontSize(9).text(`VAT: ${vm.vendorVatNumber}`);
    }
    if (vm.bank) {
      doc.fillColor(MUTED).fontSize(9);
      doc.text(`${vm.bank.bankName} — ${vm.bank.accountHolderName}`);
      doc.text(`Account: ${vm.bank.accountNumberMasked}`);
      if (vm.bank.ibanMasked) doc.text(`IBAN: ${vm.bank.ibanMasked}`);
    }
    doc.moveDown(0.8);

    // ── Detail lines ────────────────────────────────────────────────────
    if (vm.lines.length > 0) {
      doc.fillColor(MUTED).fontSize(9).text("EARNINGS DETAIL");
      doc.moveDown(0.3);

      const header = () => {
        const y = doc.y;
        doc.fillColor(MUTED).fontSize(8);
        doc.text("DATE", left + COL.date.x, y, { width: COL.date.w });
        doc.text("ORDER", left + COL.ref.x, y, { width: COL.ref.w });
        doc.text("ITEM", left + COL.desc.x, y, { width: COL.desc.w });
        doc.text("GROSS", left + COL.gross.x, y, { width: COL.gross.w, align: "right" });
        doc.text("FEES", left + COL.commission.x, y, {
          width: COL.commission.w,
          align: "right",
        });
        doc.text("NET", left + COL.net.x, y, { width: COL.net.w, align: "right" });
        doc.moveDown(0.4);
        rule();
      };

      header();
      for (const line of vm.lines) {
        if (pageBreakIfNeeded()) header();
        const y = doc.y;
        doc.fillColor(INK).fontSize(8.5);
        doc.text(line.dateLabel, left + COL.date.x, y, { width: COL.date.w });
        doc.text(line.reference, left + COL.ref.x, y, { width: COL.ref.w });
        doc.text(line.description, left + COL.desc.x, y, {
          width: COL.desc.w,
          ellipsis: true,
          height: 11,
        });
        doc.text(line.gross, left + COL.gross.x, y, { width: COL.gross.w, align: "right" });
        doc.fillColor(DEDUCT).text(`- ${line.commission}`, left + COL.commission.x, y, {
          width: COL.commission.w,
          align: "right",
        });
        doc.fillColor(INK).text(line.net, left + COL.net.x, y, {
          width: COL.net.w,
          align: "right",
        });
        // Re-anchor: the multi-column absolute writes above leave doc.y at
        // whichever column wrapped last, which is not necessarily the tallest.
        doc.y = y + 13;
      }
      doc.moveDown(0.3);
      rule();

      if (vm.linesTruncated) {
        doc
          .fillColor(MUTED)
          .fontSize(8)
          .text(
            `Showing the first ${vm.lines.length} of ${vm.totalLineCount} items. The totals below cover every item in the period.`,
            left,
            doc.y,
            { width: CONTENT_WIDTH },
          );
        doc.moveDown(0.5);
      }
      doc.moveDown(0.3);
    }

    // ── Adjustments ─────────────────────────────────────────────────────
    if (vm.adjustments.length > 0) {
      pageBreakIfNeeded(60);
      doc.fillColor(MUTED).fontSize(9).text("ADJUSTMENTS", left, doc.y);
      doc.moveDown(0.3);
      for (const a of vm.adjustments) {
        pageBreakIfNeeded();
        const y = doc.y;
        doc.fillColor(INK).fontSize(8.5);
        doc.text(a.dateLabel, left, y, { width: 68 });
        doc.text(a.reason, left + 70, y, { width: 300, ellipsis: true, height: 11 });
        doc
          .fillColor(a.isDeduction ? DEDUCT : INK)
          .text(`${a.isDeduction ? "- " : "+ "}${a.amount}`, left + 375, y, {
            width: 120,
            align: "right",
          });
        doc.y = y + 13;
      }
      doc.moveDown(0.5);
    }

    // ── Totals ladder ───────────────────────────────────────────────────
    pageBreakIfNeeded(140);
    doc.moveDown(0.4);
    const ladderLabelX = left + 220;
    const ladderValueX = left + 380;
    const ladderLabelW = 155;
    for (const row of vm.ladder) {
      const isTotal = row.kind === "total";
      // Set the size BEFORE measuring — heightOfString reads the current font.
      doc.fontSize(isTotal ? 12 : 10);
      // A label longer than the 155pt column wraps ("Gross sales (customer
      // paid, VAT incl.)" takes two lines), and a fixed row advance would then
      // print the next row on top of the wrapped line — which it did, over the
      // most-read part of the statement. Measure the label and advance by
      // whichever is greater.
      const labelHeight = doc.heightOfString(row.label, { width: ladderLabelW });
      const rowHeight = Math.max(isTotal ? 18 : 15, labelHeight + 3);

      pageBreakIfNeeded(rowHeight);
      const y = doc.y;
      if (isTotal) {
        doc
          .strokeColor(RULE)
          .lineWidth(0.8)
          .moveTo(ladderLabelX, y - 3)
          .lineTo(right, y - 3)
          .stroke();
      }
      doc.fillColor(row.kind === "line" ? MUTED : INK);
      doc.text(row.label, ladderLabelX, y, { width: ladderLabelW });
      doc.fillColor(row.isDeduction ? DEDUCT : INK);
      doc.text(`${row.isDeduction ? "- " : ""}${row.amount}`, ladderValueX, y, {
        width: CONTENT_WIDTH - 380,
        align: "right",
      });
      doc.y = y + rowHeight;
    }

    // ── Footer ──────────────────────────────────────────────────────────
    doc.moveDown(1.2);
    pageBreakIfNeeded(40);
    doc
      .fillColor(MUTED)
      .fontSize(8)
      .text(
        `Bank details are shown partially masked. Queries about this statement should be raised with ${vm.platformName} quoting the statement number above.`,
        left,
        doc.y,
        { width: CONTENT_WIDTH },
      );

    doc.end();
  });
}
