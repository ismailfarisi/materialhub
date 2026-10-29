import { inventoryAdjustTarget } from "./inventory-adjust.ts";
import { orderAcceptTarget } from "./order-accept.ts";
import { orderRejectTarget } from "./order-reject.ts";
import { productUpdateAttributeTarget } from "./product-update-attribute.ts";
import { productUpdatePriceTarget } from "./product-update-price.ts";
import { shipmentCreateTarget } from "./shipment-create.ts";
import { shipmentUpdateStatusTarget } from "./shipment-update-status.ts";

export const inboundTargets = {
  "order.accept": orderAcceptTarget,
  "order.reject": orderRejectTarget,
  "shipment.create": shipmentCreateTarget,
  "shipment.update_status": shipmentUpdateStatusTarget,
  "inventory.adjust": inventoryAdjustTarget,
  "product.update_price": productUpdatePriceTarget,
  "product.update_attribute": productUpdateAttributeTarget,
} as const;

export type InboundTargetId = keyof typeof inboundTargets;
