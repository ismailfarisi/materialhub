// cart-totals.ts
// Pure helpers for computing cart aggregate totals from line items + gift boxes.
// DB-free so they can be unit-tested in isolation.

export interface CartLineTotal {
  line_total: number;
}

export interface CartGiftBoxTotal {
  unit_price: number;
  quantity: number;
}

export interface CartTotals {
  subtotal: number;
  itemCount: number;
}

/**
 * subtotal = sum(cart_items.line_total) + sum(gift_box.unit_price * quantity)
 * item_count = cart_items.length + gift_boxes.length
 */
export function computeCartTotals(
  items: CartLineTotal[],
  giftBoxes: CartGiftBoxTotal[],
): CartTotals {
  const itemsSubtotal = items.reduce((sum, i) => sum + i.line_total, 0);
  const giftBoxSubtotal = giftBoxes.reduce((sum, gb) => sum + gb.unit_price * gb.quantity, 0);
  return {
    subtotal: itemsSubtotal + giftBoxSubtotal,
    itemCount: items.length + giftBoxes.length,
  };
}
