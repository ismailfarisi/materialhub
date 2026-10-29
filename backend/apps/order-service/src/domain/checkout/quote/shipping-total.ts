import { type DgItem, type DgRate, formDeliveryGroups } from "./delivery-groups.ts";

export interface SelectedShippingInput {
  items: DgItem[];
  rates: DgRate[];
  zoneId: string | null;
  vendorHolidays: Set<string>;
  subtotalFils: number;
}

/**
 * Charged shipping (fils) = sum over delivery groups of the cheapest available
 * method's price. This is the single definition shared by the checkout quote
 * and order creation so the displayed total always matches the charged total.
 * Returns 0 when there are no items. Groups with no available method contribute
 * nothing here; availability/blocking is surfaced separately by the quote.
 */
export function selectedShippingFils(input: SelectedShippingInput): number {
  if (input.items.length === 0) return 0;
  const groups = formDeliveryGroups(input);
  let total = 0;
  for (const g of groups) {
    if (g.methods.length === 0) continue;
    const cheapest = [...g.methods].sort((a, b) => a.price_fils - b.price_fils)[0];
    if (cheapest) total += cheapest.price_fils;
  }
  return total;
}
