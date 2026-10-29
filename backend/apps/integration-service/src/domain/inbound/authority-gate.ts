import { IntegrationAuthority, IntegrationEventType } from "@materialhub/database";

export interface AuthorityDecision {
  action: "apply" | "stage";
  autoApplied?: boolean;
  thresholdBreached?: boolean;
}

export interface AuthorityThresholds {
  inventoryDeltaPct?: number;
  currentInventory?: number;
  pricePct?: number;
  currentPrice?: number;
}

const D_E_EVENTS = new Set<string>([
  IntegrationEventType.inventory_adjust,
  IntegrationEventType.product_update_price,
  IntegrationEventType.product_update_attribute,
]);

export function decideAuthority(
  eventType: IntegrationEventType,
  integration: {
    inventory_authority: IntegrationAuthority;
    pricing_authority: IntegrationAuthority;
  },
  payload: Record<string, unknown> = {},
  thresholds: AuthorityThresholds = {},
): AuthorityDecision {
  if (!D_E_EVENTS.has(eventType)) return { action: "apply" };

  const isInventory = eventType === IntegrationEventType.inventory_adjust;
  const mode = isInventory ? integration.inventory_authority : integration.pricing_authority;
  if (mode === IntegrationAuthority.authoritative) return { action: "apply" };

  // advisory — check threshold
  if (isInventory && thresholds.inventoryDeltaPct !== undefined && thresholds.currentInventory) {
    const delta = Math.abs(Number(payload.delta ?? 0));
    const pct = (delta / thresholds.currentInventory) * 100;
    if (pct <= thresholds.inventoryDeltaPct) {
      return { action: "apply", autoApplied: true };
    }
    return { action: "stage", thresholdBreached: true };
  }
  if (
    eventType === IntegrationEventType.product_update_price &&
    thresholds.pricePct !== undefined &&
    thresholds.currentPrice
  ) {
    const newPrice = Number(payload.price_fils ?? 0);
    const pct = (Math.abs(newPrice - thresholds.currentPrice) / thresholds.currentPrice) * 100;
    if (pct <= thresholds.pricePct) {
      return { action: "apply", autoApplied: true };
    }
    return { action: "stage", thresholdBreached: true };
  }

  return { action: "stage" };
}
