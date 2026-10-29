import { describe, expect, it } from "bun:test";
import {
  formatMoney,
  renderCustomerOrderEmail,
  renderItemsCancelledEmail,
  renderVendorOrderEmail,
} from "./order-email-templates.ts";

const baseCustomer = {
  orderNumber: "FKS-2026-000123",
  orderId: "order-uuid-1",
  customerName: "Layla",
  currency: "AED",
  items: [
    {
      product_name: "Oud Royale",
      variant_name: "100ml",
      product_image_url: null,
      quantity: 1,
      line_total: 42000,
    },
    {
      product_name: "Rose Serum",
      variant_name: null,
      product_image_url: null,
      quantity: 2,
      line_total: 23800,
    },
  ],
  subtotal: 65800,
  discountTotal: 5000,
  shippingTotal: 1500,
  surchargeTotal: 0,
  taxTotal: 3133,
  grandTotal: 62300,
  paymentLabel: "Card",
  isCod: false,
  shippingAddress: { first_name: "Layla", city: "Dubai" },
};

describe("formatMoney", () => {
  it("renders fils as a 2dp major-unit amount with currency", () => {
    expect(formatMoney(42000)).toBe("AED 420.00");
    expect(formatMoney(5, "AED")).toBe("AED 0.05");
    expect(formatMoney(0)).toBe("AED 0.00");
  });
});

describe("renderCustomerOrderEmail", () => {
  it("includes the order number in the subject and body", () => {
    const email = renderCustomerOrderEmail(baseCustomer);
    expect(email.subject).toContain("FKS-2026-000123");
    expect(email.html).toContain("FKS-2026-000123");
    expect(email.text).toContain("FKS-2026-000123");
  });

  it("lists every line item with quantity and total", () => {
    const email = renderCustomerOrderEmail(baseCustomer);
    expect(email.html).toContain("Oud Royale");
    expect(email.html).toContain("Rose Serum");
    expect(email.html).toContain("AED 420.00");
    expect(email.html).toContain("AED 238.00");
    expect(email.text).toContain("Oud Royale (100ml) x1");
  });

  it("shows the paid wording for prepaid and the grand total incl. VAT", () => {
    const email = renderCustomerOrderEmail(baseCustomer);
    expect(email.html).toContain("received your payment");
    expect(email.html).toContain("AED 623.00");
  });

  it("shows cash-on-delivery wording and a COD fee when isCod", () => {
    const email = renderCustomerOrderEmail({
      ...baseCustomer,
      isCod: true,
      surchargeTotal: 1000,
      paymentLabel: "Cash on Delivery",
    });
    expect(email.html).toContain("pay");
    expect(email.html).toContain("cash");
    expect(email.html).toContain("COD fee");
    expect(email.html).toContain("AED 10.00");
  });

  it("only shows a discount row when there is a discount", () => {
    const withDiscount = renderCustomerOrderEmail(baseCustomer);
    expect(withDiscount.html).toContain("Discount");
    const noDiscount = renderCustomerOrderEmail({ ...baseCustomer, discountTotal: 0 });
    expect(noDiscount.html).not.toContain("Discount");
  });

  it("escapes HTML in product names to prevent injection", () => {
    const email = renderCustomerOrderEmail({
      ...baseCustomer,
      items: [
        {
          product_name: "<script>alert(1)</script>",
          variant_name: null,
          product_image_url: null,
          quantity: 1,
          line_total: 100,
        },
      ],
    });
    expect(email.html).not.toContain("<script>alert(1)</script>");
    expect(email.html).toContain("&lt;script&gt;");
  });

  it("links to the account order page (not the .pdf endpoint) for the receipt download", () => {
    const email = renderCustomerOrderEmail(baseCustomer);
    const expectedUrl = `/account/orders/${baseCustomer.orderId}`;
    expect(email.html).toContain("Download your receipt");
    expect(email.html).toContain(expectedUrl);
    expect(email.html).not.toMatch(/Download your receipt[\s\S]*?\.pdf/);
    expect(email.text).toContain("Download your receipt: ");
    expect(email.text).toContain(expectedUrl);
  });
});

describe("renderVendorOrderEmail", () => {
  const baseVendor = {
    vendorName: "Maison Oud",
    vendorOrderNumber: "FKS-2026-000123-V1",
    masterOrderNumber: "FKS-2026-000123",
    currency: "AED",
    items: [
      {
        product_name: "Oud Royale",
        variant_name: "100ml",
        product_image_url: null,
        quantity: 2,
        line_total: 84000,
      },
    ],
    subtotal: 84000,
    isCod: false,
    processingDeadline: new Date("2026-07-07T12:00:00Z"),
    shippingAddress: { first_name: "Layla", city: "Dubai" },
  };

  it("names the vendor and both order numbers", () => {
    const email = renderVendorOrderEmail(baseVendor);
    expect(email.subject).toContain("FKS-2026-000123-V1");
    expect(email.html).toContain("Maison Oud");
    expect(email.html).toContain("FKS-2026-000123-V1");
    expect(email.html).toContain("FKS-2026-000123");
  });

  it("shows captured-payment wording for prepaid and COD wording for COD", () => {
    expect(renderVendorOrderEmail(baseVendor).html).toContain("captured");
    expect(renderVendorOrderEmail({ ...baseVendor, isCod: true }).html).toContain(
      "Cash on Delivery",
    );
  });

  it("totals the vendor subtotal and the unit count", () => {
    const email = renderVendorOrderEmail(baseVendor);
    expect(email.html).toContain("AED 840.00");
    expect(email.html).toContain("2 units");
  });
});

describe("renderItemsCancelledEmail", () => {
  const baseCancellation = {
    orderNumber: "ORD-1",
    customerName: "Sara",
    currency: "AED",
    items: [{ product_name: "Serum", variant_name: null, quantity: 2, refund_amount: 7000 }],
    refundAmount: 7000,
    refundMethod: "stripe" as const,
  };

  it("lists items and refund wording", () => {
    const email = renderItemsCancelledEmail(baseCancellation);
    expect(email.subject).toContain("ORD-1");
    expect(email.html).toContain("Serum");
    expect(email.html).toContain("refunded to your card");
  });

  it("COD wording differs", () => {
    const email = renderItemsCancelledEmail({
      ...baseCancellation,
      refundMethod: "cod_uncollected",
    });
    expect(email.html).toContain("won't be charged");
  });

  it("shows the variant name and per-item refund amount when present", () => {
    const email = renderItemsCancelledEmail({
      ...baseCancellation,
      items: [{ product_name: "Lipstick", variant_name: "Red", quantity: 1, refund_amount: 5000 }],
    });
    expect(email.html).toContain("Lipstick");
    expect(email.html).toContain("Red");
    expect(email.html).toContain("AED 50.00");
  });

  it("escapes HTML in product names", () => {
    const email = renderItemsCancelledEmail({
      ...baseCancellation,
      items: [
        {
          product_name: "<script>alert(1)</script>",
          variant_name: null,
          quantity: 1,
          refund_amount: 100,
        },
      ],
    });
    expect(email.html).not.toContain("<script>alert(1)</script>");
    expect(email.html).toContain("&lt;script&gt;");
  });
});
