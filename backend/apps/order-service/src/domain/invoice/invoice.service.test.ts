import { describe, expect, mock, test } from "bun:test";
import { InvoiceService, receiptKey } from "./invoice.service.ts";

function makeOrder(overrides: any = {}) {
  return {
    id: "ord-1",
    user_id: "user-1",
    order_number: "NL-1",
    created_at: new Date("2026-07-27T00:00:00Z"),
    currency: "AED",
    subtotal: 1000,
    discount_total: 0,
    shipping_total: 0,
    surcharge_total: 0,
    tax_total: 50,
    grand_total: 1050,
    refund_total: 0,
    coupon_code: null,
    shipping_address: { full_name: "A" },
    invoice_s3_key: null,
    invoice_generated_at: null,
    updated_at: new Date("2026-07-27T00:00:00Z"),
    vendorOrders: [
      {
        vendor_order_number: "NL-1-V1",
        vendor: { business_name: "V" },
        items: [
          {
            product_name: "P",
            variant_name: null,
            quantity: 1,
            unit_price: 1000,
            line_total: 1000,
          },
        ],
      },
    ],
    ...overrides,
  };
}

function makeMedia() {
  return {
    uploadBuffer: mock(async () => {}),
    getReceiptSignedUrl: mock(async () => ({ url: "https://signed/x.pdf", expiresAt: new Date() })),
  } as any;
}

describe("receiptKey", () => {
  test("scopes to private/receipts", () => {
    expect(receiptKey("ord-1")).toBe("private/receipts/ord-1.pdf");
  });
});

describe("InvoiceService.generateForOrder", () => {
  test("renders, uploads, and persists the key", async () => {
    const order = makeOrder();
    const repo = {
      findOne: mock(async () => order),
      save: mock(async (o: any) => o),
    } as any;
    const media = makeMedia();
    const svc = new InvoiceService(repo, media);

    const result = await svc.generateForOrder("ord-1");

    expect(result).toEqual({ key: "private/receipts/ord-1.pdf" });
    expect(media.uploadBuffer).toHaveBeenCalledTimes(1);
    const [key, buf, ct] = media.uploadBuffer.mock.calls[0];
    expect(key).toBe("private/receipts/ord-1.pdf");
    expect(ct).toBe("application/pdf");
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(order.invoice_s3_key).toBe("private/receipts/ord-1.pdf");
    expect(order.invoice_generated_at).toBeInstanceOf(Date);
  });

  test("skips when key is set and order unchanged since generation", async () => {
    const order = makeOrder({
      invoice_s3_key: "private/receipts/ord-1.pdf",
      invoice_generated_at: new Date("2026-07-27T01:00:00Z"),
      updated_at: new Date("2026-07-27T00:00:00Z"),
    });
    const repo = { findOne: mock(async () => order), save: mock(async (o: any) => o) } as any;
    const media = makeMedia();
    const svc = new InvoiceService(repo, media);

    const result = await svc.generateForOrder("ord-1");

    expect(result).toEqual({ skipped: true });
    expect(media.uploadBuffer).not.toHaveBeenCalled();
  });

  test("records invoice_last_error and returns failed on render/upload error", async () => {
    const order = makeOrder();
    const repo = { findOne: mock(async () => order), save: mock(async (o: any) => o) } as any;
    const media = makeMedia();
    media.uploadBuffer = mock(async () => {
      throw new Error("s3 down");
    });
    const svc = new InvoiceService(repo, media);

    const result = await svc.generateForOrder("ord-1");

    expect(result).toEqual({ failed: true });
    expect(order.invoice_last_error).toContain("s3 down");
    expect(repo.save).toHaveBeenCalled();
  });

  test("regenerates when the order changed after last generation", async () => {
    const order = makeOrder({
      invoice_s3_key: "private/receipts/ord-1.pdf",
      invoice_generated_at: new Date("2026-07-27T00:00:00Z"),
      updated_at: new Date("2026-07-27T02:00:00Z"),
    });
    const repo = { findOne: mock(async () => order), save: mock(async (o: any) => o) } as any;
    const media = makeMedia();
    const svc = new InvoiceService(repo, media);
    const result = await svc.generateForOrder("ord-1");
    expect(result).toEqual({ key: "private/receipts/ord-1.pdf" });
    expect(media.uploadBuffer).toHaveBeenCalledTimes(1);
  });

  test("returns failed when the order is not found", async () => {
    const repo = { findOne: mock(async () => null), save: mock(async () => {}) } as any;
    const svc = new InvoiceService(repo, makeMedia());
    expect(await svc.generateForOrder("nope")).toEqual({ failed: true });
  });
});

describe("InvoiceService.resolveDownload", () => {
  test("returns notFound for missing order", async () => {
    const repo = { findOne: mock(async () => null), save: mock(async () => {}) } as any;
    const svc = new InvoiceService(repo, makeMedia());
    expect(await svc.resolveDownload("nope", "user-1")).toEqual({ notFound: true });
  });

  test("returns notFound when order belongs to another user (no existence oracle)", async () => {
    const repo = {
      findOne: mock(async () => makeOrder({ user_id: "other" })),
      save: mock(async () => {}),
    } as any;
    const svc = new InvoiceService(repo, makeMedia());
    expect(await svc.resolveDownload("ord-1", "user-1")).toEqual({ notFound: true });
  });

  test("lazily generates then returns a signed url when key missing", async () => {
    const order = makeOrder();
    const repo = { findOne: mock(async () => order), save: mock(async (o: any) => o) } as any;
    const media = makeMedia();
    const svc = new InvoiceService(repo, media);

    const result = await svc.resolveDownload("ord-1", "user-1");

    expect(media.uploadBuffer).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ url: "https://signed/x.pdf" });
  });

  test("allows admin or super_admin to download order belonging to another user", async () => {
    const order = makeOrder({ user_id: "other" });
    const repo = { findOne: mock(async () => order), save: mock(async (o: any) => o) } as any;
    const media = makeMedia();
    const svc = new InvoiceService(repo, media);

    const result = await svc.resolveDownload("ord-1", "admin-1", "admin");

    expect(result).toEqual({ url: "https://signed/x.pdf" });
  });
});
