export interface MappingField {
  target: string;
  source?: string;
  value_map?: Record<string, unknown>;
  default?: unknown;
  expression?: string;
}

export interface MappingSpec {
  version: 1;
  constants?: Record<string, unknown>;
  fields: MappingField[];
}

export type Direction = "outbound" | "inbound";

export type EventType =
  | "vendor_order.created"
  | "vendor_order.status_changed"
  | "shipment.created"
  | "shipment.status_changed"
  | "order.accept"
  | "order.reject"
  | "shipment.create"
  | "shipment.update_status"
  | "inventory.adjust"
  | "product.update_price"
  | "product.update_attribute";

export const OUTBOUND_EVENTS: EventType[] = [
  "vendor_order.created",
  "vendor_order.status_changed",
  "shipment.created",
  "shipment.status_changed",
];

export const INBOUND_EVENTS: EventType[] = [
  "order.accept",
  "order.reject",
  "shipment.create",
  "shipment.update_status",
  "inventory.adjust",
  "product.update_price",
  "product.update_attribute",
];

export interface ExpressionFunctionDoc {
  name: string;
  arity: number;
  signature: string;
}

export const EXPRESSION_FUNCTIONS: ExpressionFunctionDoc[] = [
  { name: "formatDate", arity: 2, signature: "formatDate(value, 'YYYY-MM-DD')" },
  { name: "concat", arity: -1, signature: "concat(a, b, ' ')" },
  { name: "multiply", arity: 2, signature: "multiply(value, 0.01)" },
  { name: "divide", arity: 2, signature: "divide(value, 100)" },
  { name: "default", arity: 2, signature: "default(value, 'fallback')" },
  { name: "toUpper", arity: 1, signature: "toUpper(value)" },
  { name: "toLower", arity: 1, signature: "toLower(value)" },
];
