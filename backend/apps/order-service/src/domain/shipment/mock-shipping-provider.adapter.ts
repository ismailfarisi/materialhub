import { createHmac, timingSafeEqual } from "node:crypto";
import { ShipmentStatus } from "@materialhub/database/src/enums/order.enums.ts";
import type {
  BookShipmentParams,
  BookShipmentResult,
  CredentialSchema,
  ShippingProviderAdapter,
  VerifyResult,
  WebhookEvent,
} from "./shipping-provider-adapter.ts";

const STATUS_MAP: Record<string, ShipmentStatus> = {
  pending: ShipmentStatus.pending,
  picked_up: ShipmentStatus.picked_up,
  in_transit: ShipmentStatus.in_transit,
  out_for_delivery: ShipmentStatus.out_for_delivery,
  delivered: ShipmentStatus.delivered,
  failed: ShipmentStatus.failed_delivery,
  failed_delivery: ShipmentStatus.failed_delivery,
  returned: ShipmentStatus.returned,
};

export class MockShippingProviderAdapter implements ShippingProviderAdapter {
  readonly code = "mock";
  readonly displayName = "Mock Provider";
  readonly credentialSchema: CredentialSchema = {
    type: "object",
    required: ["api_key", "warehouse_id"],
    properties: {
      api_key: {
        type: "string",
        title: "API Key",
        description: "Mock API key. Use any value starting with 'test_' to pass verification.",
        format: "password",
      },
      warehouse_id: {
        type: "string",
        title: "Warehouse ID",
        description: "Mock warehouse identifier.",
      },
    },
  };

  async verifyCredentials(creds: Record<string, string>): Promise<VerifyResult> {
    if (!creds.api_key || !creds.warehouse_id) {
      return {
        ok: false,
        message: "Missing required fields: api_key and warehouse_id are both required.",
      };
    }
    if (!creds.api_key.startsWith("test_")) {
      return {
        ok: false,
        message:
          "Invalid api_key: Mock provider requires an API key starting with 'test_' (e.g. 'test_abc123').",
      };
    }
    return { ok: true };
  }

  async bookShipment(
    params: BookShipmentParams,
    _creds: Record<string, string>,
  ): Promise<BookShipmentResult> {
    const ts = Date.now();
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    const tracking = `TRK-MOCK-${ts}-${rand}`;
    const totalWeightGrams = params.items.reduce((s, i) => s + i.weightGrams * i.quantity, 0);
    // 900 fils base + 100 fils per kg (minimum 900)
    const cost = Math.max(900, 900 + Math.ceil(totalWeightGrams / 1000) * 100);
    return {
      tracking_number: tracking,
      tracking_url: `https://track.mock.local/${tracking}`,
      carrier_cost_fils: cost,
      external_shipment_id: `mock-${ts}-${rand}`,
    };
  }

  verifyWebhook(headers: Headers, rawBody: string, sharedSecret: string | null): boolean {
    if (!sharedSecret) return false;
    const received = headers.get("x-mock-signature");
    if (!received) return false;
    const expected = createHmac("sha256", sharedSecret).update(rawBody).digest("hex");
    const a = Buffer.from(received, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  parseWebhookEvent(rawBody: string): WebhookEvent {
    const parsed = JSON.parse(rawBody) as {
      event_id: string;
      shipment_id: string;
      status: string;
      occurred_at: string;
      location?: string;
      description?: string;
    };
    const mapped = STATUS_MAP[parsed.status] ?? ShipmentStatus.pending;
    return {
      external_event_id: parsed.event_id,
      external_shipment_id: parsed.shipment_id,
      status: mapped,
      occurred_at: new Date(parsed.occurred_at),
      location: parsed.location ?? null,
      description: parsed.description ?? null,
      raw: parsed,
    };
  }
}
