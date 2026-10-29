import { config } from "@materialhub/config";
import { AppDataSource, type VendorMemberRole } from "@materialhub/database";
import { type RedisClientType, createClient } from "redis";

interface MinimalRedis {
  isOpen: boolean;
  get: (key: string) => Promise<string | null>;
}
interface MinimalDataSource {
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
}

let redis: MinimalRedis | null = null;
let redisUnavailable = false;
let redisRetryAt = 0;
const REDIS_RETRY_MS = 30_000;
const POLL_INTERVAL_MS = 30_000;

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

export class PermissionMatrix {
  private map = new Map<VendorMemberRole, Set<string>>();
  private version: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly ds: MinimalDataSource = AppDataSource as unknown as MinimalDataSource,
  ) {}

  async load(): Promise<void> {
    const rows = (await this.ds.query("SELECT role, permission FROM role_permissions")) as Array<{
      role: string;
      permission: string;
    }>;
    const next = new Map<VendorMemberRole, Set<string>>();
    for (const { role, permission } of rows) {
      const set = next.get(role as VendorMemberRole) ?? new Set<string>();
      set.add(permission);
      next.set(role as VendorMemberRole, set);
    }
    this.map = next;
    const r = await getRedis();
    this.version = r ? await safeGet(r, "matrix_version") : null;
  }

  has(role: VendorMemberRole, permission: string): boolean {
    return this.map.get(role)?.has(permission) ?? false;
  }

  async checkVersionAndReload(): Promise<void> {
    const r = await getRedis();
    if (!r) return;
    const v = await safeGet(r, "matrix_version");
    if (v !== this.version) {
      await this.load();
    }
  }

  startPolling(intervalMs: number = POLL_INTERVAL_MS): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.checkVersionAndReload().catch(() => {
        /* swallow — observability metric covers this */
      });
    }, intervalMs);
  }

  stopPolling(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Test seam — replace the matrix in-place. Never invoked from prod code. */
  __setMapForTests(rows: Array<{ role: string; permission: string }>): void {
    const next = new Map<VendorMemberRole, Set<string>>();
    for (const { role, permission } of rows) {
      const set = next.get(role as VendorMemberRole) ?? new Set<string>();
      set.add(permission);
      next.set(role as VendorMemberRole, set);
    }
    this.map = next;
  }
}

/**
 * INCR `matrix_version` so all processes pick up the new state within ≤30s
 * via the polling loop in PermissionMatrix.checkVersionAndReload.
 *
 * Best-effort — if Redis is unavailable, returns false. The matrix mutation
 * itself is in Postgres; Redis is just the fan-out signal.
 */
export async function bumpMatrixVersion(): Promise<boolean> {
  const r = await getRedis();
  if (!r) return false;
  try {
    // The MinimalRedis interface exposes only `get`; cast to access INCR.
    await (r as unknown as { incr: (key: string) => Promise<number> }).incr("matrix_version");
    return true;
  } catch {
    return false;
  }
}

async function safeGet(r: MinimalRedis, key: string): Promise<string | null> {
  try {
    return await r.get(key);
  } catch {
    return null;
  }
}

export const permissionMatrix = new PermissionMatrix();

export function __setRedisForTests(r: MinimalRedis | null): void {
  redis = r;
  redisUnavailable = false;
}
