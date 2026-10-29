import type { ShipmentStatus } from "@materialhub/database";

export interface CredentialSchemaField {
  type: "string" | "number";
  title: string;
  description?: string;
  format?: "password" | "url";
  pattern?: string;
}

export interface CredentialSchema {
  type: "object";
  required: string[];
  properties: Record<string, CredentialSchemaField>;
}

export interface VerifyResult {
  ok: boolean;
  message?: string;
}

export interface BookShipmentParams {
  vendorOrderId: string;
  items: {
    productName: string;
    quantity: number;
    weightGrams: number;
    externalId?: string | null;
  }[];
  shippingAddress: Record<string, unknown>;
  shipperAddress?: Record<string, unknown>;
  pickupAddress?: Record<string, unknown>;
  codAmountFils?: number;
  pickupDate?: string;
  pickupStart?: string;
  pickupEnd?: string;
}

export interface BookShipmentResult {
  tracking_number: string;
  tracking_url: string;
  carrier_cost_fils: number;
  external_shipment_id: string;
  label_url?: string | null;
  pickup_code?: string | null;
  estimated_delivery_at?: Date | null;
  raw?: unknown;
}

export interface CancelShipmentParams {
  trackingNumber: string;
  reason?: string;
}

export interface CancelPickupParams {
  pickupCode: string;
  reason?: string;
}

export interface CarrierCancellationResult {
  ok: boolean;
  raw?: unknown;
}

export interface AmendCodParams {
  airWaybill: string;
  codAmountFils: number;
  shipperAddress: Record<string, unknown>;
  shippingAddress: Record<string, unknown>;
  items: { productName: string; quantity: number; weightGrams: number }[];
}

export interface WebhookEvent {
  external_shipment_id: string;
  external_event_id: string;
  status: ShipmentStatus;
  occurred_at: Date;
  location?: string | null;
  description?: string | null;
  raw: unknown;
}

export interface ShippingProviderAdapter {
  readonly code: string;
  readonly displayName: string;
  readonly credentialSchema: CredentialSchema;

  verifyCredentials(creds: Record<string, string>): Promise<VerifyResult>;
  bookShipment(
    params: BookShipmentParams,
    creds: Record<string, string>,
  ): Promise<BookShipmentResult>;
  cancelShipment?(
    params: CancelShipmentParams,
    creds: Record<string, string>,
  ): Promise<CarrierCancellationResult>;
  cancelPickup?(
    params: CancelPickupParams,
    creds: Record<string, string>,
  ): Promise<CarrierCancellationResult>;
  amendCodAmount?(params: AmendCodParams, creds: Record<string, string>): Promise<void>;
  verifyWebhook(headers: Headers, rawBody: string, sharedSecret: string | null): boolean;
  parseWebhookEvent(rawBody: string): WebhookEvent;
  pollTracking?(
    trackingNumber: string,
    creds: Record<string, string>,
  ): Promise<WebhookEvent | null>;
}

export class ShippingProviderRegistry {
  private adapters = new Map<string, ShippingProviderAdapter>();

  register(adapter: ShippingProviderAdapter): void {
    this.adapters.set(adapter.code, adapter);
  }

  get(code: string): ShippingProviderAdapter | null {
    return this.adapters.get(code) ?? null;
  }

  list(): ShippingProviderAdapter[] {
    return Array.from(this.adapters.values());
  }
}
