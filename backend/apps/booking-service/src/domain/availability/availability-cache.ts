import { config } from "@materialhub/config";
import { type RedisClientType, createClient } from "redis";
import { type Interval, localDaysInRange } from "./interval-math.ts";

// Cache keys are location-timezone-local days, but write-side callers
// (engagement/time-off) only know UTC instants and not the tz. Padding the UTC
// span by 14h on each side guarantees the correct local-day key is invalidated
// for any real-world offset (UTC-12..UTC+14); the few extra keys just recompute
// on next read. Safety never depends on this — the GiST EXCLUDE does.
const TZ_PAD_MS = 14 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

// Circuit breaker, mirroring auth-service's otp-cooldown.ts. Once Redis has
// failed we skip it entirely for this long instead of paying connectTimeout (or
// a rejected command) on every one of the ~60 day-keys a single availability
// request touches.
const REDIS_RETRY_MS = 30_000;

// Minimal surface we need from a Redis client — lets tests inject an in-memory
// fake and keeps the cache logic CI-safe (no live server required). The value
// for one staff-day is a HASH whose fields are timezones (see `key`/`field`).
export interface RedisLike {
  hGet(key: string, field: string): Promise<string | null | undefined>;
  hSet(key: string, field: string, value: string): Promise<unknown>;
  expire(key: string, seconds: number): Promise<unknown>;
  del(keys: string | string[]): Promise<unknown>;
}

interface SerializedWindow {
  s: string;
  e: string;
}

// Redis read-model for the availability engine. The cached value is the set of
// FREE windows for one staff member on one calendar day, and it is
// OFFERING-AGNOSTIC: it holds working-hours minus busy time, before any
// per-offering duration/buffer slicing. That keeps a single cache entry reusable
// across every service a staff member performs; slicing happens after read.
// Vendor holidays are deliberately NOT baked in — they are written by
// vendor-service, which cannot invalidate this cache, so the read side
// subtracts them fresh on every request (see AvailabilityService).
//
// KEY SHAPE: `avail:{staffId}:{localDay}` is a HASH keyed by IANA timezone.
// The cached windows are computed from dayRangeUtc(day, timezone), so the same
// local-day label means a DIFFERENT UTC span per zone — a staff member shared
// between a Dubai and a London branch must not read each other's windows.
// Keeping the timezone as a hash FIELD (rather than in the key) lets the
// tz-blind write-side invalidators drop every zone's copy with one DEL.
//
// DEGRADATION CONTRACT:
//  - reads/writes never throw: a Redis failure falls through to compute, so
//    availability is never blocked by a cache outage;
//  - a failed INVALIDATION is not swallowed as "fine". Because we cannot prove
//    the stale entry is gone, the cache goes BLIND (read-through + no writes)
//    for one full TTL, by which point any entry we failed to delete has expired
//    on its own. Serving a known-stale free window would sell a booked slot;
//    recomputing for a few minutes only costs CPU.
export class AvailabilityCache {
  private lazyClient: RedisLike | null = null;
  private connectAttempted = false;
  private readonly injected: boolean;
  private retryAt = 0;
  // While set, reads and writes are skipped entirely (fail-closed after a
  // failed invalidation). Stored as an epoch ms deadline.
  private blindUntil = 0;

  // Pass a client (or explicit null) in tests; omit in production to lazily
  // connect the real Redis and degrade to null on failure.
  constructor(
    client?: RedisLike | null,
    private readonly ttlSeconds: number = config.cache.availabilityTtl,
  ) {
    this.injected = client !== undefined;
    this.lazyClient = client ?? null;
  }

  key(staffId: string, day: string): string {
    return `avail:${staffId}:${day}`;
  }

  // Hash field: the timezone the windows were computed in.
  private field(timezone: string): string {
    return timezone;
  }

  private markUnavailable(): void {
    if (this.injected) return;
    this.lazyClient = null;
    this.connectAttempted = false;
    this.retryAt = Date.now() + REDIS_RETRY_MS;
  }

  // Stop trusting the cache for one TTL — every entry we may have failed to
  // delete has expired by then.
  private goBlind(): void {
    this.blindUntil = Date.now() + this.ttlSeconds * 1000;
  }

  private isBlind(): boolean {
    return Date.now() < this.blindUntil;
  }

  private async getRedis(): Promise<RedisLike | null> {
    if (this.injected) return this.lazyClient;
    if (this.lazyClient) return this.lazyClient;
    if (this.connectAttempted) return null;
    if (Date.now() < this.retryAt) return null;
    this.connectAttempted = true;
    try {
      const client: RedisClientType = createClient({
        socket: {
          host: config.redis.host,
          port: config.redis.port,
          connectTimeout: 2000,
          reconnectStrategy: false,
        },
        password: config.redis.password,
      });
      // Attach before connect(): an 'error' with no listener is an unhandled
      // 'error' event, which takes the process down rather than degrading.
      client.on("error", () => {
        this.markUnavailable();
      });
      await client.connect();
      this.lazyClient = client as unknown as RedisLike;
      return this.lazyClient;
    } catch {
      this.markUnavailable();
      return null;
    }
  }

  // Return the free windows for staffId/day in `timezone`, computing + storing
  // on a miss. Thin wrapper over getOrComputeMany.
  async getOrCompute(
    staffId: string,
    day: string,
    timezone: string,
    compute: () => Promise<Interval[]>,
  ): Promise<Interval[]> {
    const byDay = await this.getOrComputeMany(staffId, timezone, [day], compute);
    return byDay.get(day) ?? [];
  }

  // Batched cache-aside for a whole date range of one staff member. All reads
  // are issued together and all writes are issued together, so a 62-day request
  // costs two pipelined Redis batches instead of 124 sequential round trips
  // (node-redis pipelines commands queued in the same tick).
  async getOrComputeMany(
    staffId: string,
    timezone: string,
    days: string[],
    compute: (day: string) => Promise<Interval[]>,
  ): Promise<Map<string, Interval[]>> {
    const out = new Map<string, Interval[]>();
    if (days.length === 0) return out;
    const redis = this.isBlind() ? null : await this.getRedis();
    const field = this.field(timezone);

    const misses: string[] = [];
    if (redis) {
      const raw = await this.safe(
        () => Promise.all(days.map((d) => redis.hGet(this.key(staffId, d), field))),
        null,
      );
      days.forEach((day, i) => {
        const cached = raw?.[i];
        if (cached) out.set(day, deserialize(cached));
        else misses.push(day);
      });
    } else {
      misses.push(...days);
    }

    const computed = await Promise.all(misses.map((day) => compute(day)));
    misses.forEach((day, i) => out.set(day, computed[i] as Interval[]));

    if (redis && misses.length > 0) {
      await this.safe(
        () =>
          Promise.all(
            misses.map(async (day) => {
              const k = this.key(staffId, day);
              await redis.hSet(k, field, serialize(out.get(day) as Interval[]));
              await redis.expire(k, this.ttlSeconds);
            }),
          ),
        null,
      );
    }
    return out;
  }

  // Drop cached free windows (every timezone) for a staff member on the given
  // days — write-side invalidation after an engagement/rule/time-off change.
  // Never throws: the caller has already committed its write, so a cache
  // failure must not turn a successful mutation into a 500 (and a retried
  // "create" would duplicate the row). Instead the cache goes blind, see the
  // degradation contract above.
  async invalidate(staffId: string, days: string[]): Promise<void> {
    if (days.length === 0) return;
    const redis = await this.getRedis();
    if (!redis) {
      // No client at all — nothing was written either, but entries from before
      // the outage may still be live, so fail the read model closed.
      this.goBlind();
      return;
    }
    try {
      await redis.del(days.map((d) => this.key(staffId, d)));
    } catch {
      this.markUnavailable();
      this.goBlind();
    }
  }

  // Invalidate every day a concrete [start, end] busy interval could touch,
  // padded ±14h so the tz-local key is always covered. Used after an engagement
  // or time-off write.
  invalidateRange(staffId: string, start: Date, end: Date): Promise<void> {
    const days = localDaysInRange(
      new Date(start.getTime() - TZ_PAD_MS),
      new Date(end.getTime() + TZ_PAD_MS),
      "UTC",
    );
    return this.invalidate(staffId, days);
  }

  // Invalidate a bounded forward horizon from `from`. Used after a recurring
  // working-hours change, which has no bounded day set — callers size `days` to
  // the vendor's real max_advance_days (see AvailabilityRuleService).
  invalidateHorizon(staffId: string, from: Date, days: number): Promise<void> {
    const to = new Date(from.getTime() + days * DAY_MS);
    return this.invalidate(staffId, localDaysInRange(from, to, "UTC"));
  }

  // Run a Redis op, trip the breaker and return `fallback` if it rejects. Only
  // for read-model ops that are safe to skip (get/set), never for invalidation.
  private async safe<T>(op: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await op();
    } catch {
      this.markUnavailable();
      return fallback;
    }
  }
}

function serialize(windows: Interval[]): string {
  const payload: SerializedWindow[] = windows.map((w) => ({
    s: w.start.toISOString(),
    e: w.end.toISOString(),
  }));
  return JSON.stringify(payload);
}

function deserialize(raw: string): Interval[] {
  const payload = JSON.parse(raw) as SerializedWindow[];
  return payload.map((w) => ({ start: new Date(w.s), end: new Date(w.e) }));
}
