import type { IntegrationEventType } from "@materialhub/database";
import { serviceFetch } from "@materialhub/utils/src/service-fetch.ts";
import jwt from "jsonwebtoken";

export interface DomainDispatchInput {
  eventType: IntegrationEventType;
  vendorId: string;
  payload: Record<string, unknown>;
}

export interface DomainDispatchResult {
  status: number;
  body: string;
}

const ROUTE_MAP: Record<
  string,
  { host: "orderHost" | "productHost"; method: string; path: (p: any) => string }
> = {
  "order.accept": {
    host: "orderHost",
    method: "POST",
    path: (p) => `/internal/vendor-orders/${p.vendor_order_id}/transition`,
  },
  "order.reject": {
    host: "orderHost",
    method: "POST",
    path: (p) => `/internal/vendor-orders/${p.vendor_order_id}/transition`,
  },
  "shipment.create": {
    host: "orderHost",
    method: "POST",
    path: () => "/internal/shipments",
  },
  "shipment.update_status": {
    host: "orderHost",
    method: "POST",
    path: (p) => `/internal/shipments/${p.shipment_id}/transition`,
  },
  "inventory.adjust": {
    host: "productHost",
    method: "POST",
    path: () => "/internal/inventory/adjust",
  },
  "product.update_price": {
    host: "productHost",
    method: "POST",
    path: (p) => `/internal/products/${p.product_id}/patch`,
  },
  "product.update_attribute": {
    host: "productHost",
    method: "POST",
    path: (p) => `/internal/products/${p.product_id}/patch`,
  },
};

export class DomainDispatch {
  constructor(private hosts: { orderHost: string; productHost: string }) {}

  async call(input: DomainDispatchInput): Promise<DomainDispatchResult> {
    const route = ROUTE_MAP[input.eventType];
    if (!route) return { status: 400, body: `unknown event_type ${input.eventType}` };
    const host = this.hosts[route.host];
    const url = `${host}${route.path(input.payload)}`;
    const secret = process.env.INTERNAL_SERVICE_SECRET;
    if (!secret) return { status: 500, body: "INTERNAL_SERVICE_SECRET unset" };
    const token = jwt.sign({ iss: "integration-service" }, secret, { expiresIn: "1m" });

    const body =
      input.eventType === ("order.accept" as IntegrationEventType)
        ? { ...input.payload, action: "accept", vendor_id: input.vendorId }
        : input.eventType === ("order.reject" as IntegrationEventType)
          ? { ...input.payload, action: "reject", vendor_id: input.vendorId }
          : { ...input.payload, vendor_id: input.vendorId };

    const res = await serviceFetch(url, {
      method: route.method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    return { status: res.status, body: await res.text() };
  }
}
