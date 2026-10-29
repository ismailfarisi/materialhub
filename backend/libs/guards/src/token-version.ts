import { config } from "@materialhub/config";
import { AppDataSource } from "@materialhub/database";
import { type RedisClientType, createClient } from "redis";

interface MinimalRedis {
  isOpen: boolean;
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, opts?: { EX?: number }) => Promise<unknown>;
}

interface MinimalDataSource {
  query: (sql: string, params: unknown[]) => Promise<unknown>;
}

let redis: MinimalRedis | null = null;
let dataSourceOverride: MinimalDataSource | null = null;
let redisUnavailable = false;
let redisRetryAt = 0;
const REDIS_RETRY_MS = 30_000;
const TV_TTL_SECONDS = 3600;

async function getRedis(): Promise<MinimalRedis | null> {
  if (redis) return redis.isOpen ? redis : null;
  if (redisUnavailable && Date.now() < redisRetryAt) return null;
  try {
    const client = createClient({
      socket: {
        host: config.redis.host,
        port: config.redis.port,
        connectTimeout: 2000,
        reconnectStrategy: false,
      },
      password: config.redis.password,
    }) as RedisClientType;
    client.on("error", () => {
      redis = null;
      redisUnavailable = true;
      redisRetryAt = Date.now() + REDIS_RETRY_MS;
    });
    await client.connect();
    redis = client as unknown as MinimalRedis;
    redisUnavailable = false;
    return redis;
  } catch {
    redisUnavailable = true;
    redisRetryAt = Date.now() + REDIS_RETRY_MS;
    return null;
  }
}

function ds(): MinimalDataSource {
  return dataSourceOverride ?? (AppDataSource as unknown as MinimalDataSource);
}

export async function getCurrentTokenVersion(userId: string): Promise<number | null> {
  const r = await getRedis();
  if (r) {
    try {
      const cached = await r.get(`user:${userId}:tv`);
      if (cached !== null) {
        const n = Number.parseInt(cached, 10);
        if (Number.isFinite(n)) return n;
      }
    } catch {
      /* fall through to DB */
    }
  }
  const rows = (await ds().query(
    "SELECT token_version FROM users WHERE id = $1 AND deleted_at IS NULL",
    [userId],
  )) as Array<{ token_version: number }>;
  const [first] = rows;
  if (!first) return null;
  const tv = first.token_version;
  if (r) {
    try {
      await r.set(`user:${userId}:tv`, String(tv), { EX: TV_TTL_SECONDS });
    } catch {
      /* best-effort */
    }
  }
  return tv;
}

export async function bumpTokenVersion(userId: string): Promise<number> {
  const result = (await ds().query(
    "UPDATE users SET token_version = token_version + 1, updated_at = NOW() WHERE id = $1 RETURNING token_version",
    [userId],
  )) as unknown;
  const next = extractTv(result);
  if (next === null) throw new Error(`token_version bump failed for user ${userId}`);
  const r = await getRedis();
  if (r) {
    try {
      await r.set(`user:${userId}:tv`, String(next), { EX: TV_TTL_SECONDS });
    } catch {
      /* best-effort — DB is source of truth */
    }
  }
  return next;
}

function extractTv(result: unknown): number | null {
  if (Array.isArray(result) && result.length > 0) {
    const head = result[0];
    if (Array.isArray(head) && head.length > 0 && typeof head[0]?.token_version === "number") {
      return head[0].token_version;
    }
    if (head && typeof (head as { token_version?: number }).token_version === "number") {
      return (head as { token_version: number }).token_version;
    }
  }
  return null;
}

export function __setRedisForTests(r: MinimalRedis | null): void {
  redis = r;
  redisUnavailable = false;
}
export function __setDataSourceForTests(d: MinimalDataSource | null): void {
  dataSourceOverride = d;
}
