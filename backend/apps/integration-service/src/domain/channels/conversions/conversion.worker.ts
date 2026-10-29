import { config } from "@materialhub/config";
import type { ChannelDelivery, Order, SalesChannel, User } from "@materialhub/database";
import type { EncryptionService } from "@materialhub/utils";
import { Worker } from "bullmq";
import type { Repository } from "typeorm";
import type { GoogleAdsAdapter } from "../adapters/google-ads.adapter.ts";
import type { MetaAdapter } from "../adapters/meta.adapter.ts";
import type { TiktokAdapter } from "../adapters/tiktok.adapter.ts";
import {
  type MetaChannelCredentials,
  type TiktokChannelCredentials,
  readGoogleChannelCredentials,
  readMetaChannelCredentials,
  readTiktokChannelCredentials,
} from "../credentials.ts";
import type { ConversionEventPayload } from "./conversion-event.ts";

/**
 * Queue name MUST match the order-service publisher (Task 8 —
 * `backend/apps/order-service/src/domain/order/channel-conversion-events.ts`).
 * Treat as a wire-protocol constant.
 */
export const CHANNEL_CONVERSION_EVENTS_QUEUE = "channel-conversion-events";

export interface ConversionJob {
  orderId: string;
}

export interface ConversionWorkerDeps {
  orderRepo: Repository<Order>;
  userRepo: Repository<User>;
  salesChannelRepo: Repository<SalesChannel>;
  channelDeliveryRepo: Repository<ChannelDelivery>;
  encryption: EncryptionService;
  googleAdsAdapter: GoogleAdsAdapter;
  metaAdapter: MetaAdapter;
  tiktokAdapter: TiktokAdapter;
}

export function createConversionWorker(deps: ConversionWorkerDeps): Worker<ConversionJob> {
  return new Worker<ConversionJob>(
    CHANNEL_CONVERSION_EVENTS_QUEUE,
    async (job) => handleConversion(job.data, job.attemptsMade ?? 0, deps),
    { connection: { url: config.bullmq.redisUrl }, concurrency: 4 },
  );
}

/**
 * Pure handler — receives all deps as an argument so it can be unit-tested
 * without spinning up BullMQ. Returns the run outcome; THROWS if every
 * eligible channel failed (so BullMQ retries per `attempts` config from the
 * publisher). Partial successes are non-fatal.
 */
export async function handleConversion(
  job: ConversionJob,
  attemptsMade: number,
  deps: ConversionWorkerDeps,
): Promise<{ status: "success" | "partial" | "skipped" }> {
  const order = await deps.orderRepo.findOne({
    where: { id: job.orderId } as unknown as Record<string, unknown>,
    relations: ["user", "items"],
  });
  if (!order) return { status: "skipped" };
  // Don't fire for refunded/cancelled/pending orders. PaymentStatus
  // terminal-success is "captured" (no "paid" value exists in the enum —
  // see Phase 1b Task 5 lesson).
  if (order.payment_status !== "captured") {
    return { status: "skipped" };
  }

  const payload: ConversionEventPayload = {
    order_id: order.id,
    currency: order.currency ?? "AED",
    value_fils: order.grand_total,
    customer: {
      email: order.user?.email ?? null,
      phone: order.user?.phone ?? null,
      first_name: order.user?.first_name ?? null,
      last_name: order.user?.last_name ?? null,
      user_id: order.user?.id ?? null,
    },
    items: (order.items ?? []).map((i) => ({
      offer_id: i.variant_id ?? i.product_id,
      quantity: i.quantity,
      price_fils: i.unit_price,
    })),
    // Phase 1b: GCLID transport from browser → server is deferred (would need
    // to plumb sessionStorage through checkout into an order column). Google's
    // Enhanced Conversions still works with hashed email/phone alone.
    gclid: null,
    occurred_at: order.created_at,
    event_source_url: `https://materialhubuae.com/en/account/orders/${encodeURIComponent(order.id)}`,
  };

  const channels = await deps.salesChannelRepo.find({
    where: { is_enabled: true } as unknown as Record<string, unknown>,
  });

  const outcomes: Array<{ channelId: string; ok: boolean; err?: unknown }> = [];

  for (const channel of channels) {
    if (!channel.credentials_encrypted) continue;

    if (channel.code === "google_merchant") {
      const allCreds = readGoogleChannelCredentials(
        deps.encryption.decryptObject<Record<string, unknown>>(channel.credentials_encrypted),
      );
      if (!allCreds.googleAds) continue; // Channel doesn't have Ads creds yet.
      const adsCreds = allCreds.googleAds;
      await runChannelDispatch({
        channel,
        deps,
        order,
        payload,
        attemptsMade,
        outcomes,
        dispatch: () => deps.googleAdsAdapter.uploadEnhancedConversion(adsCreds, payload),
      });
    } else if (channel.code === "meta_catalog") {
      let creds: MetaChannelCredentials;
      try {
        creds = readMetaChannelCredentials(
          deps.encryption.decryptObject<Record<string, unknown>>(channel.credentials_encrypted),
        );
      } catch {
        // Malformed Meta credentials blob (e.g. wrong shape uploaded to this
        // channel). Skip silently — this is operator error, not transient
        // failure, so retrying via BullMQ won't help. Matches Google's
        // `if (!allCreds.googleAds) continue` short-circuit pattern.
        continue;
      }
      await runChannelDispatch({
        channel,
        deps,
        order,
        payload,
        attemptsMade,
        outcomes,
        dispatch: () => deps.metaAdapter.uploadConversion(creds, payload),
      });
    } else if (channel.code === "tiktok") {
      let creds: TiktokChannelCredentials;
      try {
        creds = readTiktokChannelCredentials(
          deps.encryption.decryptObject<Record<string, unknown>>(channel.credentials_encrypted),
        );
      } catch {
        // Malformed TikTok credentials blob (e.g. wrong shape uploaded to this
        // channel). Skip silently — this is operator error, not transient
        // failure, so retrying via BullMQ won't help. Matches Google's
        // `if (!allCreds.googleAds) continue` short-circuit and Meta's
        // try/catch pattern.
        continue;
      }
      await runChannelDispatch({
        channel,
        deps,
        order,
        payload,
        attemptsMade,
        outcomes,
        dispatch: () => deps.tiktokAdapter.uploadConversion(creds, payload),
      });
    }
  }

  if (outcomes.length === 0) return { status: "skipped" };
  if (outcomes.every((o) => o.ok)) return { status: "success" };
  if (outcomes.some((o) => o.ok)) return { status: "partial" };
  // All failed → throw the first error so BullMQ retries.
  throw outcomes[0]?.err ?? new Error("all_conversion_channels_failed");
}

/**
 * Per-channel dispatch helper. Writes the initial `running` delivery row,
 * calls the channel-specific `dispatch()` callback, then updates the row to
 * `success`/`failed`. Pushes the outcome onto `outcomes` for the outer
 * success/partial/all-failed reconciliation.
 *
 * Extracted so each new channel branch in the loop above only needs to thread
 * its own credentials + adapter call; the delivery-row plumbing + try/catch is
 * shared.
 */
async function runChannelDispatch(args: {
  channel: SalesChannel;
  deps: ConversionWorkerDeps;
  order: Order;
  payload: ConversionEventPayload;
  attemptsMade: number;
  outcomes: Array<{ channelId: string; ok: boolean; err?: unknown }>;
  dispatch: () => Promise<{ status: number; body?: unknown }>;
}): Promise<void> {
  const { channel, deps, order, payload, attemptsMade, outcomes, dispatch } = args;
  const start = Date.now();
  const delivery = deps.channelDeliveryRepo.create({
    channel_id: channel.id,
    kind: "conversion" as ChannelDelivery["kind"],
    event_name: "Purchase",
    order_id: order.id,
    // Server-side dedup key: matches the browser-side `transaction_id` /
    // Meta Pixel `eventID` so Google/Meta join the two events. Per spec the
    // browser uses `order.id` too.
    dedup_event_id: order.id,
    payload: { offerCount: payload.items.length },
    status: "running" as ChannelDelivery["status"],
    attempt: attemptsMade + 1,
  } as unknown as ChannelDelivery);
  await deps.channelDeliveryRepo.save(delivery);

  try {
    const result = await dispatch();
    delivery.response_status = result.status;
    delivery.status = "success" as ChannelDelivery["status"];
    delivery.latency_ms = Date.now() - start;
    await deps.channelDeliveryRepo.save(delivery);
    outcomes.push({ channelId: channel.id, ok: true });
  } catch (err) {
    delivery.status = "failed" as ChannelDelivery["status"];
    delivery.latency_ms = Date.now() - start;
    delivery.error_message = String(err instanceof Error ? (err.stack ?? err.message) : err);
    await deps.channelDeliveryRepo.save(delivery);
    outcomes.push({ channelId: channel.id, ok: false, err });
  }
}
