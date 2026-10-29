import { config } from "@materialhub/config";
import { ConflictError, ServiceUnavailableError } from "@materialhub/plugins";
import { type RedisClientType, createClient } from "redis";

// A hold is keyed by staff + the exact [start, end) instant range being held,
// not by an offering — the same primitive backs any offering a staff member
// could be booked for at that time. Epoch-seconds keeps the key stable for the
// same slot regardless of how the caller constructed the Date (timezone-free).
export interface SlotRange {
  start: Date;
  end: Date;
}

function rangeToken(range: SlotRange): string {
  const startSec = Math.floor(range.start.getTime() / 1000);
  const endSec = Math.floor(range.end.getTime() / 1000);
  return `${startSec}-${endSec}`;
}

// 10 minutes — long enough to cover a checkout/payment round trip, short
// enough that an abandoned hold doesn't block the slot for long.
export const HOLD_TTL_SECONDS = 600;

// Minimal surface we need from a Redis client — a single Lua `eval` call per
// operation keeps each of hold/release/assertHeld atomic (no read-then-write
// race between the two keys involved), and lets tests inject an in-memory
// fake that understands these three scripts by identity.
export interface RedisLike {
  eval(script: string, opts: { keys: string[]; arguments: string[] }): Promise<unknown>;
}

// Sets the forward hold key (`hold:{staff}:{range}` -> token) only if absent,
// and — only on that success — the reverse lookup (`holdrev:{token}` ->
// forward key) with the same TTL, so `release`/`assertHeld` (which only ever
// receive the token) can find the forward key again. Both writes happen in
// one round trip so the two keys can never desync.
export const HOLD_SCRIPT = `
local key = KEYS[1]
local revKey = KEYS[2]
local token = ARGV[1]
local ttl = ARGV[2]
if redis.call('SET', key, token, 'NX', 'EX', ttl) then
  redis.call('SET', revKey, key, 'EX', ttl)
  return 1
else
  return 0
end
`;

// Compare-and-delete: only frees the hold if the token presented still owns
// it (so one caller can never release another caller's hold, e.g. after
// expiry + a new hold on the same slot reused the key).
export const RELEASE_SCRIPT = `
local revKey = KEYS[1]
local token = ARGV[1]
local key = redis.call('GET', revKey)
if not key then
  return 0
end
local val = redis.call('GET', key)
if val == token then
  redis.call('DEL', key)
  redis.call('DEL', revKey)
  return 1
else
  return 0
end
`;

// Read-only version of the release check: true iff the token still owns a
// live hold (not yet released, not yet expired).
export const ASSERT_SCRIPT = `
local revKey = KEYS[1]
local token = ARGV[1]
local key = redis.call('GET', revKey)
if not key then
  return 0
end
local val = redis.call('GET', key)
if val == token then
  return 1
else
  return 0
end
`;

// Like ASSERT_SCRIPT, but additionally requires the token's forward key
// (looked up via the reverse index, same as release/assertHeld) to be
// EXACTLY the caller-supplied expected key (KEYS[2], built from the same
// key()/rangeToken() serialization). This is what makes assertHeldFor bind
// the token to a specific staff+slot rather than merely proving "some live
// hold exists for this token" — a token minted for staff X / slot A must not
// pass an assertion for staff Y / slot B, even while still live.
export const ASSERT_FOR_SCRIPT = `
local revKey = KEYS[1]
local expectedKey = KEYS[2]
local token = ARGV[1]
local key = redis.call('GET', revKey)
if not key then
  return 0
end
if key ~= expectedKey then
  return 0
end
local val = redis.call('GET', key)
if val == token then
  return 1
else
  return 0
end
`;

// Redis-backed slot hold: a short-TTL mutex on one staff member's exact time
// range, taken while a customer is completing checkout for a booking. Task 5
// (booking creation) calls `assertHeld` right before persisting the booking,
// then releases the hold once the booking row exists (or on checkout
// abandonment). Unlike AvailabilityCache this is NOT cache-aside — a hold is
// the source of truth for "is this slot spoken for right now", so a Redis
// outage fails loud (ServiceUnavailableError) rather than degrading silently.
export class BookingHoldService {
  private lazyClient: RedisLike | null = null;
  private connectAttempted = false;
  private readonly injected: boolean;

  // Pass a client (or explicit null) in tests; omit in production to lazily
  // connect the real Redis client (same host/port/password as
  // AvailabilityCache, see availability-cache.ts).
  constructor(
    client?: RedisLike | null,
    private readonly ttlSeconds: number = HOLD_TTL_SECONDS,
  ) {
    this.injected = client !== undefined;
    this.lazyClient = client ?? null;
  }

  key(staffId: string, range: SlotRange): string {
    return `hold:${staffId}:${rangeToken(range)}`;
  }

  private reverseKey(token: string): string {
    return `holdrev:${token}`;
  }

  private async getRedis(): Promise<RedisLike | null> {
    if (this.injected) return this.lazyClient;
    if (this.lazyClient) return this.lazyClient;
    if (this.connectAttempted) return null;
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
      // Dropping the client here is safe — holds fail loud via requireRedis().
      client.on("error", () => {
        this.lazyClient = null;
      });
      await client.connect();
      this.lazyClient = client as unknown as RedisLike;
      return this.lazyClient;
    } catch {
      this.lazyClient = null;
      return null;
    }
  }

  private async requireRedis(): Promise<RedisLike> {
    const redis = await this.getRedis();
    if (!redis) {
      throw new ServiceUnavailableError("Redis is unavailable — cannot manage slot holds");
    }
    return redis;
  }

  // Atomically place a hold on staffId/slotRange. Returns a token on success;
  // returns null if the slot is already held by someone else (the caller
  // decides what to do — e.g. surface "slot no longer available").
  async hold(staffId: string, slotRange: SlotRange): Promise<string | null> {
    const redis = await this.requireRedis();
    const token = crypto.randomUUID();
    const result = await redis.eval(HOLD_SCRIPT, {
      keys: [this.key(staffId, slotRange), this.reverseKey(token)],
      arguments: [token, String(this.ttlSeconds)],
    });
    return result === 1 ? token : null;
  }

  // Free a hold, but only if `token` is the one currently holding it. Returns
  // true if it released a hold, false if there was nothing to release (wrong
  // token, already released, or expired).
  async release(token: string): Promise<boolean> {
    const redis = await this.requireRedis();
    const result = await redis.eval(RELEASE_SCRIPT, {
      keys: [this.reverseKey(token)],
      arguments: [token],
    });
    return result === 1;
  }

  // Verify a hold is still live for this token. Throws ConflictError (409) if
  // it has been released or has expired — callers (booking creation) treat
  // this as "the slot may no longer be free, re-check availability".
  //
  // NOTE: this only proves *some* live hold exists for the token — it does
  // NOT check which staff/slot it was taken against. Prefer assertHeldFor
  // wherever the staff member + slot being booked is known (i.e. booking
  // creation) so a token minted for a different staff/slot can't be reused.
  async assertHeld(token: string): Promise<void> {
    const redis = await this.requireRedis();
    const result = await redis.eval(ASSERT_SCRIPT, {
      keys: [this.reverseKey(token)],
      arguments: [token],
    });
    if (result !== 1) {
      throw new ConflictError("Hold is no longer active — it was released or has expired");
    }
  }

  // Verify a hold is still live for this token AND that it was taken for
  // exactly this staffId + slot range (reconstructed via the same key()
  // serialization `hold()` used to write it). Throws ConflictError (409) if
  // the hold is gone, expired, or bound to a different staff/slot — this is
  // the check booking creation must use so a live hold on staff X / slot A
  // can never be presented to book staff Y / slot B.
  async assertHeldFor(token: string, staffId: string, range: SlotRange): Promise<void> {
    const redis = await this.requireRedis();
    const result = await redis.eval(ASSERT_FOR_SCRIPT, {
      keys: [this.reverseKey(token), this.key(staffId, range)],
      arguments: [token],
    });
    if (result !== 1) {
      throw new ConflictError(
        "Hold is no longer active, or does not match the staff member/time slot being booked",
      );
    }
  }
}
