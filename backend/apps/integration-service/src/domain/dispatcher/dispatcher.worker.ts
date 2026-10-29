import { config } from "@materialhub/config";
import {
  IntegrationDeliveryStatus,
  IntegrationDirection,
  type IntegrationEventType,
  type VendorIntegration,
  type VendorIntegrationDelivery,
  type VendorIntegrationMapping,
} from "@materialhub/database";
import type { EncryptionService } from "@materialhub/utils";
import { Worker } from "bullmq";
import type { RedisClientType } from "redis";
import type { Repository } from "typeorm";
import { evaluateCircuit } from "./circuit-breaker.ts";
import type { DispatcherService } from "./dispatcher.service.ts";

export interface OutboundJob {
  event_type: IntegrationEventType;
  vendor_id: string;
  payload: Record<string, unknown>;
  source_ref: Record<string, unknown>;
  schema_version: number;
  prebuiltBody?: Record<string, unknown>;
}

export interface DispatcherWorkerDeps {
  integrationRepo: Repository<VendorIntegration>;
  mappingRepo: Repository<VendorIntegrationMapping>;
  deliveryRepo: Repository<VendorIntegrationDelivery>;
  encryption: EncryptionService;
  service: DispatcherService;
  redis: RedisClientType;
}

const FAILURE_KEY = (integrationId: string) => `integration:failures:${integrationId}`;
const WINDOW_MS = 5 * 60_000;
const THRESHOLD = 20;

async function recordFailure(redis: RedisClientType, integrationId: string): Promise<void> {
  const now = Date.now();
  await redis.zAdd(FAILURE_KEY(integrationId), {
    score: now,
    value: `${now}-${crypto.randomUUID()}`,
  });
  await redis.zRemRangeByScore(FAILURE_KEY(integrationId), 0, now - WINDOW_MS);
}

async function getRecentFailures(redis: RedisClientType, integrationId: string): Promise<number[]> {
  const raw = await redis.zRange(FAILURE_KEY(integrationId), 0, -1);
  return raw
    .map((entry) => Number.parseInt(entry.split("-")[0] ?? "", 10))
    .filter((n) => Number.isFinite(n));
}

async function clearFailures(redis: RedisClientType, integrationId: string): Promise<void> {
  await redis.del(FAILURE_KEY(integrationId));
}

async function handleDispatchResult(
  result: Awaited<ReturnType<DispatcherService["dispatchOutbound"]>>,
  deps: DispatcherWorkerDeps,
  integration: VendorIntegration,
  data: OutboundJob,
  job: { attemptsMade: number; opts: { attempts?: number } },
): Promise<void> {
  await deps.deliveryRepo.save({
    integration_id: integration.id,
    event_type: data.event_type,
    direction: IntegrationDirection.outbound,
    source_ref: data.source_ref,
    idempotency_key: result.idempotencyKey,
    request_body: result.requestBody,
    response_status: result.responseStatus,
    response_body: result.responseBody,
    latency_ms: result.latencyMs,
    attempt: job.attemptsMade + 1,
    status:
      result.status === "delivered"
        ? IntegrationDeliveryStatus.delivered
        : job.attemptsMade + 1 >= (job.opts.attempts ?? 5)
          ? IntegrationDeliveryStatus.dlq
          : IntegrationDeliveryStatus.failed,
    error_message: result.errorMessage,
  } as any);

  if (result.status === "delivered") {
    await clearFailures(deps.redis, integration.id);
    await deps.integrationRepo.update(integration.id, {
      last_outbound_success_at: new Date(),
      degraded_until: null,
    } as any);
  } else {
    await recordFailure(deps.redis, integration.id);
    const failures = await getRecentFailures(deps.redis, integration.id);
    const r = evaluateCircuit({
      failures,
      now: Date.now(),
      windowMs: WINDOW_MS,
      threshold: THRESHOLD,
    });
    if (r.tripped && r.degradedUntil) {
      console.error("[circuit-breaker] tripped", {
        integration_id: integration.id,
        vendor_id: integration.vendor_id,
        failure_count: r.count,
        degraded_until: new Date(r.degradedUntil).toISOString(),
      });
      await deps.integrationRepo.update(integration.id, {
        degraded_until: new Date(r.degradedUntil),
      } as any);
    }
    if (deps.service.isRetryable(result.responseStatus)) {
      throw new Error(result.errorMessage ?? "retryable failure");
    }
  }
}

export function createDispatcherWorker(deps: DispatcherWorkerDeps): Worker {
  return new Worker(
    "integration-events",
    async (job) => {
      const data = job.data as OutboundJob;
      const integration = await deps.integrationRepo.findOne({
        where: { vendor_id: data.vendor_id, is_active: true } as any,
      });
      if (!integration || !integration.outbound_url || !integration.outbound_secret_encrypted) {
        await deps.deliveryRepo.save({
          integration_id: integration?.id ?? "00000000-0000-0000-0000-000000000000",
          event_type: data.event_type,
          direction: IntegrationDirection.outbound,
          source_ref: data.source_ref,
          status: IntegrationDeliveryStatus.skipped,
          error_message: "no integration or outbound disabled",
          attempt: job.attemptsMade + 1,
        } as any);
        return;
      }

      if (integration.degraded_until && new Date(integration.degraded_until) > new Date()) {
        await deps.deliveryRepo.save({
          integration_id: integration.id,
          event_type: data.event_type,
          direction: IntegrationDirection.outbound,
          source_ref: data.source_ref,
          status: IntegrationDeliveryStatus.failed,
          error_message: "circuit breaker open",
          attempt: job.attemptsMade + 1,
        } as any);
        return;
      }

      const outbound_secret = deps.encryption.decrypt(integration.outbound_secret_encrypted);

      if (data.prebuiltBody) {
        // Replay path — skip mapping lookup, pass body verbatim.
        const result = await deps.service.dispatchOutbound({
          integration: {
            id: integration.id,
            vendor_id: integration.vendor_id,
            outbound_url: integration.outbound_url,
            outbound_secret,
          },
          mapping: { spec: {} },
          eventType: data.event_type,
          sourceContext: data.payload,
          sourceRef: data.source_ref,
          prebuiltBody: data.prebuiltBody,
        });
        await handleDispatchResult(result, deps, integration, data, job);
        return;
      }

      const mapping = await deps.mappingRepo.findOne({
        where: {
          integration_id: integration.id,
          event_type: data.event_type,
          direction: IntegrationDirection.outbound,
          is_enabled: true,
        } as any,
      });
      if (!mapping) {
        await deps.deliveryRepo.save({
          integration_id: integration.id,
          event_type: data.event_type,
          direction: IntegrationDirection.outbound,
          source_ref: data.source_ref,
          status: IntegrationDeliveryStatus.skipped,
          error_message: "no mapping configured",
          attempt: job.attemptsMade + 1,
        } as any);
        return;
      }

      const result = await deps.service.dispatchOutbound({
        integration: {
          id: integration.id,
          vendor_id: integration.vendor_id,
          outbound_url: integration.outbound_url,
          outbound_secret,
        },
        mapping: { spec: mapping.spec },
        eventType: data.event_type,
        sourceContext: data.payload,
        sourceRef: data.source_ref,
      });

      await handleDispatchResult(result, deps, integration, data, job);
    },
    { connection: { url: config.bullmq.redisUrl }, concurrency: 4 },
  );
}
