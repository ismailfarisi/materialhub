import { config } from "@materialhub/config";
import { HttpError } from "@materialhub/plugins";
import { type RedisClientType, createClient } from "redis";

const COOLDOWN_SECONDS = 60;
const HOURLY_CAP = 5;
const HOUR_SECONDS = 3600;

export interface OtpCooldownStore {
  /**
   * Atomically increments the counter for `key`, setting the TTL on first
   * write and self-healing it if the key was somehow left without one.
   * Returns the new count and the key's remaining TTL in seconds, taken
   * from the same round trip so the two values can never disagree.
   */
  hit(key: string, ttlSeconds: number): Promise<{ count: number; ttl: number }>;
  /**
   * Gives back one unit of `key`, leaving its TTL alone. Used to refund a
   * budget that was reserved for work that then never happened. Never drops
   * below zero, and never creates the key if it is already gone.
   */
  undo(key: string): Promise<void>;
}

export interface OtpCooldown {
  check(userId: string, phone: string): Promise<void>;
  /**
   * Refunds the hourly slot `check` reserved, for when the send it was
   * reserved for never made it out.
   */
  refund(userId: string): Promise<void>;
}

function rateLimited(retryAfterSeconds: number): HttpError {
  return new HttpError(
    429,
    "Too many verification requests. Please wait before trying again.",
    "OTP_RATE_LIMITED",
    { retry_after_seconds: retryAfterSeconds },
  );
}

export function createOtpCooldown(store: OtpCooldownStore): OtpCooldown {
  return {
    async check(userId, phone) {
      // Per-number cooldown: blocks resend spam to one target.
      const cdKey = `otp:cd:${userId}:${phone}`;
      const cd = await store.hit(cdKey, COOLDOWN_SECONDS);
      if (cd.count > 1) throw rateLimited(cd.ttl);

      // Per-user hourly cap: blocks spraying many different numbers.
      const hrKey = `otp:hr:${userId}`;
      const hr = await store.hit(hrKey, HOUR_SECONDS);
      if (hr.count > HOURLY_CAP) throw rateLimited(hr.ttl);
    },

    // Only the hourly cap is refunded, never the 60s per-number cooldown. The
    // hourly cap exists to price SMS, so a send that never dispatched must not
    // spend it — five failed sends should not cost an hour of lockout. The
    // cooldown deliberately stands: a send can fail *after* Twilio already
    // dispatched (a timeout reading the response), and refunding it would let
    // an instant retry double-send to the same number.
    async refund(userId) {
      await store.undo(`otp:hr:${userId}`);
    },
  };
}

let redis: RedisClientType | null = null;

// Circuit breaker, mirroring libs/plugins/src/rate-limiter.ts. Without it, a
// Redis outage makes every call pay the full connectTimeout before falling
// back to memory — and `check` calls hit() twice, so each OTP request would
// stall ~4s and abandon two unconnected clients. Once tripped, we skip Redis
// entirely for REDIS_RETRY_MS and go straight to the memory store.
const REDIS_RETRY_MS = 30_000;
let redisUnavailable = false;
let redisRetryAt = 0;

function markRedisUnavailable(): void {
  redisUnavailable = true;
  redisRetryAt = Date.now() + REDIS_RETRY_MS;
  redis = null;
}

async function getRedis(): Promise<RedisClientType | null> {
  if (redis?.isOpen) return redis;
  if (redisUnavailable && Date.now() < redisRetryAt) return null;
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
      markRedisUnavailable();
    });
    await client.connect();
    redis = client;
    redisUnavailable = false;
    return redis;
  } catch {
    markRedisUnavailable();
    return null;
  }
}

/** Resets the breaker between tests. */
export function resetRedisBreaker(): void {
  redisUnavailable = false;
  redisRetryAt = 0;
  redis = null;
}

// Atomic increment-with-expiry, mirroring libs/plugins/src/rate-limiter.ts's
// checkRateLimitRedis. INCR then a separate EXPIRE is two round trips; if the
// connection drops in between (this client uses reconnectStrategy: false and
// nulls itself on any error), the key is left with a count and NO TTL, which
// for `otp:hr:<user>` would lock that user out of ever sending another OTP
// again. The Lua script makes the increment + expiry atomic, and also
// self-heals a key that is somehow already orphaned (TTL < 0 but exists) by
// re-applying the expiry rather than leaving it permanent. Returning
// {count, ttl} from the same call also avoids a second race where a later,
// separate TTL read could return 0/-2 if the key expires in between.
const HIT_LUA = `
  local count = redis.call('INCR', KEYS[1])
  if count == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end
  local ttl = redis.call('TTL', KEYS[1])
  if ttl < 0 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
    ttl = tonumber(ARGV[1])
  end
  return {count, ttl}
`;

async function redisHit(
  client: RedisClientType,
  key: string,
  ttlSeconds: number,
): Promise<{ count: number; ttl: number }> {
  const result = (await client.eval(HIT_LUA, {
    keys: [key],
    arguments: [String(ttlSeconds)],
  })) as [number, number];
  return { count: result[0], ttl: result[1] };
}

// Refund one unit without touching the TTL, so the hourly window still ends
// when it was always going to. Guarded on EXISTS and count > 0: a bare DECR
// would resurrect an expired key at -1 and, worse, leave it with no TTL —
// exactly the permanent-lockout shape HIT_LUA exists to avoid.
const UNDO_LUA = `
  if redis.call('EXISTS', KEYS[1]) == 0 then
    return 0
  end
  local count = tonumber(redis.call('GET', KEYS[1]))
  if count and count > 0 then
    redis.call('DECR', KEYS[1])
  end
  return 1
`;

async function redisUndo(client: RedisClientType, key: string): Promise<void> {
  await client.eval(UNDO_LUA, { keys: [key] });
}

interface MemoryOtpCooldownStore extends OtpCooldownStore {
  /** Drops expired entries; exposed so the background timer can call it. */
  purgeExpired(): void;
}

/**
 * Builds an isolated in-memory store. Exported (rather than only the
 * `memoryOtpCooldownStore` singleton below) so tests can inject a fake clock
 * and deterministically drive expiry without real sleeps.
 */
export function createMemoryOtpCooldownStore(now: () => number = Date.now): MemoryOtpCooldownStore {
  const entries = new Map<string, { count: number; expiresAt: number }>();

  return {
    async hit(key, ttlSeconds) {
      const t = now();
      const entry = entries.get(key);
      if (!entry || entry.expiresAt <= t) {
        entries.set(key, { count: 1, expiresAt: t + ttlSeconds * 1000 });
        return { count: 1, ttl: ttlSeconds };
      }
      entry.count += 1;
      return { count: entry.count, ttl: Math.max(0, Math.ceil((entry.expiresAt - t) / 1000)) };
    },
    async undo(key) {
      const entry = entries.get(key);
      // An already-expired entry is left alone: the window it belonged to is
      // over, so there is nothing to give back.
      if (!entry || entry.expiresAt <= now()) return;
      entry.count = Math.max(0, entry.count - 1);
    },
    purgeExpired() {
      const t = now();
      for (const [key, entry] of entries) {
        if (entry.expiresAt <= t) entries.delete(key);
      }
    },
  };
}

/**
 * Falls back to per-process memory when Redis is down, matching the gateway
 * rate-limiter's behaviour. Weaker across replicas, but a Redis outage must not
 * take address verification offline.
 */
export const memoryOtpCooldownStore: OtpCooldownStore = createMemoryOtpCooldownStore();

// Bound the fallback map's memory the same way rate-limiter.ts does: every
// distinct (user, phone) touched during a Redis outage would otherwise leak
// for the lifetime of the process.
const cleanupTimer = setInterval(() => {
  (memoryOtpCooldownStore as MemoryOtpCooldownStore).purgeExpired();
}, 60_000);

/** Call this to stop the background cleanup timer (e.g. in tests). */
export function stopCleanupTimer() {
  clearInterval(cleanupTimer);
}

export const redisOtpCooldownStore: OtpCooldownStore = {
  async hit(key, ttlSeconds) {
    const client = await getRedis();
    if (!client) return memoryOtpCooldownStore.hit(key, ttlSeconds);
    try {
      return await redisHit(client, key, ttlSeconds);
    } catch {
      // The connection died mid-command. Degrade rather than 500 the request.
      markRedisUnavailable();
      return memoryOtpCooldownStore.hit(key, ttlSeconds);
    }
  },
  async undo(key) {
    const client = await getRedis();
    if (!client) return memoryOtpCooldownStore.undo(key);
    try {
      await redisUndo(client, key);
    } catch {
      markRedisUnavailable();
      await memoryOtpCooldownStore.undo(key);
    }
  },
};
