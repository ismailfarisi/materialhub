import { describe, expect, test } from "bun:test";
import { inflateSync } from "node:zlib";
import { renderPayoutStatementPdf } from "./payout-statement-pdf.ts";
import type { PayoutStatementViewModel } from "./payout-statement-view-model.ts";

const vm: PayoutStatementViewModel = {
  platformName: "MaterialHub FZ-LLC",
  platformTrn: "100123456700003",
  reference: "PAY-2026-000004",
  statusLabel: "Draft — not yet paid",
  periodLabel: "30 Jun 2026 – 30 Jul 2026",
  generatedLabel: "1 Aug 2026",
  paidLabel: null,
  paymentReference: null,
  vendorName: "MaterialHub UAE",
  vendorVatNumber: null,
  bank: {
    bankName: "Emirates NBD",
    accountHolderName: "MaterialHub UAE Trading LLC",
    accountNumberMasked: "*********1234",
    ibanMasked: "*******************3456",
  },
  lines: [
    {
      dateLabel: "12 Jul 2026",
      reference: "MH-10234",
      description: "Rose Serum — 30ml × 2",
      gross: "AED 50.00",
      commission: "AED 0.50",
      net: "AED 47.12",
    },
  ],
  linesTruncated: false,
  totalLineCount: 1,
  adjustments: [],
  ladder: [
    {
      label: "Gross sales (customer paid, VAT incl.)",
      amount: "AED 100.00",
      kind: "line",
      isDeduction: false,
    },
    { label: "Platform commission", amount: "AED 0.96", kind: "line", isDeduction: true },
    { label: "VAT + tax on commission", amount: "AED 4.80", kind: "line", isDeduction: true },
    { label: "Your earnings", amount: "AED 94.24", kind: "subtotal", isDeduction: false },
    { label: "Net payout", amount: "AED 94.24", kind: "total", isDeduction: false },
  ],
  netAmount: "AED 94.24",
  isProvisional: true,
};

describe("renderPayoutStatementPdf", () => {
  test("returns a non-empty PDF buffer", async () => {
    const buf = await renderPayoutStatementPdf(vm);
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  test("renders a paid statement with adjustments and a payment reference", async () => {
    const paid: PayoutStatementViewModel = {
      ...vm,
      statusLabel: "Paid",
      paidLabel: "2 Aug 2026",
      paymentReference: "TRF-99812",
      isProvisional: false,
      adjustments: [
        {
          dateLabel: "20 Jul 2026",
          reason: "Damaged goods clawback",
          amount: "AED 15.00",
          isDeduction: true,
        },
        {
          dateLabel: "21 Jul 2026",
          reason: "Goodwill credit",
          amount: "AED 8.00",
          isDeduction: false,
        },
      ],
      ladder: [
        ...vm.ladder.slice(0, 4),
        { label: "Shipping contribution", amount: "AED 12.00", kind: "line", isDeduction: true },
        { label: "Adjustments", amount: "AED 7.00", kind: "line", isDeduction: true },
        { label: "Net payout", amount: "AED 75.24", kind: "total", isDeduction: false },
      ],
    };
    const buf = await renderPayoutStatementPdf(paid);
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  // The absolute column positioning means a long line list must break pages
  // rather than draw off the bottom edge; a 250-line render exercises that.
  test("paginates a capped, truncated line list without throwing", async () => {
    const many: PayoutStatementViewModel = {
      ...vm,
      lines: Array.from({ length: 250 }, (_, i) => ({
        dateLabel: "12 Jul 2026",
        reference: `NL-${10000 + i}`,
        description: "A deliberately long product name that has to be ellipsised in its column",
        gross: "AED 50.00",
        commission: "AED 0.50",
        net: "AED 47.12",
      })),
      linesTruncated: true,
      totalLineCount: 4000,
    };
    const buf = await renderPayoutStatementPdf(many);
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(5000);
  });

  test("renders when the vendor has no bank account on file", async () => {
    const buf = await renderPayoutStatementPdf({ ...vm, bank: null, lines: [] });
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  // Every assertion above passes on a PDF whose rows are printed on top of one
  // another — which is what shipped until this test existed. The ladder labels
  // are the longest text in a fixed-width column, so they are the ones that
  // wrap; a fixed row advance then overprinted the wrapped line with the next
  // row, right across the totals a vendor reads first.
  describe("layout", () => {
    test("no ladder row overprints the row above it, however long the label", async () => {
      const wordy: PayoutStatementViewModel = {
        ...vm,
        ladder: [
          {
            // Deliberately longer than anything the view model produces today,
            // so the guard holds if a label is ever reworded.
            label:
              "Gross sales as invoiced to the customer, inclusive of value added tax at the prevailing rate",
            amount: "AED 100.00",
            kind: "line",
            isDeduction: false,
          },
          ...vm.ladder.slice(1),
        ],
      };

      for (const candidate of [vm, wordy]) {
        const collisions = findOverlaps(await renderPayoutStatementPdf(candidate));
        expect(collisions).toEqual([]);
      }
    });
  });
});

/**
 * Decodes the page content streams and returns any pair of text runs that sit
 * in the same column with a vertical gap smaller than their font size — i.e.
 * text drawn over other text. Reads the PDF rather than the layout code, so it
 * catches a regression regardless of which drawing call causes it.
 */
function findOverlaps(pdf: Buffer): string[] {
  const raw = pdf.toString("latin1");
  const found: string[] = [];

  for (const match of raw.matchAll(/stream\r?\n/g)) {
    const from = (match.index ?? 0) + match[0].length;
    const to = raw.indexOf("endstream", from);
    let content: string;
    try {
      content = inflateSync(Buffer.from(raw.slice(from, to), "latin1")).toString("latin1");
    } catch {
      continue; // font programs and other non-content streams
    }

    const runRe = /1 0 0 1 ([\d.]+) ([\d.]+) Tm\s*\/F\d+ ([\d.]+) Tf\s*\[([^\]]*)\] TJ/g;
    const runs = [...content.matchAll(runRe)].map((run) => ({
      x: Number(run[1]),
      y: Number(run[2]),
      size: Number(run[3]),
      text: [...(run[4] ?? "").matchAll(/<([0-9a-fA-F]*)>/g)]
        .map((h) => Buffer.from(h[1] ?? "", "hex").toString("latin1"))
        .join(""),
    }));

    // Descending y == top-to-bottom: pdfkit's flips cancel, so these are page
    // coordinates measured from the bottom.
    runs.sort((a, b) => b.y - a.y);
    for (let i = 0; i < runs.length - 1; i++) {
      const upper = runs[i];
      const lower = runs[i + 1];
      if (!upper || !lower) continue;
      const gap = upper.y - lower.y;
      const sameColumn = Math.abs(upper.x - lower.x) < 60;
      if (sameColumn && gap > 0 && gap < Math.max(upper.size, lower.size)) {
        found.push(`"${upper.text.trim()}" overprints "${lower.text.trim()}" (gap ${gap}pt)`);
      }
    }
  }
  return found;
}
