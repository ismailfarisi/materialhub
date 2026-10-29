// cart-totals.ts
// Pure helpers for computing cart aggregate totals from line items.
// DB-free so they can be unit-tested in isolation.

export interface CartLineTotal {
  line_total: number;
}

export interface CartTotals {
  subtotal: number;
  itemCount: number;
}

/**
 * subtotal = sum(cart_items.line_total)
 * item_count = cart_items.length
 */
export function computeCartTotals(items: CartLineTotal[]): CartTotals {
  return {
    subtotal: items.reduce((sum, i) => sum + i.line_total, 0),
    itemCount: items.length,
  };
}
