// Rich transactional order emails (customer confirmation + vendor new-order).
//
// These are pure render functions — no I/O, no DB — so they are trivially unit
// testable and safe to snapshot. The HTML is deliberately email-client-safe:
// table-based layout, all styles inlined, a single 600px column, no <style>
// blocks, no external CSS/fonts, and web-safe font stacks. The only remote
// assets are product image URLs (already absolute S3/CDN URLs on order_items);
// every image has a fixed size and alt text so a blocked image still renders a
// tidy layout.
//
// Palette is the MaterialHub brand (mirrors apps/web globals.css tokens, converted
// to hex because email clients don't resolve CSS custom properties):
//   espresso #2e1a0f  cacao #311b12  russet #6c4b37
//   amber    #c47f31  linen #f1ebe4  pearl  #f6f2ee  border #dad1c8

const COLORS = {
  espresso: "#2e1a0f",
  cacao: "#311b12",
  russet: "#6c4b37",
  amber: "#c47f31",
  linen: "#f1ebe4",
  pearl: "#f6f2ee",
  border: "#dad1c8",
  white: "#ffffff",
} as const;

const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const APP_URL = process.env.APP_URL || "https://materialhubuae.com";

export interface EmailLineItem {
  product_name: string;
  variant_name?: string | null;
  product_image_url?: string | null;
  quantity: number;
  line_total: number; // fils, VAT-inclusive
}

export interface CustomerOrderEmailData {
  orderNumber: string;
  orderId: string;
  customerName?: string | null;
  currency: string;
  items: EmailLineItem[];
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  surchargeTotal: number;
  taxTotal: number;
  grandTotal: number;
  paymentLabel: string; // "Card", "Cash on Delivery", "Tabby", "Tamara"
  isCod: boolean;
  shippingAddress?: Record<string, unknown> | null;
}

export interface VendorOrderEmailData {
  vendorName: string;
  vendorOrderNumber: string;
  masterOrderNumber: string;
  currency: string;
  items: EmailLineItem[];
  subtotal: number; // vendor subtotal, fils
  isCod: boolean;
  processingDeadline?: Date | string | null;
  shippingAddress?: Record<string, unknown> | null;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface ItemsCancelledLineItem {
  product_name: string;
  variant_name?: string | null;
  quantity: number;
  refund_amount: number; // fils
}

export interface ItemsCancelledEmailData {
  orderNumber: string;
  customerName?: string | null;
  currency: string;
  items: ItemsCancelledLineItem[];
  refundAmount: number; // fils
  refundMethod: string; // "stripe" | "cod_uncollected"
}

/** fils → "AED 129.00". All money in the system is stored in the minor unit. */
export function formatMoney(fils: number, currency = "AED"): string {
  const major = (fils || 0) / 100;
  return `${currency} ${major.toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Minimal HTML entity escaping for interpolated, potentially user-derived text. */
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Render a shipping address object into safe, comma-joined lines. */
function formatAddress(addr?: Record<string, unknown> | null): string[] {
  if (!addr) return [];
  const a = addr as Record<string, string | undefined>;
  const name = [a.first_name, a.last_name].filter(Boolean).join(" ") || a.name;
  const line1 = a.address_line_1 || a.line1 || a.street || a.address;
  const line2 = a.address_line_2 || a.line2;
  const cityLine = [a.area, a.city, a.emirate].filter(Boolean).join(", ");
  const country = a.country || "United Arab Emirates";
  return [name, line1, line2, cityLine, country, a.phone].filter(Boolean).map((s) => esc(s));
}

function itemRows(items: EmailLineItem[], currency: string): string {
  return items
    .map((it) => {
      const img = it.product_image_url
        ? `<img src="${esc(it.product_image_url)}" width="56" height="56" alt="" style="display:block;width:56px;height:56px;border-radius:8px;object-fit:cover;border:1px solid ${COLORS.border};" />`
        : `<div style="width:56px;height:56px;border-radius:8px;background:${COLORS.pearl};border:1px solid ${COLORS.border};"></div>`;
      const variant = it.variant_name
        ? `<div style="color:${COLORS.russet};font-size:13px;margin-top:2px;">${esc(it.variant_name)}</div>`
        : "";
      return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid ${COLORS.border};vertical-align:top;width:56px;">${img}</td>
        <td style="padding:12px 12px;border-bottom:1px solid ${COLORS.border};vertical-align:top;">
          <div style="color:${COLORS.cacao};font-size:15px;font-weight:600;line-height:1.35;">${esc(it.product_name)}</div>
          ${variant}
          <div style="color:${COLORS.russet};font-size:13px;margin-top:4px;">Qty ${esc(it.quantity)}</div>
        </td>
        <td style="padding:12px 0;border-bottom:1px solid ${COLORS.border};vertical-align:top;text-align:right;white-space:nowrap;color:${COLORS.cacao};font-size:15px;font-weight:600;">
          ${esc(formatMoney(it.line_total, currency))}
        </td>
      </tr>`;
    })
    .join("");
}

function totalsRow(
  label: string,
  value: string,
  opts: { strong?: boolean; muted?: boolean } = {},
): string {
  const color = opts.strong ? COLORS.cacao : opts.muted ? COLORS.russet : COLORS.cacao;
  const weight = opts.strong ? "700" : "400";
  const size = opts.strong ? "17px" : "14px";
  const pad = opts.strong ? "12px 0 0" : "5px 0";
  const borderTop = opts.strong ? `border-top:2px solid ${COLORS.espresso};` : "";
  return `
    <tr>
      <td style="padding:${pad};color:${color};font-size:${size};font-weight:${weight};${borderTop}">${esc(label)}</td>
      <td style="padding:${pad};color:${color};font-size:${size};font-weight:${weight};text-align:right;white-space:nowrap;${borderTop}">${esc(value)}</td>
    </tr>`;
}

/** Shared branded shell. `preheader` is the hidden inbox-preview snippet. */
function shell(opts: {
  preheader: string;
  eyebrow: string;
  heading: string;
  intro: string;
  bodyInner: string;
  footerNote?: string;
}): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<title>${esc(opts.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.linen};font-family:${FONT};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${COLORS.linen};font-size:1px;line-height:1px;">${esc(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.linen};padding:24px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:${COLORS.white};border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(46,26,15,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:${COLORS.espresso};padding:28px 32px;">
            <div style="color:${COLORS.white};font-size:22px;font-weight:700;letter-spacing:2px;">MATERIALHUB</div>
            <div style="color:${COLORS.amber};font-size:11px;letter-spacing:3px;text-transform:uppercase;margin-top:4px;">${esc(opts.eyebrow)}</div>
          </td>
        </tr>
        <!-- Intro -->
        <tr>
          <td style="padding:32px 32px 8px;">
            <h1 style="margin:0;color:${COLORS.cacao};font-size:24px;font-weight:700;line-height:1.25;">${esc(opts.heading)}</h1>
            <p style="margin:12px 0 0;color:${COLORS.russet};font-size:15px;line-height:1.6;">${opts.intro}</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:20px 32px 32px;">
            ${opts.bodyInner}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:${COLORS.pearl};padding:24px 32px;border-top:1px solid ${COLORS.border};">
            <p style="margin:0;color:${COLORS.russet};font-size:13px;line-height:1.6;">${opts.footerNote ? opts.footerNote : `Questions about your order? Reach us at <a href="mailto:support@materialhubuae.com" style="color:${COLORS.amber};text-decoration:none;">support@materialhubuae.com</a>.`}</p>
            <p style="margin:14px 0 0;color:${COLORS.russet};font-size:12px;">MaterialHub — Beauty &amp; Fragrance Marketplace, United Arab Emirates</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function ctaButton(label: string, href: string): string {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 4px;">
    <tr>
      <td style="border-radius:10px;background:${COLORS.amber};">
        <a href="${esc(href)}" style="display:inline-block;padding:13px 28px;color:${COLORS.white};font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;">${esc(label)}</a>
      </td>
    </tr>
  </table>`;
}

function addressBlock(addr?: Record<string, unknown> | null): string {
  const lines = formatAddress(addr);
  if (lines.length === 0) return "";
  return `
  <div style="margin-top:24px;">
    <div style="color:${COLORS.russet};font-size:12px;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:6px;">Shipping to</div>
    <div style="color:${COLORS.cacao};font-size:14px;line-height:1.6;">${lines.join("<br />")}</div>
  </div>`;
}

// ── Customer order confirmation ──────────────────────────────────────────────

export function renderCustomerOrderEmail(data: CustomerOrderEmailData): RenderedEmail {
  // Account order-detail page, not the `.pdf` API endpoint directly — that
  // endpoint requires an auth token the email can't carry. The page hosts the
  // receipt download control (lazy-generated via InvoiceService). Reuses the
  // same APP_URL the "View your order" CTA below already resolves with, so
  // both links share one prod-safe base and stay in sync if that ever changes.
  const orderUrl = `${APP_URL}/account/orders/${encodeURIComponent(data.orderId)}`;
  const greeting = data.customerName ? `Hi ${esc(data.customerName)},` : "Hi there,";
  const paidLine = data.isCod
    ? `You'll pay <strong>${esc(formatMoney(data.grandTotal, data.currency))}</strong> in cash when your order is delivered.`
    : `We've received your payment of <strong>${esc(formatMoney(data.grandTotal, data.currency))}</strong>.`;

  const totals: string[] = [
    totalsRow("Subtotal", formatMoney(data.subtotal, data.currency), { muted: true }),
  ];
  if (data.discountTotal > 0)
    totals.push(
      totalsRow("Discount", `− ${formatMoney(data.discountTotal, data.currency)}`, { muted: true }),
    );
  totals.push(
    totalsRow(
      "Shipping",
      data.shippingTotal > 0 ? formatMoney(data.shippingTotal, data.currency) : "Free",
      { muted: true },
    ),
  );
  if (data.surchargeTotal > 0)
    totals.push(
      totalsRow("COD fee", formatMoney(data.surchargeTotal, data.currency), { muted: true }),
    );
  totals.push(
    totalsRow("Total (incl. VAT)", formatMoney(data.grandTotal, data.currency), { strong: true }),
  );

  const bodyInner = `
  <p style="margin:0 0 20px;color:${COLORS.russet};font-size:15px;line-height:1.6;">${greeting} ${paidLine}</p>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.pearl};border-radius:12px;padding:2px 16px;margin-bottom:8px;">
    <tr>
      <td style="padding:14px 4px;">
        <span style="color:${COLORS.russet};font-size:12px;letter-spacing:1.5px;text-transform:uppercase;">Order</span>
        <span style="color:${COLORS.cacao};font-size:15px;font-weight:700;margin-left:8px;">${esc(data.orderNumber)}</span>
      </td>
      <td style="padding:14px 4px;text-align:right;">
        <span style="color:${COLORS.russet};font-size:13px;">${esc(data.paymentLabel)}</span>
      </td>
    </tr>
  </table>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    ${itemRows(data.items, data.currency)}
  </table>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
    ${totals.join("")}
  </table>

  ${addressBlock(data.shippingAddress)}

  ${ctaButton("View your order", orderUrl)}

  <p style="margin:12px 0 0;"><a href="${esc(orderUrl)}" style="color:${COLORS.amber};font-size:13px;font-weight:600;text-decoration:none;">Download your receipt</a></p>

  <p style="margin:20px 0 0;color:${COLORS.russet};font-size:13px;line-height:1.6;">We'll email you again as soon as your items are on their way. Orders with more than one brand may arrive in separate parcels.</p>`;

  const html = shell({
    preheader: `Order ${data.orderNumber} confirmed — ${formatMoney(data.grandTotal, data.currency)}`,
    eyebrow: "Order Confirmed",
    heading: "Thank you for your order",
    intro: "Your order is confirmed and now with our brands for fulfilment.",
    bodyInner,
  });

  const text = [
    "Thank you for your order",
    "",
    `${data.customerName ? `Hi ${data.customerName},` : "Hi there,"}`,
    data.isCod
      ? `You'll pay ${formatMoney(data.grandTotal, data.currency)} in cash on delivery.`
      : `We've received your payment of ${formatMoney(data.grandTotal, data.currency)}.`,
    "",
    `Order ${data.orderNumber} (${data.paymentLabel})`,
    ...data.items.map(
      (it) =>
        `  - ${it.product_name}${it.variant_name ? ` (${it.variant_name})` : ""} x${it.quantity} — ${formatMoney(it.line_total, data.currency)}`,
    ),
    "",
    `Subtotal: ${formatMoney(data.subtotal, data.currency)}`,
    data.discountTotal > 0 ? `Discount: -${formatMoney(data.discountTotal, data.currency)}` : "",
    `Shipping: ${data.shippingTotal > 0 ? formatMoney(data.shippingTotal, data.currency) : "Free"}`,
    data.surchargeTotal > 0 ? `COD fee: ${formatMoney(data.surchargeTotal, data.currency)}` : "",
    `Total (incl. VAT): ${formatMoney(data.grandTotal, data.currency)}`,
    "",
    `View your order: ${orderUrl}`,
    `Download your receipt: ${orderUrl}`,
  ]
    .filter((l) => l !== "")
    .join("\n");

  return { subject: `Your MaterialHub order ${data.orderNumber} is confirmed`, html, text };
}

// ── Vendor new-order notification ────────────────────────────────────────────

export function renderVendorOrderEmail(data: VendorOrderEmailData): RenderedEmail {
  const deadline =
    data.processingDeadline &&
    new Date(data.processingDeadline).toLocaleDateString("en-AE", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  const payNote = data.isCod
    ? "This is a <strong>Cash on Delivery</strong> order — the customer pays the courier on delivery."
    : `Payment has been captured — you're clear to fulfil.`;
  const units = data.items.reduce((n, it) => n + it.quantity, 0);

  const bodyInner = `
  <p style="margin:0 0 20px;color:${COLORS.russet};font-size:15px;line-height:1.6;">You have a new paid order on MaterialHub. ${payNote}</p>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.pearl};border-radius:12px;margin-bottom:8px;">
    <tr>
      <td style="padding:14px 16px;">
        <span style="color:${COLORS.russet};font-size:12px;letter-spacing:1.5px;text-transform:uppercase;">Vendor order</span>
        <span style="color:${COLORS.cacao};font-size:15px;font-weight:700;margin-left:8px;">${esc(data.vendorOrderNumber)}</span>
        <div style="color:${COLORS.russet};font-size:12px;margin-top:4px;">Part of order ${esc(data.masterOrderNumber)}</div>
      </td>
      <td style="padding:14px 16px;text-align:right;">
        ${deadline ? `<div style="color:${COLORS.russet};font-size:12px;">Ship by</div><div style="color:${COLORS.cacao};font-size:15px;font-weight:700;">${esc(deadline)}</div>` : ""}
      </td>
    </tr>
  </table>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    ${itemRows(data.items, data.currency)}
  </table>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
    ${totalsRow(`Items subtotal (${units} unit${units === 1 ? "" : "s"})`, formatMoney(data.subtotal, data.currency), { strong: true })}
  </table>

  ${addressBlock(data.shippingAddress)}

  ${ctaButton("Open in vendor dashboard", `${APP_URL.replace("//", "//vendor.")}/orders`)}

  <p style="margin:20px 0 0;color:${COLORS.russet};font-size:13px;line-height:1.6;">Accept and prepare this order before the ship-by date to keep your fulfilment rate healthy.</p>`;

  const html = shell({
    preheader: `New order ${data.vendorOrderNumber} — ${formatMoney(data.subtotal, data.currency)}`,
    eyebrow: "New Order",
    heading: `New order for ${esc(data.vendorName)}`,
    intro: "A customer just placed an order that includes your products.",
    bodyInner,
    footerNote: `Manage this order in your <a href="${esc(APP_URL.replace("//", "//vendor."))}/orders" style="color:${COLORS.amber};text-decoration:none;">vendor dashboard</a>. Need help? Email <a href="mailto:vendors@materialhubuae.com" style="color:${COLORS.amber};text-decoration:none;">vendors@materialhubuae.com</a>.`,
  });

  const text = [
    `New order for ${data.vendorName}`,
    "",
    data.isCod
      ? "New Cash-on-Delivery order (customer pays courier on delivery)."
      : "New paid order — payment captured, clear to fulfil.",
    "",
    `Vendor order ${data.vendorOrderNumber} (part of ${data.masterOrderNumber})`,
    deadline ? `Ship by: ${deadline}` : "",
    ...data.items.map(
      (it) =>
        `  - ${it.product_name}${it.variant_name ? ` (${it.variant_name})` : ""} x${it.quantity} — ${formatMoney(it.line_total, data.currency)}`,
    ),
    "",
    `Items subtotal: ${formatMoney(data.subtotal, data.currency)}`,
  ]
    .filter((l) => l !== "")
    .join("\n");

  return { subject: `New order ${data.vendorOrderNumber} on MaterialHub`, html, text };
}

// ── Customer items-cancelled notice ──────────────────────────────────────────

export function renderItemsCancelledEmail(data: ItemsCancelledEmailData): RenderedEmail {
  const greeting = data.customerName ? `Hi ${esc(data.customerName)},` : "Hi there,";
  const isStripe = data.refundMethod === "stripe";
  const refundLine = isStripe
    ? `<strong>${esc(formatMoney(data.refundAmount, data.currency))}</strong> has been refunded to your card.`
    : "These items have been removed from your order — you won't be charged for them.";

  // Reuse the shared line-item row layout by mapping to its EmailLineItem shape
  // (refund amount stands in for line_total; there's no product image here).
  const lineItems: EmailLineItem[] = data.items.map((it) => ({
    product_name: it.product_name,
    variant_name: it.variant_name,
    product_image_url: null,
    quantity: it.quantity,
    line_total: it.refund_amount,
  }));

  const bodyInner = `
  <p style="margin:0 0 20px;color:${COLORS.russet};font-size:15px;line-height:1.6;">${greeting} We've cancelled the following item${data.items.length === 1 ? "" : "s"} from your order.</p>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.pearl};border-radius:12px;padding:2px 16px;margin-bottom:8px;">
    <tr>
      <td style="padding:14px 4px;">
        <span style="color:${COLORS.russet};font-size:12px;letter-spacing:1.5px;text-transform:uppercase;">Order</span>
        <span style="color:${COLORS.cacao};font-size:15px;font-weight:700;margin-left:8px;">${esc(data.orderNumber)}</span>
      </td>
    </tr>
  </table>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    ${itemRows(lineItems, data.currency)}
  </table>

  <p style="margin:20px 0 0;color:${COLORS.cacao};font-size:15px;line-height:1.6;">${refundLine}</p>

  <p style="margin:16px 0 0;color:${COLORS.russet};font-size:13px;line-height:1.6;">The rest of your order is unaffected and will continue as planned.</p>`;

  const html = shell({
    preheader: `Items cancelled from order ${data.orderNumber}`,
    eyebrow: "Order Update",
    heading: "Items cancelled from your order",
    intro: "One or more items in your order have been cancelled by our team.",
    bodyInner,
  });

  const text = [
    "Items cancelled from your order",
    "",
    data.customerName ? `Hi ${data.customerName},` : "Hi there,",
    `We've cancelled the following item${data.items.length === 1 ? "" : "s"} from order ${data.orderNumber}.`,
    "",
    ...data.items.map(
      (it) =>
        `  - ${it.product_name}${it.variant_name ? ` (${it.variant_name})` : ""} x${it.quantity} — ${formatMoney(it.refund_amount, data.currency)}`,
    ),
    "",
    isStripe
      ? `${formatMoney(data.refundAmount, data.currency)} has been refunded to your card.`
      : "These items have been removed from your order — you won't be charged for them.",
    "",
    "The rest of your order is unaffected and will continue as planned.",
  ].join("\n");

  return { subject: `Update on your MaterialHub order ${data.orderNumber}`, html, text };
}
