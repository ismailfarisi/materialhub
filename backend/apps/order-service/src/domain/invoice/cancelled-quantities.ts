// cancelled-quantities.ts — what was taken out of an order BEFORE it was
// supplied, per order item.
//
// `order_items.refunded_quantity` / `refunded_amount` are shared counters:
// the admin item cancellation (OrderItemCancellationService) and the return
// refund (ReturnService.processRefund) both bump them. The two mean different
// things for VAT:
//
//   - a cancellation is a supply that never happened. It is not invoiced at
//     all: the tax invoice and the receipt show only what was supplied.
//   - a return is a supply that happened and was later reversed. The original
//     tax invoice stays as issued; under UAE VAT the reversal is documented
//     by a tax credit note against it (there is no credit-note flow yet, see
//     taxInvoiceDeferral). A return must therefore NOT shrink the invoice.
//
// So cancellations are read from their own ledger, `order_item_cancellations`
// (one row per cancel, its `items` jsonb carries quantity and refund amount
// per line), never from the shared counters. Only `completed` rows count: a
// `pending` row is a cancel whose bookkeeping has not committed yet.

export interface CancelledLine {
  quantity: number;
  /** Gross fils taken off the line (the cancellation's refund_amount for it). */
  amount: number;
}

export type CancelledByItem = Record<string, CancelledLine>;

interface CancellationRow {
  items?: unknown;
}

/** Fold cancellation rows into per-item totals. Pure. */
export function cancelledByItem(rows: CancellationRow[] | null | undefined): CancelledByItem {
  const out: CancelledByItem = {};
  for (const row of rows ?? []) {
    const raw = typeof row?.items === "string" ? safeJson(row.items) : row?.items;
    if (!Array.isArray(raw)) continue;
    for (const it of raw as Array<Record<string, unknown>>) {
      const id = typeof it?.order_item_id === "string" ? it.order_item_id : null;
      if (!id) continue;
      const prev = out[id] ?? { quantity: 0, amount: 0 };
      prev.quantity += Math.max(0, Math.trunc(Number(it.quantity) || 0));
      prev.amount += Math.max(0, Math.trunc(Number(it.refund_amount) || 0));
      out[id] = prev;
    }
  }
  return out;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

interface QueryRunnerLike {
  query(sql: string, params?: unknown[]): Promise<unknown>;
}

/** Load the completed item cancellations of an order. */
export async function loadCancelledByItem(
  manager: QueryRunnerLike | null | undefined,
  orderId: string,
): Promise<CancelledByItem> {
  if (!manager || typeof manager.query !== "function") return {};
  const rows = (await manager.query(
    `SELECT items FROM order_item_cancellations
      WHERE order_id = $1 AND status = 'completed' AND deleted_at IS NULL`,
    [orderId],
  )) as CancellationRow[];
  return cancelledByItem(Array.isArray(rows) ? rows : []);
}

/** What of one order line was actually supplied (quantity and gross fils). */
export function suppliedPart(
  item: { id?: string; quantity: number; line_total: number; status?: string | null },
  cancelled: CancelledByItem | null | undefined,
): { quantity: number; gross: number; cancelledQuantity: number } {
  const c = item.id ? cancelled?.[item.id] : undefined;
  const qty = Number(item.quantity) || 0;
  const total = Number(item.line_total) || 0;
  if (!c) {
    // A line flagged cancelled with no ledger row (legacy data): nothing supplied.
    if (item.status === "cancelled") return { quantity: 0, gross: 0, cancelledQuantity: qty };
    return { quantity: qty, gross: total, cancelledQuantity: 0 };
  }
  const quantity = Math.max(0, qty - c.quantity);
  const gross = quantity === 0 ? 0 : Math.max(0, total - c.amount);
  return { quantity, gross, cancelledQuantity: qty - quantity };
}
