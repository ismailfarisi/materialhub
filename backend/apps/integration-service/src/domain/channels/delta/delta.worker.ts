import { config } from "@materialhub/config";
import type { ChannelDelivery, ChannelListing, SalesChannel } from "@materialhub/database";
import type { EncryptionService } from "@materialhub/utils";
import { Worker } from "bullmq";
import type { RedisClientType } from "redis";
import type { Repository } from "typeorm";
import { evaluateCircuit } from "../../dispatcher/circuit-breaker.ts";
import type { GoogleAdapter } from "../adapters/google.adapter.ts";
import type { MetaAdapter } from "../adapters/meta.adapter.ts";
import { readGoogleChannelCredentials, readMetaChannelCredentials } from "../credentials.ts";
import { DELTA_PUSH_QUEUE, type DeltaPushJob } from "./delta-scan.cron.ts";

const FAILURE_WINDOW_MS = 10 * 60_000;
const FAILURE_THRESHOLD = 20;

/** Sorted-set key per channel; score = ms-timestamp, value = `${ts}-${uuid}`. */
const FAILURE_KEY = (channelId: string): string => `channels:failures:${channelId}`;

export interface DeltaWorkerDeps {
  salesChannelRepo: Repository<SalesChannel>;
  channelListingRepo: Repository<ChannelListing>;
  channelDeliveryRepo: Repository<ChannelDelivery>;
  encryption: EncryptionService;
  googleAdapter: GoogleAdapter;
  metaAdapter: MetaAdapter;
  redis: RedisClientType;
}

export function createDeltaPushWorker(deps: DeltaWorkerDeps): Worker {
  return new Worker<DeltaPushJob>(
    DELTA_PUSH_QUEUE,
    async (job) => handleDeltaPush(job.data, job.attemptsMade ?? 0, deps),
    { connection: { url: config.bullmq.redisUrl }, concurrency: 4 },
  );
}

/**
 * Push handler — performs one upsert/delete against the channel adapter and
 * records the outcome to `channel_deliveries`. On failure, increments a Redis
 * sorted-set failure counter; if `evaluateCircuit` trips, sets the channel's
 * `degraded_until` to suppress further pushes until cooldown elapses.
 *
 * Always re-throws on failure so BullMQ retries per `attempts` config.
 */
export async function handleDeltaPush(
  job: DeltaPushJob,
  attemptsMade: number,
  deps: DeltaWorkerDeps,
): Promise<{ status: "success" | "failed" }> {
  const channel = await deps.salesChannelRepo.findOneOrFail({
    where: { id: job.channelId } as unknown as Record<string, unknown>,
  });
  if (!channel.is_enabled) {
    // Channel disabled mid-flight (admin toggled off after the scan enqueued
    // this job). Write a `skipped` delivery so the audit trail captures it,
    // mirroring dispatcher.worker.ts. BullMQ then removes the job normally.
    const skipped = deps.channelDeliveryRepo.create({
      channel_id: channel.id,
      kind: "delta" as ChannelDelivery["kind"],
      event_name: job.action === "upsert" ? "product.upsert" : "product.delete",
      payload: { offerId: job.offerId, reason: "channel_disabled" },
      status: "skipped" as ChannelDelivery["status"],
      attempt: attemptsMade + 1,
    } as unknown as ChannelDelivery);
    await deps.channelDeliveryRepo.save(skipped);
    return { status: "failed" };
  }
  if (channel.code === "tiktok") {
    // TikTok is XML-poll-based — feed-build.cron maintains the catalog via the
    // S3 feed URL that TikTok's crawler scrapes on its own schedule. There is
    // no per-product push, so any delta-push job arriving here is a misroute
    // (e.g., manual ops enqueue or a stale cron from before Phase 3). Write a
    // skipped delivery row for audit and return without throwing — throwing
    // would trip the circuit breaker via the catch path below.
    const skipped = deps.channelDeliveryRepo.create({
      channel_id: channel.id,
      kind: "delta" as ChannelDelivery["kind"],
      event_name: job.action === "upsert" ? "product.upsert" : "product.delete",
      payload: { offerId: job.offerId, reason: "tiktok_no_delta_push" },
      status: "skipped" as ChannelDelivery["status"],
      attempt: attemptsMade + 1,
    } as unknown as ChannelDelivery);
    await deps.channelDeliveryRepo.save(skipped);
    return { status: "failed" };
  }
  if (channel.degraded_until && channel.degraded_until > new Date()) {
    throw new Error("channel_degraded");
  }
  if (!channel.credentials_encrypted) throw new Error("channel_no_credentials");

  // Decrypt the raw credentials blob; channel-specific readers below validate
  // and narrow it to the right shape (Google: nested-or-flat Merchant Center +
  // optional Google Ads; Meta: pixel/catalog/business/accessToken).
  const rawCreds = deps.encryption.decryptObject<Record<string, unknown>>(
    channel.credentials_encrypted,
  );

  const start = Date.now();
  const delivery = deps.channelDeliveryRepo.create({
    channel_id: channel.id,
    kind: "delta" as ChannelDelivery["kind"],
    event_name: job.action === "upsert" ? "product.upsert" : "product.delete",
    payload: job.item
      ? { offerId: job.offerId, ...sanitizeForLog(job.item as unknown as Record<string, unknown>) }
      : { offerId: job.offerId },
    status: "running" as ChannelDelivery["status"],
    attempt: attemptsMade + 1,
  } as unknown as ChannelDelivery);
  await deps.channelDeliveryRepo.save(delivery);

  try {
    let response: { status: number; body?: unknown };
    // Channel-aware dispatch. Google + Meta both push individual product
    // changes between 2h feed rebuilds. TikTok is XML-poll-based and is
    // short-circuited above this block — it never reaches the dispatch
    // chain. When adding a new channel here, also extend SERIALIZERS in
    // feed/feed-build.cron.ts so the daily-rebuild path picks it up.
    // The else-throw below is a circuit-breaker trip; only the dispatch
    // chain (not the tiktok short-circuit) should fall into it.
    if (channel.code === "google_merchant") {
      const creds = readGoogleChannelCredentials(rawCreds).merchantCenter;
      if (job.action === "upsert") {
        if (!job.item) throw new Error("upsert_missing_item");
        response = await deps.googleAdapter.upsertProduct(creds, job.item);
      } else {
        response = await deps.googleAdapter.deleteProduct(creds, job.offerId);
      }
    } else if (channel.code === "meta_catalog") {
      const creds = readMetaChannelCredentials(rawCreds);
      if (job.action === "upsert") {
        if (!job.item) throw new Error("upsert_missing_item");
        response = await deps.metaAdapter.pushBatch(creds, [
          { method: "UPDATE", retailerId: job.offerId, item: job.item },
        ]);
      } else {
        response = await deps.metaAdapter.pushBatch(creds, [
          { method: "DELETE", retailerId: job.offerId },
        ]);
      }
    } else {
      throw new Error(`no_adapter_for_channel:${channel.code}`);
    }
    if (job.action === "delete") {
      // Successful delete: soft-delete the channel_listings row so the next
      // scan cycle doesn't keep re-enqueueing the delete.
      await deps.channelListingRepo
        .createQueryBuilder()
        .softDelete()
        .where("channel_id = :c AND offer_id = :o", { c: channel.id, o: job.offerId })
        .execute();
    }
    delivery.response_status = response.status;
    delivery.status = "success" as ChannelDelivery["status"];
    delivery.latency_ms = Date.now() - start;
    await deps.channelDeliveryRepo.save(delivery);
    return { status: "success" };
  } catch (err) {
    const status =
      typeof err === "object" && err !== null && "status" in err
        ? Number((err as { status: number }).status)
        : 0;
    delivery.response_status = status || null;
    delivery.status = "failed" as ChannelDelivery["status"];
    delivery.latency_ms = Date.now() - start;
    delivery.error_message = String(err instanceof Error ? (err.stack ?? err.message) : err);
    await deps.channelDeliveryRepo.save(delivery);

    // Push failure into Redis sorted set and evaluate the circuit. We encode
    // the timestamp into both score AND value so we can recover failure
    // timestamps with a plain zRange (no WITHSCORES), matching the dispatcher
    // worker's pattern.
    const key = FAILURE_KEY(channel.id);
    const now = Date.now();
    await deps.redis.zAdd(key, {
      score: now,
      value: `${now}-${crypto.randomUUID()}`,
    });
    await deps.redis.zRemRangeByScore(key, 0, now - FAILURE_WINDOW_MS);
    const raw = await deps.redis.zRange(key, 0, -1);
    const failures = raw
      .map((entry) => Number.parseInt(entry.split("-")[0] ?? "", 10))
      .filter((n) => Number.isFinite(n));
    const circuit = evaluateCircuit({
      failures,
      now,
      windowMs: FAILURE_WINDOW_MS,
      threshold: FAILURE_THRESHOLD,
    });
    if (circuit.tripped && circuit.degradedUntil) {
      console.error(
        JSON.stringify({
          evt: "channel.circuit-breaker.tripped",
          channel: channel.code,
          channelId: channel.id,
          failureCount: circuit.count,
          degradedUntil: new Date(circuit.degradedUntil).toISOString(),
        }),
      );
      channel.degraded_until = new Date(circuit.degradedUntil);
      await deps.salesChannelRepo.save(channel);
    }
    throw err;
  }
}

/** Drop `image_link` / `additional_image_links` / `link` from the logged
 *  payload — they're noisy URLs recoverable from the source rows. Per spec §9
 *  deltas have no PII so no other redaction is required. */
function sanitizeForLog(item: Record<string, unknown>): Record<string, unknown> {
  const { image_link, additional_image_links, link, ...rest } = item;
  // Reference the destructured names so TS/biome don't complain about unused.
  void image_link;
  void additional_image_links;
  void link;
  return rest;
}
