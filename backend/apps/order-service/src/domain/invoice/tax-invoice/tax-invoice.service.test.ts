import { describe, expect, mock, test } from "bun:test";
import { buildInvoiceDrafts } from "./tax-invoice-builder.ts";
import { TaxInvoiceService, taxInvoicePdfResponse } from "./tax-invoice.service.ts";

const party = {
  legal_name: "Emirates Board & Paper Trading LLC",
  trn: null,
  peppol_id: null,
  address: { line1: "Ras Al Khor Industrial 1", city: "Dubai", country_code: "AE" },
};

const [draft] = buildInvoiceDrafts({
  order: {
    id: "o-1",
    user_id: "u-1",
    business_account_id: null,
    subtotal: 4500,
    discount_total: 0,
    shipping_total: 0,
    surcharge_total: 0,
    grand_total: 4500,
    coupon_code: null,
    currency: "AED",
    payment_terms: null,
    payment_due_at: null,
    vendorOrders: [
      {
        id: "vo-1",
        vendor_id: "3f2a9c1b-0000-4000-8000-000000000001",
        vendor_order_number: "MH-2026-000004-V1",
        items: [
          {
            id: "gb",
            product_name: "Greyboard 2 mm",
            variant_name: "70 × 100 cm, pack of 10",
            product_sku: null,
            quantity: 1,
            line_total: 4500,
          },
        ],
      },
    ],
  },
  sellers: {},
  platform: party,
  buyer: { ...party, legal_name: "E2E Buyer" },
  paymentMethod: "cash_on_delivery",
  issuedAt: new Date("2026-11-07T10:00:00Z"),
});

const row = {
  ...draft!,
  ...draft!.totals,
  id: "11111111-1111-4111-8111-111111111111",
  invoice_number: "INV-3F2A9C1B-2026-000001",
  type_code: "380",
  order_number: "MH-2026-000004",
  pdf_s3_key: null as string | null,
};

function service(media: any, invoiceRow = row) {
  const invoiceRepo = { update: mock(async () => ({})) } as any;
  const orderRepo = {
    manager: { query: mock(async () => [invoiceRow]) },
  } as any;
  return { svc: new TaxInvoiceService(invoiceRepo, orderRepo, media), invoiceRepo };
}

describe("TaxInvoiceService.pdfFor", () => {
  test("stores the PDF and answers with a signed URL when storage works", async () => {
    const media = {
      uploadBuffer: mock(async () => {}),
      getReceiptSignedUrl: mock(async () => ({
        url: "https://signed/inv.pdf",
        expiresAt: new Date(),
      })),
    };
    const { svc, invoiceRepo } = service(media);
    const res = await svc.pdfFor("admin-1", row.id, true);
    expect(res).toEqual({ url: "https://signed/inv.pdf" });
    expect(invoiceRepo.update).toHaveBeenCalledWith(
      { id: row.id },
      { pdf_s3_key: `private/receipts/tax-invoices/${row.id}.pdf` },
    );
  });

  test("without object storage it serves the rendered PDF instead of failing", async () => {
    const media = {
      uploadBuffer: mock(async () => {
        throw new Error("Could not load credentials from any providers");
      }),
      getReceiptSignedUrl: mock(async () => {
        throw new Error("no credentials");
      }),
    };
    const { svc, invoiceRepo } = service(media);
    const res = await svc.pdfFor("admin-1", row.id, true);
    expect("pdf" in res).toBe(true);
    if (!("pdf" in res)) return;
    expect(res.pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(res.filename).toBe("INV-3F2A9C1B-2026-000001.pdf");
    // No key recorded for a file that was never stored.
    expect(invoiceRepo.update).not.toHaveBeenCalled();
  });

  test("a stored key whose URL cannot be signed falls back to inline too", async () => {
    const media = {
      uploadBuffer: mock(async () => {}),
      getReceiptSignedUrl: mock(async () => {
        throw new Error("s3 down");
      }),
    };
    const { svc } = service(media, { ...row, pdf_s3_key: "private/receipts/tax-invoices/x.pdf" });
    const res = await svc.pdfFor("admin-1", row.id, true);
    expect("pdf" in res).toBe(true);
    expect(media.uploadBuffer).not.toHaveBeenCalled();
  });

  test("the route answer is the PDF itself, or the JSON url envelope", async () => {
    const pdf = taxInvoicePdfResponse({ pdf: Buffer.from("%PDF-1.3"), filename: "INV-1.pdf" });
    expect(pdf).toBeInstanceOf(Response);
    expect((pdf as Response).headers.get("content-type")).toBe("application/pdf");
    expect((pdf as Response).headers.get("content-disposition")).toContain('filename="INV-1.pdf"');
    const json = taxInvoicePdfResponse({ url: "https://signed/x.pdf" }) as any;
    expect(json.data).toEqual({ url: "https://signed/x.pdf" });
  });
});

describe("TaxInvoiceService.generateForOrder", () => {
  test("invoices a COD order at delivery net of item cancellations, skipping a rejected sub-order", async () => {
    const order = {
      id: "o-4",
      order_number: "MH-2026-000004",
      user_id: "u-1",
      status: "delivered",
      payment_status: "captured",
      business_account_id: null,
      subtotal: 4500,
      discount_total: 0,
      shipping_total: 1500,
      surcharge_total: 1000,
      grand_total: 7000,
      coupon_code: null,
      currency: "AED",
      payment_terms: null,
      payment_due_at: null,
      billing_address: null,
      shipping_address: { full_name: "E2E Buyer" },
      user: { email: "buyer@materialhub.test" },
      vendorOrders: [
        {
          id: "vo-1",
          vendor_id: "v-1",
          vendor_order_number: "MH-2026-000004-V1",
          status: "delivered",
          vendor: { business_name: "MaterialHub Eco Supply" },
          items: [
            {
              id: "gb",
              product_name: "Greyboard 2 mm",
              variant_name: null,
              product_sku: null,
              quantity: 1,
              line_total: 4500,
            },
            {
              id: "kl",
              product_name: "Kraft liner 125 gsm",
              variant_name: null,
              product_sku: null,
              quantity: 1,
              line_total: 500,
              status: "cancelled",
            },
          ],
        },
        {
          id: "vo-2",
          vendor_id: "v-2",
          vendor_order_number: "MH-2026-000004-V2",
          status: "cancelled",
          vendor: { business_name: "Kraft Mill" },
          items: [
            {
              id: "kr",
              product_name: "Brown kraft roll",
              variant_name: null,
              product_sku: null,
              quantity: 1,
              line_total: 3000,
            },
          ],
        },
      ],
    };
    const saved: any[] = [];
    const query = mock(async (sql: string) => {
      if (sql.includes("FROM payments")) {
        return [{ payment_method: "cash_on_delivery", gateway: "cod", status: "captured" }];
      }
      if (sql.includes("FROM order_item_cancellations")) {
        return [{ items: [{ order_item_id: "kl", quantity: 1, refund_amount: 500 }] }];
      }
      if (sql.includes("invoice_number_sequences")) return [{ last_value: saved.length + 1 }];
      return [];
    });
    const txRepo = {
      save: mock(async (r: any) => {
        saved.push(r);
        return { ...r, id: `inv-${saved.length}` };
      }),
    };
    const orderRepo = {
      findOne: mock(async () => order),
      manager: {
        query,
        transaction: async (cb: any) => cb({ query, getRepository: () => txRepo }),
      },
    } as any;
    const invoiceRepo = {
      find: mock(async () => []),
      target: "TaxInvoice",
      update: mock(async () => ({})),
    } as any;
    const svc = new TaxInvoiceService(invoiceRepo, orderRepo, {} as any);

    await svc.generateForOrder("o-4", new Date("2026-11-07T10:00:00Z"));

    const vendorInvoices = saved.filter((r) => r.kind === "vendor");
    expect(vendorInvoices.map((r) => r.vendor_order_id)).toEqual(["vo-1"]);
    expect(vendorInvoices[0].payable_fils).toBe(4500);
    expect(vendorInvoices[0].lines).toHaveLength(1);
    const platform = saved.find((r) => r.kind === "platform");
    expect(platform.payable_fils).toBe(2500);
    // Supplied goods + delivery + COD fee = what the courier collected.
    expect(saved.reduce((s, r) => s + r.payable_fils, 0)).toBe(order.grand_total);
  });
});
