import { describe, expect, it } from "bun:test";
import { ConflictError, ServiceUnavailableError } from "@materialhub/plugins";
import {
  ASSERT_FOR_SCRIPT,
  ASSERT_SCRIPT,
  BookingHoldService,
  HOLD_SCRIPT,
  RELEASE_SCRIPT,
  type RedisLike,
  type SlotRange,
} from "./booking-hold.service.ts";

// In-memory fake that understands the three named scripts by identity (===
// against the exported constants) and reproduces their exact semantics —
// lets the hold/release/assertHeld contract be unit-tested without a live
// Redis server, mirroring the fakeRedis() approach in availability-cache.test.ts.
// TTLs are tracked but not actually expired here; expiry behavior is only
// verifiable against a real server (see booking-hold.service.live.test.ts).
function fakeRedis() {
  const store = new Map<string, string>();
  const ttls = new Map<string, number>();

  const client: RedisLike & { store: Map<string, string> } = {
    store,
    async eval(script, opts) {
      if (script === HOLD_SCRIPT) {
        const [key, revKey] = opts.keys;
        const [token, ttl] = opts.arguments;
        if (key === undefined || revKey === undefined) throw new Error("missing keys");
        if (store.has(key)) return 0;
        store.set(key, token as string);
        ttls.set(key, Number(ttl));
        store.set(revKey, key);
        ttls.set(revKey, Number(ttl));
        return 1;
      }
      if (script === RELEASE_SCRIPT) {
        const [revKey] = opts.keys;
        const [token] = opts.arguments;
        if (revKey === undefined) throw new Error("missing key");
        const key = store.get(revKey);
        if (!key) return 0;
        if (store.get(key) !== token) return 0;
        store.delete(key);
        store.delete(revKey);
        ttls.delete(key);
        ttls.delete(revKey);
        return 1;
      }
      if (script === ASSERT_SCRIPT) {
        const [revKey] = opts.keys;
        const [token] = opts.arguments;
        if (revKey === undefined) throw new Error("missing key");
        const key = store.get(revKey);
        if (!key) return 0;
        return store.get(key) === token ? 1 : 0;
      }
      if (script === ASSERT_FOR_SCRIPT) {
        const [revKey, expectedKey] = opts.keys;
        const [token] = opts.arguments;
        if (revKey === undefined || expectedKey === undefined) throw new Error("missing keys");
        const key = store.get(revKey);
        if (!key) return 0;
        if (key !== expectedKey) return 0;
        return store.get(key) === token ? 1 : 0;
      }
      throw new Error("unrecognized script");
    },
  };
  return client;
}

const range: SlotRange = {
  start: new Date("2026-07-10T09:00:00Z"),
  end: new Date("2026-07-10T09:30:00Z"),
};

describe("BookingHoldService", () => {
  it("keys are stable per staff+range and epoch-seconds based", () => {
    const service = new BookingHoldService(fakeRedis());
    const startSec = Math.floor(range.start.getTime() / 1000);
    const endSec = Math.floor(range.end.getTime() / 1000);
    expect(service.key("staff-1", range)).toBe(`hold:staff-1:${startSec}-${endSec}`);
    // Same instant, different Date object identity — key must match.
    const sameRange: SlotRange = {
      start: new Date(range.start.getTime()),
      end: new Date(range.end.getTime()),
    };
    expect(service.key("staff-1", sameRange)).toBe(service.key("staff-1", range));
  });

  it("hold() returns a token on first call", async () => {
    const service = new BookingHoldService(fakeRedis());
    const token = await service.hold("staff-1", range);
    expect(token).not.toBeNull();
    expect(typeof token).toBe("string");
  });

  it("a second hold() on the same staff+range fails while the first is held", async () => {
    const service = new BookingHoldService(fakeRedis());
    const first = await service.hold("staff-1", range);
    expect(first).not.toBeNull();
    const second = await service.hold("staff-1", range);
    expect(second).toBeNull();
  });

  it("a hold on a different staff or a different range does not collide", async () => {
    const redis = fakeRedis();
    const service = new BookingHoldService(redis);
    const first = await service.hold("staff-1", range);
    expect(first).not.toBeNull();

    const otherStaff = await service.hold("staff-2", range);
    expect(otherStaff).not.toBeNull();

    const otherRange: SlotRange = {
      start: new Date("2026-07-10T10:00:00Z"),
      end: new Date("2026-07-10T10:30:00Z"),
    };
    const otherTime = await service.hold("staff-1", otherRange);
    expect(otherTime).not.toBeNull();
  });

  it("release() with the correct token frees the hold, allowing a subsequent hold to succeed", async () => {
    const service = new BookingHoldService(fakeRedis());
    const token = await service.hold("staff-1", range);
    expect(token).not.toBeNull();

    const released = await service.release(token as string);
    expect(released).toBe(true);

    const again = await service.hold("staff-1", range);
    expect(again).not.toBeNull();
  });

  it("release() with a wrong token does not free someone else's hold", async () => {
    const service = new BookingHoldService(fakeRedis());
    const token = await service.hold("staff-1", range);
    expect(token).not.toBeNull();

    const releasedWrong = await service.release("not-the-real-token");
    expect(releasedWrong).toBe(false);

    // The original hold must still be in effect — a second hold still fails.
    const second = await service.hold("staff-1", range);
    expect(second).toBeNull();

    // And the real token can still release it.
    const releasedRight = await service.release(token as string);
    expect(releasedRight).toBe(true);
  });

  it("assertHeld() passes for a live hold", async () => {
    const service = new BookingHoldService(fakeRedis());
    const token = await service.hold("staff-1", range);
    await expect(service.assertHeld(token as string)).resolves.toBeUndefined();
  });

  it("assertHeld() throws ConflictError once the hold has been released", async () => {
    const service = new BookingHoldService(fakeRedis());
    const token = await service.hold("staff-1", range);
    await service.release(token as string);
    await expect(service.assertHeld(token as string)).rejects.toBeInstanceOf(ConflictError);
  });

  it("assertHeld() throws ConflictError for a token that was never issued", async () => {
    const service = new BookingHoldService(fakeRedis());
    await expect(service.assertHeld("bogus-token")).rejects.toBeInstanceOf(ConflictError);
  });

  it("assertHeldFor() passes when the token matches the exact staff+range it was issued for", async () => {
    const service = new BookingHoldService(fakeRedis());
    const token = await service.hold("staff-1", range);
    await expect(service.assertHeldFor(token as string, "staff-1", range)).resolves.toBeUndefined();
  });

  it("assertHeldFor() throws ConflictError when the staff member differs from the one the token was issued for", async () => {
    const service = new BookingHoldService(fakeRedis());
    const token = await service.hold("staff-1", range);
    await expect(service.assertHeldFor(token as string, "staff-2", range)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("assertHeldFor() throws ConflictError when the slot range differs from the one the token was issued for", async () => {
    const service = new BookingHoldService(fakeRedis());
    const token = await service.hold("staff-1", range);
    const otherRange: SlotRange = {
      start: new Date("2026-07-10T10:00:00Z"),
      end: new Date("2026-07-10T10:30:00Z"),
    };
    await expect(
      service.assertHeldFor(token as string, "staff-1", otherRange),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("assertHeldFor() throws ConflictError once the hold has been released, even for the matching staff+range", async () => {
    const service = new BookingHoldService(fakeRedis());
    const token = await service.hold("staff-1", range);
    await service.release(token as string);
    await expect(service.assertHeldFor(token as string, "staff-1", range)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("throws ServiceUnavailableError instead of silently degrading when Redis is unreachable", async () => {
    const service = new BookingHoldService(null);
    await expect(service.hold("staff-1", range)).rejects.toBeInstanceOf(ServiceUnavailableError);
  });
});
