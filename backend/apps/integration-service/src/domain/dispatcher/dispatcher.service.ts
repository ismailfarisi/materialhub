import type { IntegrationEventType } from "@materialhub/database";
import { transform } from "@materialhub/integration-mapper";
import { sign } from "./signer.ts";

export interface DispatchInput {
  integration: {
    id: string;
    vendor_id: string;
    outbound_url: string | null;
    outbound_secret: string | null;
  };
  mapping: { spec: Record<string, unknown> };
  eventType: IntegrationEventType;
  sourceContext: Record<string, unknown>;
  sourceRef: Record<string, unknown>;
  prebuiltBody?: Record<string, unknown>;
}

export interface DispatchResult {
  status: "delivered" | "failed" | "skipped";
  responseStatus: number | null;
  responseBody: string | null;
  latencyMs: number;
  idempotencyKey: string;
  requestBody: Record<string, unknown>;
  errorMessage: string | null;
}

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

export class DispatcherService {
  async dispatchOutbound(input: DispatchInput): Promise<DispatchResult> {
    if (!input.integration.outbound_url || !input.integration.outbound_secret) {
      return {
        status: "skipped",
        responseStatus: null,
        responseBody: null,
        latencyMs: 0,
        idempotencyKey: "",
        requestBody: {},
        errorMessage: "no outbound configuration",
      };
    }
    const idempotencyKey = crypto.randomUUID();
    const body = input.prebuiltBody
      ? input.prebuiltBody
      : // biome-ignore lint/suspicious/noExplicitAny: mapping spec is loosely typed at this boundary
        transform(input.mapping.spec as any, input.sourceContext);
    const bodyText = JSON.stringify(body);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = `sha256=${sign(input.integration.outbound_secret, timestamp, bodyText)}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Signature": signature,
      "X-Timestamp": timestamp,
      "X-Idempotency-Key": idempotencyKey,
      "X-Event-Type": input.eventType,
      "X-Integration-Id": input.integration.id,
    };
    const startedAt = Date.now();
    try {
      const res = await fetch(input.integration.outbound_url, {
        method: "POST",
        headers,
        body: bodyText,
        signal: AbortSignal.timeout(20_000),
      });
      const responseBody = await res.text();
      const latencyMs = Date.now() - startedAt;
      const ok = res.ok;
      return {
        status: ok ? "delivered" : "failed",
        responseStatus: res.status,
        responseBody: responseBody.slice(0, 8192),
        latencyMs,
        idempotencyKey,
        requestBody: body,
        errorMessage: ok ? null : `HTTP ${res.status}`,
      };
    } catch (e) {
      return {
        status: "failed",
        responseStatus: null,
        responseBody: null,
        latencyMs: Date.now() - startedAt,
        idempotencyKey,
        requestBody: body,
        errorMessage: (e as Error).message,
      };
    }
  }

  isRetryable(status: number | null): boolean {
    if (status === null) return true;
    return RETRYABLE_STATUSES.has(status);
  }
}
