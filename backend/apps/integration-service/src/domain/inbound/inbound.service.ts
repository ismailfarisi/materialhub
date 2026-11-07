import {
  IntegrationDeliveryStatus,
  IntegrationDirection,
  type IntegrationEventType,
  type VendorIntegration,
  type VendorIntegrationDelivery,
  type VendorIntegrationMapping,
} from "@materialhub/database";
import { transform, validateSpec } from "@materialhub/integration-mapper";
import type { EncryptionService } from "@materialhub/utils";
import type { Repository } from "typeorm";
import { verify } from "../dispatcher/signer.ts";
import { isUuid } from "../ids.ts";
import type { PendingWritesService } from "../pending-writes/pending-writes.service.ts";
import { decideAuthority } from "./authority-gate.ts";
import type { DomainDispatch } from "./domain-dispatch.ts";
import { computeIdempotencyKey } from "./idempotency.ts";

export interface InboundDeps {
  integrationRepo: Repository<VendorIntegration>;
  mappingRepo: Repository<VendorIntegrationMapping>;
  deliveryRepo: Repository<VendorIntegrationDelivery>;
  pendingWrites: PendingWritesService;
  domainDispatch: DomainDispatch;
  encryption: EncryptionService;
}

export interface InboundInput {
  integrationId: string;
  eventType: IntegrationEventType;
  sourceIp: string;
  headers: Record<string, string>;
  rawBody: string;
}

export interface InboundResult {
  status: number;
  body: Record<string, unknown>;
}

const TIMESTAMP_SKEW_SECONDS = 5 * 60;

export class InboundService {
  constructor(private deps: InboundDeps) {}

  async handle(input: InboundInput): Promise<InboundResult> {
    // A malformed id would make Postgres raise 22P02 on the uuid column (a 500).
    const integration = isUuid(input.integrationId)
      ? await this.deps.integrationRepo.findOne({
          where: { id: input.integrationId, is_active: true } as any,
        })
      : null;
    if (!integration || integration.deleted_at) {
      return { status: 404, body: { error: "not_found" } };
    }

    if (
      integration.inbound_ip_allowlist.length > 0 &&
      !integration.inbound_ip_allowlist.includes(input.sourceIp)
    ) {
      return { status: 403, body: { error: "ip_not_allowed" } };
    }

    const sigHeader = input.headers["x-signature"] ?? input.headers["X-Signature"] ?? "";
    const tsHeader = input.headers["x-timestamp"] ?? input.headers["X-Timestamp"] ?? "";
    if (!sigHeader.startsWith("sha256=") || !tsHeader) {
      return { status: 401, body: { error: "missing_signature" } };
    }
    const ts = Number.parseInt(tsHeader, 10);
    if (Number.isNaN(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > TIMESTAMP_SKEW_SECONDS) {
      return { status: 401, body: { error: "stale_timestamp" } };
    }
    if (!integration.inbound_secret_encrypted) {
      return { status: 401, body: { error: "no_inbound_secret" } };
    }
    const secret = this.deps.encryption.decrypt(integration.inbound_secret_encrypted);
    const sigHex = sigHeader.slice("sha256=".length);
    if (!verify(secret, tsHeader, input.rawBody, sigHex)) {
      return { status: 401, body: { error: "invalid_signature" } };
    }

    const idempotencyKey = computeIdempotencyKey(
      input.headers["x-idempotency-key"] ?? input.headers["X-Idempotency-Key"] ?? null,
      input.rawBody,
    );
    const existingDelivery = await this.deps.deliveryRepo.findOne({
      where: { integration_id: integration.id, idempotency_key: idempotencyKey } as any,
    });
    if (existingDelivery && existingDelivery.status === IntegrationDeliveryStatus.delivered) {
      return {
        status: 200,
        body: { idempotent_replay: true, response_status: existingDelivery.response_status },
      };
    }

    const mapping = await this.deps.mappingRepo.findOne({
      where: {
        integration_id: integration.id,
        event_type: input.eventType,
        direction: IntegrationDirection.inbound,
        is_enabled: true,
      } as any,
    });
    if (!mapping) {
      return { status: 422, body: { error: "no_mapping" } };
    }

    const validation = validateSpec(mapping.spec);
    if (!validation.ok) {
      return { status: 422, body: { error: "invalid_spec", details: validation.errors } };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(input.rawBody);
    } catch {
      return { status: 400, body: { error: "invalid_json" } };
    }

    let mapped: Record<string, unknown>;
    try {
      mapped = transform(mapping.spec as any, parsed);
    } catch (e) {
      return { status: 422, body: { error: "mapping_failed", message: (e as Error).message } };
    }

    const decision = decideAuthority(input.eventType, integration, mapped);

    const delivery = (await this.deps.deliveryRepo.save({
      integration_id: integration.id,
      event_type: input.eventType,
      direction: IntegrationDirection.inbound,
      idempotency_key: idempotencyKey,
      request_body: parsed as any,
      request_headers: redactHeaders(input.headers),
      status: IntegrationDeliveryStatus.pending,
    } as any)) as VendorIntegrationDelivery;

    if (decision.action === "stage") {
      await this.deps.pendingWrites.stage({
        integration_id: integration.id,
        delivery_id: (delivery as any).id,
        kind: input.eventType,
        payload: mapped,
        thresholdBreached: decision.thresholdBreached,
      });
      await this.deps.deliveryRepo.update((delivery as any).id, {
        status: IntegrationDeliveryStatus.delivered,
        response_status: 202,
      } as any);
      return { status: 202, body: { staged: true } };
    }

    const dispatch = await this.deps.domainDispatch.call({
      eventType: input.eventType,
      vendorId: integration.vendor_id,
      payload: mapped,
    });

    await this.deps.deliveryRepo.update((delivery as any).id, {
      status:
        dispatch.status >= 200 && dispatch.status < 300
          ? IntegrationDeliveryStatus.delivered
          : IntegrationDeliveryStatus.failed,
      response_status: dispatch.status,
      response_body: dispatch.body.slice(0, 8192),
    } as any);

    if (dispatch.status >= 200 && dispatch.status < 300) {
      await this.deps.integrationRepo.update(integration.id, {
        last_inbound_success_at: new Date(),
      } as any);
    }

    if (dispatch.status >= 500) {
      return { status: 502, body: { error: "domain_error", message: dispatch.body } };
    }
    return { status: dispatch.status, body: { dispatched: dispatch.status } };
  }
}

function redactHeaders(h: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) {
    if (k.toLowerCase() === "authorization" || k.toLowerCase() === "x-signature") {
      out[k] = "[redacted]";
    } else {
      out[k] = v;
    }
  }
  return out;
}
