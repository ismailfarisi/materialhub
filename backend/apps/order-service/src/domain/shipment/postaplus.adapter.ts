import { createHmac, timingSafeEqual } from "node:crypto";
import { ShipmentStatus } from "@materialhub/database/src/enums/order.enums.ts";
import { type FetchRetryOptions, fetchWithRetry } from "./retry.ts";
import type {
  AmendCodParams,
  BookShipmentParams,
  BookShipmentResult,
  CredentialSchema,
  ShippingProviderAdapter,
  VerifyResult,
  WebhookEvent,
} from "./shipping-provider-adapter.ts";

const DEFAULT_BASE_URL = "https://devinfolink.postaplus.net/api";
const CREATE_SHIPMENT_WITH_PICKUP_PATH = "/Xchanges/CreateShipmentWithPickup";
const CANCEL_SHIPMENT_PATH = "/Xchanges/CancelShipment";
const CANCEL_PICKUP_PATH = "/Xchanges/CancelPickup";
const GET_SHIPMENT_TRACKING_PATH = "/Xchanges/GetShipmentTracking";
const UPDATE_SHIPMENT_PATH = "/Xchanges/UpdateShipment";

type JsonRecord = Record<string, unknown>;

export interface PostaPlusAdapterOptions {
  retry?: FetchRetryOptions;
}

export class PostaPlusAdapter implements ShippingProviderAdapter {
  constructor(private readonly options: PostaPlusAdapterOptions = {}) {}

  readonly code = "postaplus";
  readonly displayName = "PostaPlus";
  readonly credentialSchema: CredentialSchema = {
    type: "object",
    required: ["partner_key", "tenant", "customer", "created_by"],
    properties: {
      partner_key: {
        type: "string",
        title: "Partner Key",
        description: "PostaPlus partner key for API access.",
        format: "password",
      },
      tenant: {
        type: "string",
        title: "Tenant",
        description: "PostaPlus tenant code, for example DXB.",
      },
      customer: {
        type: "string",
        title: "Customer Account Code",
        description: "PostaPlus corporate customer account code, for example CR26006559.",
      },
      created_by: {
        type: "string",
        title: "Created By",
        description: "PostaPlus username used in shipment and pickup commands.",
      },
      shipment_type: {
        type: "string",
        title: "Shipment Type",
        description: "PostaPlus shipment type code. Defaults to SHPT2.",
      },
      package_type: {
        type: "string",
        title: "Package Type",
        description: "PostaPlus package type code. Defaults to NA.",
      },
      service: {
        type: "string",
        title: "Service",
        description: "PostaPlus service code. Defaults to SRV1.",
      },
      vehicle: {
        type: "string",
        title: "Pickup Vehicle",
        description: "PostaPlus vehicle code. Defaults to VHTY1.",
      },
      pickup_type: {
        type: "string",
        title: "Pickup Type",
        description: "PostaPlus pickup type code. Defaults to NM.",
      },
      base_url: {
        type: "string",
        title: "Base URL",
        description: "Override the PostaPlus API base URL for sandbox or production.",
        format: "url",
      },
    },
  };

  private baseUrl(creds: Record<string, string>): string {
    return (creds.base_url || DEFAULT_BASE_URL).replace(/\/+$/, "");
  }

  async verifyCredentials(creds: Record<string, string>): Promise<VerifyResult> {
    for (const key of this.credentialSchema.required) {
      if (!String(creds[key] ?? "").trim()) {
        return { ok: false, message: `${key} is required` };
      }
    }
    if (creds.base_url) {
      try {
        new URL(creds.base_url);
      } catch {
        return { ok: false, message: "base_url must be a valid URL" };
      }
    }
    return { ok: true };
  }

  async bookShipment(
    params: BookShipmentParams,
    creds: Record<string, string>,
  ): Promise<BookShipmentResult> {
    const validation = await this.verifyCredentials(creds);
    if (!validation.ok) {
      throw new Error(`PostaPlus credentials invalid: ${validation.message}`);
    }

    const body = this.buildShipmentWithPickupBody(params, creds);
    // The PostaPlus dev/prod gateways intermittently 504 under load; transient
    // statuses are retried here. A 504 can mean the shipment WAS created and
    // the response was lost, so a retry may produce an orphan AWB on the
    // carrier side — acceptable, since only the AWB we record is ever used.
    const res = await fetchWithRetry(
      `${this.baseUrl(creds)}${CREATE_SHIPMENT_WITH_PICKUP_PATH}`,
      {
        method: "POST",
        headers: this.headers(creds),
        body: JSON.stringify(body),
      },
      this.options.retry,
    );

    if (!res.ok) {
      throw new Error(`PostaPlus API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as JsonRecord;
    const success = findBoolean(data, ["isSuccessful", "IsSuccessful", "success", "Success"]);
    if (success === false) {
      const message =
        findString(data, ["message", "Message", "errorMessage", "ErrorMessage"]) ?? "unknown";
      throw new Error(`PostaPlus booking failed: ${message}`);
    }

    const awb = findString(data, ["airWaybill", "AirWaybill", "awb", "AWB", "shipmentCode"]);
    if (!awb) {
      throw new Error("PostaPlus booking failed: missing airWaybill");
    }

    const labelUrl = findString(data, ["labelPrintDownloadUrl", "LabelPrintDownloadUrl"]);
    const pickupCode = findString(data, ["pickupCode", "PickupCode"]);
    const eta = parsePostaDate(
      findString(data, ["estimatedTimeOfArrival", "EstimatedTimeOfArrival"]),
    );

    return {
      tracking_number: awb,
      tracking_url: labelUrl ?? `https://www.postaplus.com/track/${awb}`,
      carrier_cost_fils: 0,
      external_shipment_id: awb,
      label_url: labelUrl,
      pickup_code: pickupCode,
      estimated_delivery_at: eta,
      raw: data,
    };
  }

  async cancelShipment(
    params: { trackingNumber: string; reason?: string },
    creds: Record<string, string>,
  ): Promise<{ ok: boolean; raw?: unknown }> {
    const validation = await this.verifyCredentials(creds);
    if (!validation.ok) {
      throw new Error(`PostaPlus credentials invalid: ${validation.message}`);
    }

    const res = await fetchWithRetry(
      `${this.baseUrl(creds)}${CANCEL_SHIPMENT_PATH}`,
      {
        method: "POST",
        headers: this.headers(creds),
        body: JSON.stringify({
          shipmentCodes: [params.trackingNumber],
          actioncode: "cancel",
          notes: params.reason ?? "",
        }),
      },
      this.options.retry,
    );

    if (!res.ok) {
      throw new Error(`PostaPlus cancel shipment API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as unknown;
    assertPostaPlusSuccess(data, "cancel shipment");
    return { ok: true, raw: data };
  }

  async cancelPickup(
    params: { pickupCode: string; reason?: string },
    creds: Record<string, string>,
  ): Promise<{ ok: boolean; raw?: unknown }> {
    const validation = await this.verifyCredentials(creds);
    if (!validation.ok) {
      throw new Error(`PostaPlus credentials invalid: ${validation.message}`);
    }

    const res = await fetchWithRetry(
      `${this.baseUrl(creds)}${CANCEL_PICKUP_PATH}`,
      {
        method: "POST",
        headers: this.headers(creds),
        body: JSON.stringify({
          code: params.pickupCode,
          tenant: creds.tenant,
        }),
      },
      this.options.retry,
    );

    if (!res.ok) {
      throw new Error(`PostaPlus cancel pickup API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as unknown;
    assertPostaPlusSuccess(data, "cancel pickup");
    return { ok: true, raw: data };
  }

  async amendCodAmount(params: AmendCodParams, creds: Record<string, string>): Promise<void> {
    const validation = await this.verifyCredentials(creds);
    if (!validation.ok) {
      throw new Error(`PostaPlus credentials invalid: ${validation.message}`);
    }

    const body = this.buildUpdateShipmentBody(params, creds);
    const res = await fetchWithRetry(
      `${this.baseUrl(creds)}${UPDATE_SHIPMENT_PATH}`,
      {
        method: "POST",
        headers: this.headers(creds),
        body: JSON.stringify(body),
      },
      this.options.retry,
    );

    if (!res.ok) {
      throw new Error(`PostaPlus API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as JsonRecord;
    const success = findBoolean(data, ["isSuccessful", "IsSuccessful", "success", "Success"]);
    if (success === false) {
      const message =
        findString(data, ["message", "Message", "errorMessage", "ErrorMessage"]) ?? "unknown";
      throw new Error(`PostaPlus amend COD failed: ${message}`);
    }
  }

  verifyWebhook(headers: Headers, rawBody: string, sharedSecret: string | null): boolean {
    if (!sharedSecret) return true;
    const received = headers.get("x-postaplus-signature");
    if (!received) return false;
    const expected = createHmac("sha256", sharedSecret).update(rawBody).digest("hex");
    const a = Buffer.from(received, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  parseWebhookEvent(rawBody: string): WebhookEvent {
    const parsed = JSON.parse(rawBody) as JsonRecord;
    const shipmentCode = stringValue(parsed.ShipmentCode ?? parsed.shipmentCode);
    const actionCode = stringValue(parsed.ActionCode ?? parsed.actionCode);
    const actionName = stringValue(parsed.ActionName ?? parsed.actionName);
    const actionDate = stringValue(parsed.ActionDate ?? parsed.actionDate);

    if (!shipmentCode || !actionCode || !actionDate) {
      throw new Error("PostaPlus webhook missing ShipmentCode, ActionCode, or ActionDate");
    }

    return {
      external_event_id: `${shipmentCode}:${actionCode}:${actionDate}`,
      external_shipment_id: shipmentCode,
      status: mapStatus(actionCode, actionName),
      occurred_at: parsePostaDate(actionDate) ?? new Date(),
      location: null,
      description: actionName || actionCode,
      raw: parsed,
    };
  }

  async pollTracking(
    trackingNumber: string,
    creds: Record<string, string>,
  ): Promise<WebhookEvent | null> {
    const validation = await this.verifyCredentials(creds);
    if (!validation.ok) {
      throw new Error(`PostaPlus credentials invalid: ${validation.message}`);
    }

    const res = await fetchWithRetry(
      `${this.baseUrl(creds)}${GET_SHIPMENT_TRACKING_PATH}`,
      {
        method: "POST",
        headers: this.headers(creds),
        body: JSON.stringify({ Code: trackingNumber }),
      },
      this.options.retry,
    );

    if (!res.ok) {
      throw new Error(`PostaPlus tracking API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as unknown;
    return this.trackingResponseToEvent(trackingNumber, data);
  }

  private trackingResponseToEvent(trackingNumber: string, data: unknown): WebhookEvent | null {
    const latest = latestTrackingRecord(data);
    if (!latest) return null;

    const actionCode = stringField(
      latest,
      ["workflowActionCode", "WorkflowActionCode", "ActionCode", "actionCode"],
      "",
    );
    const actionName = stringField(
      latest,
      ["workflowActionName", "WorkflowActionName", "ActionName", "actionName"],
      "",
    );
    const actionDate = stringField(latest, ["actionDate", "ActionDate"], "");
    if (!actionCode || !actionDate) return null;

    return {
      external_event_id: `${trackingNumber}:${actionCode}:${actionDate}`,
      external_shipment_id: trackingNumber,
      status: mapStatus(actionCode, actionName),
      occurred_at: parsePostaDate(actionDate) ?? new Date(),
      location: stringField(
        latest,
        ["currentActionTenantName", "CurrentActionTenantName", "source", "Source"],
        "",
      ),
      description: actionName || actionCode,
      raw: latest,
    };
  }

  private headers(creds: Record<string, string>): Record<string, string> {
    return {
      "Content-Type": "application/json",
      PartnerKey: String(creds.partner_key),
      WaitResponse: "0",
    };
  }

  private buildShipmentWithPickupBody(
    params: BookShipmentParams,
    creds: Record<string, string>,
  ): JsonRecord {
    // PostaPlus rejects shipments lighter than 1 kg (docs: "Actual Weight must be greater than 1").
    const totalWeightKg = Math.max(
      1,
      round2(params.items.reduce((sum, item) => sum + item.weightGrams * item.quantity, 0) / 1000),
    );
    const description = params.items
      .map((item) =>
        item.externalId ? `${item.productName} (${item.externalId})` : item.productName,
      )
      .filter(Boolean)
      .join(", ");
    const pickupAddress = params.pickupAddress ?? params.shipperAddress;
    if (!params.shipperAddress) {
      throw new Error("PostaPlus shipment requires a shipperAddress with PostaPlus location codes");
    }
    if (!pickupAddress) {
      throw new Error("PostaPlus shipment requires a pickupAddress with PostaPlus location codes");
    }

    return {
      shipmentCommand: {
        language: "EN",
        labelFormat: "LabelSize4X6",
        isPdfLabelFormat: true,
        tenant: creds.tenant,
        createdBy: creds.created_by,
        customer: creds.customer,
        retailCustomerId: 0,
        shipmentType: creds.shipment_type || "SHPT2",
        packageType: creds.package_type || "NA",
        service: creds.service || "SRV1",
        width: numberCred(creds.width, 55),
        height: numberCred(creds.height, 1),
        depth: numberCred(creds.depth, 60),
        actualWeight: totalWeightKg,
        weightUnit: "KG",
        lengthUnit: "CM",
        codAmount: params.codAmountFils ? round2(params.codAmountFils / 100) : 0,
        isCod: Boolean(params.codAmountFils && params.codAmountFils > 0),
        specialHandling: false,
        temperatureControl: false,
        highLoadQuantity: false,
        heavyInWeight: false,
        isInsured: true,
        isDDU: true,
        isDg: false,
        description: description || "Shipment",
        reference1: params.vendorOrderId,
        shipper: mapShipperAddress(params.shipperAddress),
        consignee: mapConsigneeAddress(params.shippingAddress),
        performaInvoices: [],
        pieces: [],
      },
      pickupCommand: {
        language: "EN",
        Contact: stringField(pickupAddress, ["contact", "name"], "Pickup Contact"),
        description: "Pickup",
        PickupDate: params.pickupDate ?? nextPickupDate(),
        start: params.pickupStart ?? "18:00:00.0000000",
        end: params.pickupEnd ?? "22:00:00.0000000",
        createdBy: creds.created_by,
        vehicle: creds.vehicle || "VHTY1",
        pickupType: creds.pickup_type || "NM",
        tenant: creds.tenant,
        customer: creds.customer,
        typeOfGoods: "Parcel",
        consignee: mapPickupAddress(pickupAddress),
      },
    };
  }

  private buildUpdateShipmentBody(
    params: AmendCodParams,
    creds: Record<string, string>,
  ): JsonRecord {
    // Same 1 kg PostaPlus minimum as buildShipmentWithPickupBody.
    const totalWeightKg = Math.max(
      1,
      round2(params.items.reduce((sum, item) => sum + item.weightGrams * item.quantity, 0) / 1000),
    );
    const description = params.items
      .map((item) => item.productName)
      .filter(Boolean)
      .join(", ");

    return {
      airWaybill: params.airWaybill,
      width: numberCred(creds.width, 55),
      height: numberCred(creds.height, 1),
      depth: numberCred(creds.depth, 60),
      actualWeight: totalWeightKg,
      weightUnit: "KG",
      lengthUnit: "CM",
      codAmount: params.codAmountFils ? round2(params.codAmountFils / 100) : 0,
      isCod: Boolean(params.codAmountFils && params.codAmountFils > 0),
      description: description || "Shipment",
      reference1: params.airWaybill,
      shipper: mapShipperAddress(params.shipperAddress),
      consignee: mapConsigneeAddress(params.shippingAddress),
      performaInvoices: [],
    };
  }
}

// PostaPlus accepts either a lookup code or a free-text description per location
// field ("either fill city code, or city name in cityDescription"). Customer
// addresses carry names, not codes, so anything that doesn't look like a code
// goes in the description field.
const PROVINCE_CODE_RE = /^[A-Z]{2,3}$/;
const CITY_CODE_RE = /^CITY\d+$/i;

function splitLocation(
  address: JsonRecord,
  codeKeys: string[],
  nameKeys: string[],
  codePattern: RegExp,
): { code: string; description: string } {
  const code = stringField(address, codeKeys, "");
  if (code) return { code, description: "" };
  const candidate = stringField(address, nameKeys, "");
  if (!candidate) return { code: "", description: "" };
  if (codePattern.test(candidate)) return { code: candidate, description: "" };
  return { code: "", description: candidate };
}

function locationFields(address: JsonRecord): JsonRecord {
  const province = splitLocation(
    address,
    ["posta_province_code", "province_code"],
    ["state", "emirate"],
    PROVINCE_CODE_RE,
  );
  const city = splitLocation(address, ["posta_city_code", "city_code"], ["city"], CITY_CODE_RE);
  return {
    countryCode: stringField(address, ["posta_country_code", "country_code"], "AE"),
    provinceCode: province.code,
    provinceDescription: province.description,
    cityCode: city.code,
    cityDescription: city.description,
    areaCode: stringField(address, ["posta_area_code", "area_code"], "NA"),
  };
}

function consigneeName(address: JsonRecord): string {
  const direct = stringField(address, ["name", "full_name"], "");
  if (direct) return direct;
  const composed = [stringValue(address.first_name), stringValue(address.last_name)]
    .filter(Boolean)
    .join(" ");
  return composed || "Consignee";
}

function mapShipperAddress(address: JsonRecord): JsonRecord {
  return {
    shipperName: stringField(address, ["shipper_name", "name"], "Shipper"),
    contactNumber: stringField(address, ["contact_number", "phone", "contact_phone"], ""),
    ...locationFields(address),
    addressLine: stringField(address, ["address_line", "address_line_1", "line1"], ""),
    BuildingNameOrNumber: stringField(address, ["building_name_or_number"], ""),
    StreetNameOrNumber: stringField(address, ["street_name_or_number"], ""),
    BlockOrDistrict: stringField(address, ["block_or_district"], ""),
    zipCode: stringField(address, ["postal_code", "zipCode", "zip_code"], ""),
  };
}

// PostaPlus has no dedicated consignee slot for apartment/floor, so fold them
// into the free-text address line — the building goes to BuildingNameOrNumber.
function consigneeAddressLine(address: JsonRecord): string {
  const base = stringField(address, ["address_line", "address_line_1", "line1"], "");
  const apartment = stringField(address, ["apartment"], "");
  const floor = stringField(address, ["floor"], "");
  return [base, apartment && `Apt ${apartment}`, floor && `Floor ${floor}`]
    .filter(Boolean)
    .join(", ");
}

function mapConsigneeAddress(address: JsonRecord): JsonRecord {
  return {
    name: consigneeName(address),
    CompanyName: stringField(address, ["company_name", "companyName"], ""),
    ...locationFields(address),
    addressLine: consigneeAddressLine(address),
    BuildingNameOrNumber: stringField(address, ["building_name_or_number", "building_name"], ""),
    StreetNameOrNumber: stringField(address, ["street_name_or_number"], ""),
    BlockOrDistrict: stringField(address, ["block_or_district"], ""),
    zipCode: stringField(address, ["postal_code", "zipCode", "zip_code"], ""),
    mobile: stringField(address, ["mobile", "phone"], ""),
    additionalNumber: stringField(address, ["additional_number", "additionalNumber"], ""),
    civilId: stringField(address, ["civil_id", "civilId"], ""),
    email: stringField(address, ["email"], ""),
  };
}

function mapPickupAddress(address: JsonRecord): JsonRecord {
  const mapped = mapConsigneeAddress(address);
  return {
    ...mapped,
    name: stringField(address, ["contact", "name"], "Pickup Contact"),
  };
}

function stringField(address: JsonRecord, keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = stringValue(address[key]);
    if (value) return value;
  }
  return fallback;
}

function stringValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function numberCred(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function nextPickupDate(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 19);
}

function parsePostaDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const normalized = value.replace(/\s+-\s+/, "T");
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function findString(obj: unknown, keys: string[]): string | null {
  if (!obj || typeof obj !== "object") return null;
  for (const [key, value] of Object.entries(obj as JsonRecord)) {
    if (keys.includes(key)) {
      const str = stringValue(value);
      if (str) return str;
    }
    const nested = findString(value, keys);
    if (nested) return nested;
  }
  return null;
}

function findBoolean(obj: unknown, keys: string[]): boolean | null {
  if (!obj || typeof obj !== "object") return null;
  for (const [key, value] of Object.entries(obj as JsonRecord)) {
    if (keys.includes(key) && typeof value === "boolean") return value;
    const nested = findBoolean(value, keys);
    if (nested !== null) return nested;
  }
  return null;
}

function latestTrackingRecord(data: unknown): JsonRecord | null {
  const records = Array.isArray(data)
    ? data.filter((item): item is JsonRecord => Boolean(item && typeof item === "object"))
    : data && typeof data === "object"
      ? [data as JsonRecord]
      : [];
  if (!records.length) return null;
  return records.reduce((latest, current) => {
    const currentTime = parsePostaDate(stringField(current, ["actionDate", "ActionDate"], ""));
    const latestTime = parsePostaDate(stringField(latest, ["actionDate", "ActionDate"], ""));
    if (!latestTime) return current;
    if (!currentTime) return latest;
    return currentTime.getTime() > latestTime.getTime() ? current : latest;
  });
}

function assertPostaPlusSuccess(data: unknown, action: string): void {
  if (data === 1 || data === true) return;
  const success = findBoolean(data, ["isSuccessful", "IsSuccessful", "success", "Success"]);
  if (success === false) {
    const message =
      findString(data, ["message", "Message", "errorMessage", "ErrorMessage"]) ?? "unknown";
    throw new Error(`PostaPlus ${action} failed: ${message}`);
  }
}

const PENDING_EVENT_CODES = new Set([
  "PICKUP ALERT CREATED",
  "ACT-ASNNGC",
  "ACT-GCACP",
  "ACT-PKPRESC",
  "PICK_RESCHEDULE",
  // A single pickup attempt failure is retriable: PostaPlus reschedules and
  // re-dispatches the courier (up to 3 attempts) before permanently failing
  // the pickup via a terminal code (ACT-PKPCLS "pickup closed"). Keep it
  // non-terminal so the parcel stays awaiting re-pickup rather than surfacing
  // a customer-visible failed_delivery on the first miss. Distinct from the
  // terminal "PICK UP FAILED" / ACT-PKPCLS codes in FAILED_DELIVERY_EVENT_CODES.
  "PICKFALID",
]);

const IN_TRANSIT_EVENT_CODES = new Set([
  "PICKDIS",
  "PU",
  "ACT-GCFAL",
  "SOR",
  "FMA002",
  "SHP-RWTUP",
  "REWEIGHT",
  "WC",
  "STSPI",
  "INTL-SHPT-CLR",
  "INTL-SHPT-AHF",
  "INTL-SHPT-SIB",
  "INTL-SHPT-LR",
  "INTL-SHPT-FA",
  "LM-0025",
  "ACKSHT",
  "LMW-00DR",
  "LMA-00SIB",
  "INT-MNFST",
  "INT-SOB",
  "INTL-SHPT-SL",
  "INTL-SHPT-HAC",
  "HD@TRN",
  "OH@ODA",
  "INTL-SHPT-OFT",
  "LMA-0032I",
]);

const FAILED_DELIVERY_EVENT_CODES = new Set([
  "ACT-PKPCLS",
  "PICK UP FAILED",
  "INTL-SHPT-DIS",
  "LST-INV",
  "DMGD",
  "DISPOSED",
  "PROH",
  "INTL-SHPT-CONF",
  "INTL-SHPT-DMG",
  "DEX",
  "DEX-1",
]);

const DELIVERED_EVENT_CODES = new Set(["DELIVERED", "LMA012-1", "LMA012"]);

const RETURNED_EVENT_CODES = new Set(["RTN", "RT", "ARTN", "RTA005", "RT-STKOUT", "RTA-RTC"]);

const CANCELLED_EVENT_CODES = new Set(["CANCEL"]);

function mapStatus(actionCode: string, actionName: string): ShipmentStatus {
  const code = actionCode.trim().toUpperCase();
  if (DELIVERED_EVENT_CODES.has(code)) return ShipmentStatus.delivered;
  if (RETURNED_EVENT_CODES.has(code)) return ShipmentStatus.returned;
  if (CANCELLED_EVENT_CODES.has(code)) return ShipmentStatus.cancelled;
  if (FAILED_DELIVERY_EVENT_CODES.has(code)) return ShipmentStatus.failed_delivery;
  if (IN_TRANSIT_EVENT_CODES.has(code)) return ShipmentStatus.in_transit;
  if (PENDING_EVENT_CODES.has(code)) return ShipmentStatus.pending;

  const text = `${actionCode} ${actionName}`.toLowerCase();
  if (/\b(delivered|pod|dlv)\b/.test(text)) return ShipmentStatus.delivered;
  if (/\b(ofd|out for delivery)\b/.test(text)) return ShipmentStatus.out_for_delivery;
  if (/\b(return|rto|returned)\b/.test(text)) return ShipmentStatus.returned;
  if (/\b(cancel|cancelled|canceled)\b/.test(text)) return ShipmentStatus.cancelled;
  if (/\b(fail|failed|exception|undelivered)\b/.test(text)) return ShipmentStatus.failed_delivery;
  if (/\b(pu|pick|picked|collected|sib|received|dispatch|transit|manifest)\b/.test(text)) {
    return ShipmentStatus.in_transit;
  }
  return ShipmentStatus.pending;
}
