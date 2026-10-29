// Pure shaping of an order graph into a print-ready receipt view model.
// No I/O, no formatting library — deterministic and fully unit-testable.

export interface OrderWithReceiptRelations {
  order_number: string;
  created_at: Date;
  currency: string;
  subtotal: number;
  discount_total: number;
  shipping_total: number;
  surcharge_total: number;
  tax_total: number;
  grand_total: number;
  refund_total: number;
  coupon_code: string | null;
  shipping_address: Record<string, unknown> | null;
  vendorOrders: Array<{
    vendor_order_number: string;
    vendor?: { business_name?: string | null } | null;
    items: Array<{
      product_name: string;
      variant_name: string | null;
      quantity: number;
      unit_price: number;
      line_total: number;
    }>;
  }>;
}

export interface ReceiptLineItem {
  name: string;
  variant: string | null;
  qtyUnitLabel: string;
  lineTotal: string;
}

export interface ReceiptVendorGroup {
  vendorName: string;
  vendorOrderNumber: string;
  items: ReceiptLineItem[];
}

export interface ReceiptTotals {
  subtotal: string;
  discount: string | null;
  couponCode: string | null;
  shipping: string;
  surcharge: string | null;
  vat: string;
  grandTotal: string;
  refund: string | null;
}

export interface ReceiptAddress {
  name: string;
  lines: string[];
  phone: string | null;
}

export interface ReceiptViewModel {
  reference: string;
  dateLabel: string;
  address: ReceiptAddress;
  vendorGroups: ReceiptVendorGroup[];
  totals: ReceiptTotals;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function money(fils: number): string {
  return `AED ${(fils / 100).toFixed(2)}`;
}

function formatDate(d: Date): string {
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function buildAddress(raw: Record<string, unknown> | null): ReceiptAddress {
  const a = raw ?? {};
  const name =
    str(a.full_name) ??
    ([str(a.first_name), str(a.last_name)].filter(Boolean).join(" ").trim() || "");
  const lines = [
    [str(a.building_name), str(a.apartment), str(a.floor)].filter(Boolean).join(", "),
    [str(a.address_line_1) ?? str(a.street), str(a.address_line_2) ?? str(a.area)]
      .filter(Boolean)
      .join(", "),
    [str(a.city), str(a.state) ?? str(a.emirate), str(a.country_code)].filter(Boolean).join(", "),
  ].filter((l) => l.length > 0);
  return { name, lines, phone: str(a.phone) };
}

export function buildReceiptViewModel(order: OrderWithReceiptRelations): ReceiptViewModel {
  const vendorGroups: ReceiptVendorGroup[] = order.vendorOrders.map((vo) => ({
    vendorName: vo.vendor?.business_name ?? "Vendor",
    vendorOrderNumber: vo.vendor_order_number,
    items: vo.items.map((it) => ({
      name: it.product_name,
      variant: it.variant_name,
      qtyUnitLabel: `${it.quantity} × ${money(it.unit_price)}`,
      lineTotal: money(it.line_total),
    })),
  }));

  const totals: ReceiptTotals = {
    subtotal: money(order.subtotal),
    discount: order.discount_total > 0 ? `-${money(order.discount_total)}` : null,
    couponCode: order.discount_total > 0 ? order.coupon_code : null,
    shipping: order.shipping_total > 0 ? money(order.shipping_total) : "Free",
    surcharge: order.surcharge_total > 0 ? money(order.surcharge_total) : null,
    vat: money(order.tax_total),
    grandTotal: money(order.grand_total),
    refund: order.refund_total > 0 ? `-${money(order.refund_total)}` : null,
  };

  return {
    reference: order.order_number,
    dateLabel: formatDate(order.created_at),
    address: buildAddress(order.shipping_address),
    vendorGroups,
    totals,
  };
}
