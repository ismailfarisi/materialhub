import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { config } from "@materialhub/config";
import { type RedisClientType, createClient } from "redis";

// Unlike Twilio Verify (which generates and checks codes on Twilio's side),
// the Meta Cloud API only delivers messages — so the WhatsApp OTP path owns
// the code lifecycle: generate here, store a hash, verify here.
const CODE_TTL_SECONDS = 300;
const MAX_ATTEMPTS = 5;

export interface WhatsAppOtpStore {
  /** Generates a fresh 6-digit code for `phone`, replacing any prior one. */
  issue(phone: string): Promise<string>;
  /** Constant-time check; the code is single-use and capped at 5 attempts. */
  verify(phone: string, code: string): Promise<boolean>;
}

/**
 * Minimal KV seam so the store logic is testable without Redis, mirroring
 * otp-cooldown.ts's store/impl split.
 */
export interface OtpKv {
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  get(key: string): Promise<string | null>;
  del(...keys: string[]): Promise<void>;
  /** Increment with TTL applied on first write (atomic enough for an attempt counter). */
  incr(key: string, ttlSeconds: number): Promise<number>;
}

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function codeKey(phone: string): string {
  return `otp:wa:${phone}`;
}

function attemptsKey(phone: string): string {
  return `otp:wa:att:${phone}`;
}

export function createWhatsAppOtpStore(kv: OtpKv): WhatsAppOtpStore {
  return {
    async issue(phone) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      await kv.del(attemptsKey(phone));
      await kv.set(codeKey(phone), hashCode(code), CODE_TTL_SECONDS);
      return code;
    },

    async verify(phone, code) {
      const stored = await kv.get(codeKey(phone));
      if (!stored) return false;

      // Count the attempt BEFORE comparing, so a brute-forcer can't get
      // unlimited tries by racing the comparison. TTL matches the code's so
      // the counter can't outlive what it guards.
      const attempts = await kv.incr(attemptsKey(phone), CODE_TTL_SECONDS);
      if (attempts > MAX_ATTEMPTS) {
        await kv.del(codeKey(phone), attemptsKey(phone));
        return false;
      }

      const expected = Buffer.from(stored, "hex");
      const actual = Buffer.from(hashCode(code), "hex");
      const matches = expected.length === actual.length && timingSafeEqual(expected, actual);
      if (matches) {
        // Single-use: a verified code must never verify twice.
        await kv.del(codeKey(phone), attemptsKey(phone));
      }
      return matches;
    },
  };
}

// ── Redis-backed KV with in-memory fallback ─────────────────────────────────
// Same circuit-breaker shape as otp-cooldown.ts: a Redis outage degrades OTP
// to per-process memory (weaker across replicas) instead of 500-ing requests
// or stalling on connect timeouts.

const REDIS_RETRY_MS = 30_000;
let redis: RedisClientType | null = null;
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
    // Attach before connect(): an 'error' with no listener takes the process
    // down rather than degrading.
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
export function resetWhatsAppOtpRedisBreaker(): void {
  redisUnavailable = false;
  redisRetryAt = 0;
  redis = null;
}

/**
 * Exported (rather than only the singleton below) so tests can inject a fake
 * clock and drive expiry deterministically — same shape as
 * otp-cooldown.ts's createMemoryOtpCooldownStore.
 */
export function createMemoryOtpKv(now: () => number = Date.now): OtpKv & {
  purgeExpired(): void;
} {
  const entries = new Map<string, { value: string; expiresAt: number }>();

  const live = (key: string) => {
    const entry = entries.get(key);
    if (!entry || entry.expiresAt <= now()) {
      entries.delete(key);
      return null;
    }
    return entry;
  };

  return {
    async set(key, value, ttlSeconds) {
      entries.set(key, { value, expiresAt: now() + ttlSeconds * 1000 });
    },
    async get(key) {
      return live(key)?.value ?? null;
    },
    async del(...keys) {
      for (const key of keys) entries.delete(key);
    },
    async incr(key, ttlSeconds) {
      const entry = live(key);
      if (!entry) {
        entries.set(key, { value: "1", expiresAt: now() + ttlSeconds * 1000 });
        return 1;
      }
      const next = (Number(entry.value) || 0) + 1;
      entry.value = String(next);
      return next;
    },
    purgeExpired() {
      const t = now();
      for (const [key, entry] of entries) {
        if (entry.expiresAt <= t) entries.delete(key);
      }
    },
  };
}

const memoryKv = createMemoryOtpKv();

// Bound the fallback map's memory like otp-cooldown.ts does — every phone
// touched during a Redis outage would otherwise leak for the process lifetime.
const cleanupTimer = setInterval(() => {
  memoryKv.purgeExpired();
}, 60_000);

/** Stops the background cleanup timer (e.g. in tests). */
export function stopWhatsAppOtpCleanupTimer(): void {
  clearInterval(cleanupTimer);
}

// INCR then a separate EXPIRE is two round trips; a dropped connection in
// between would leave an attempt counter with no TTL. Same Lua shape as
// otp-cooldown.ts's HIT_LUA, minus the ttl return we don't need here.
const INCR_LUA = `
  local count = redis.call('INCR', KEYS[1])
  if count == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end
  if redis.call('TTL', KEYS[1]) < 0 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end
  return count
`;

export const redisOtpKv: OtpKv = {
  async set(key, value, ttlSeconds) {
    const client = await getRedis();
    if (!client) return memoryKv.set(key, value, ttlSeconds);
    try {
      await client.set(key, value, { EX: ttlSeconds });
    } catch {
      markRedisUnavailable();
      await memoryKv.set(key, value, ttlSeconds);
    }
  },
  async get(key) {
    const client = await getRedis();
    if (!client) return memoryKv.get(key);
    try {
      return await client.get(key);
    } catch {
      markRedisUnavailable();
      return memoryKv.get(key);
    }
  },
  async del(...keys) {
    const client = await getRedis();
    if (!client) return memoryKv.del(...keys);
    try {
      await client.del(keys);
    } catch {
      markRedisUnavailable();
      await memoryKv.del(...keys);
    }
  },
  async incr(key, ttlSeconds) {
    const client = await getRedis();
    if (!client) return memoryKv.incr(key, ttlSeconds);
    try {
      return (await client.eval(INCR_LUA, {
        keys: [key],
        arguments: [String(ttlSeconds)],
      })) as number;
    } catch {
      markRedisUnavailable();
      return memoryKv.incr(key, ttlSeconds);
    }
  },
};
