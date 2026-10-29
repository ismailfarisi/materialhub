import { describe, expect, it } from "bun:test";
import { IntegrationAuthority } from "@materialhub/database";
import { decideAuthority } from "./authority-gate.ts";

describe("decideAuthority", () => {
  const integ = {
    inventory_authority: IntegrationAuthority.advisory,
    pricing_authority: IntegrationAuthority.advisory,
  };

  it("non-DE events always proceed", () => {
    expect(decideAuthority("shipment.create" as any, integ).action).toBe("apply");
    expect(decideAuthority("order.accept" as any, integ).action).toBe("apply");
  });

  it("D and E in advisory mode go to staging by default", () => {
    expect(decideAuthority("inventory.adjust" as any, integ).action).toBe("stage");
    expect(decideAuthority("product.update_price" as any, integ).action).toBe("stage");
    expect(decideAuthority("product.update_attribute" as any, integ).action).toBe("stage");
  });

  it("authoritative mode applies directly", () => {
    const a = {
      inventory_authority: IntegrationAuthority.authoritative,
      pricing_authority: IntegrationAuthority.authoritative,
    };
    expect(decideAuthority("inventory.adjust" as any, a).action).toBe("apply");
    expect(decideAuthority("product.update_price" as any, a).action).toBe("apply");
  });

  it("auto-applies small inventory delta below threshold", () => {
    const r = decideAuthority(
      "inventory.adjust" as any,
      integ,
      { delta: 5 },
      { inventoryDeltaPct: 10, currentInventory: 100 },
    );
    expect(r.action).toBe("apply");
    expect(r.autoApplied).toBe(true);
  });

  it("stages large inventory delta above threshold", () => {
    const r = decideAuthority(
      "inventory.adjust" as any,
      integ,
      { delta: 50 },
      { inventoryDeltaPct: 10, currentInventory: 100 },
    );
    expect(r.action).toBe("stage");
    expect(r.thresholdBreached).toBe(true);
  });
});
