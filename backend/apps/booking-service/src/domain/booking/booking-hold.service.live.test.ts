// Live Redis integration test (BOOKING_LIVE_DB=1). Mirrors the live-gate
// pattern used across the codebase (REELS_LIVE_DB in
// apps/reels-service/tests/integration/*, BOOKING_LIVE_DB in
// order-service's internal-booking-payment.integration.test.ts): boots a real
// `redis` client against docker-compose's redis service and exercises the
// hold/release/assertHeld contract against actual Redis atomicity + TTL
// behavior, which an in-memory fake (booking-hold.service.test.ts) can only
// approximate. Cleans up every key it creates.
import { afterAll, describe, expect, it } from "bun:test";
import { config } from "@materialhub/config";
import { ConflictError } from "@materialhub/plugins";
import { type RedisClientType, createClient } from "redis";
import { BookingHoldService, type RedisLike, type SlotRange } from "./booking-hold.service.ts";

const LIVE_DB = process.env.BOOKING_LIVE_DB === "1";
const describeLive = LIVE_DB ? describe : describe.skip;

describeLive("BookingHoldService (live Redis)", () => {
  const client: RedisClientType = createClient({
    socket: { host: config.redis.host, port: config.redis.port },
    password: config.redis.password,
  });
  const connected = client.connect();
  const cleanupKeys = new Set<string>();

  afterAll(async () => {
    await connected;
    if (cleanupKeys.size > 0) await client.del(Array.from(cleanupKeys));
    await client.quit();
  });

  async function service(): Promise<BookingHoldService> {
    await connected;
    return new BookingHoldService(client as unknown as RedisLike);
  }

  function uniqueRange(): SlotRange {
    // Unique per test run so parallel/repeated runs never collide on a
    // leftover key from a prior run.
    const base = Date.now() + Math.floor(Math.random() * 1_000_000);
    return { start: new Date(base * 1000), end: new Date((base + 1800) * 1000) };
  }

  it("a second hold on the same staff+range fails while the first is held", async () => {
    const svc = await service();
    const staffId = "live-staff-1";
    const range = uniqueRange();
    cleanupKeys.add(svc.key(staffId, range));

    const first = await svc.hold(staffId, range);
    expect(first).not.toBeNull();
    if (first) cleanupKeys.add(`holdrev:${first}`);

    const second = await svc.hold(staffId, range);
    expect(second).toBeNull();
  });

  it("release() with the correct token frees the hold, and a subsequent hold then succeeds", async () => {
    const svc = await service();
    const staffId = "live-staff-2";
    const range = uniqueRange();
    cleanupKeys.add(svc.key(staffId, range));

    const token = await svc.hold(staffId, range);
    expect(token).not.toBeNull();

    const released = await svc.release(token as string);
    expect(released).toBe(true);

    const again = await svc.hold(staffId, range);
    expect(again).not.toBeNull();
    if (again) cleanupKeys.add(`holdrev:${again}`);
  });

  it("release() with a wrong token does not free someone else's hold", async () => {
    const svc = await service();
    const staffId = "live-staff-3";
    const range = uniqueRange();
    cleanupKeys.add(svc.key(staffId, range));

    const token = await svc.hold(staffId, range);
    expect(token).not.toBeNull();
    if (token) cleanupKeys.add(`holdrev:${token}`);

    const releasedWrong = await svc.release("definitely-not-the-token");
    expect(releasedWrong).toBe(false);

    // Still held — a second hold attempt still fails.
    const second = await svc.hold(staffId, range);
    expect(second).toBeNull();
  });

  it("the forward key carries a TTL close to 600s after hold()", async () => {
    const svc = await service();
    const staffId = "live-staff-4";
    const range = uniqueRange();
    const key = svc.key(staffId, range);
    cleanupKeys.add(key);

    const token = await svc.hold(staffId, range);
    expect(token).not.toBeNull();
    if (token) cleanupKeys.add(`holdrev:${token}`);

    const ttl = await client.ttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(600);
    expect(ttl).toBeGreaterThan(590); // just-set, so should be ~600
  });

  // NOTE: this suite awaits BookingHoldService calls directly and asserts on
  // the resolved/thrown value with plain try/catch, rather than
  // `expect(promise).resolves/.rejects` — that matcher was found to hang
  // indefinitely (repro'd in isolation) whenever the promise chain touches a
  // real (non-mocked) `redis` client socket under bun:test, even though the
  // same matcher works fine against the in-memory fake in
  // booking-hold.service.test.ts. Direct await + try/catch is unaffected and
  // is what's used throughout this file.
  it("assertHeld() passes for a live hold and throws once released", async () => {
    const svc = await service();
    const staffId = "live-staff-5";
    const range = uniqueRange();
    cleanupKeys.add(svc.key(staffId, range));

    const token = await svc.hold(staffId, range);
    expect(token).not.toBeNull();
    const t = token as string;

    await svc.assertHeld(t); // must not throw

    await svc.release(t);

    let threw: unknown;
    try {
      await svc.assertHeld(t);
    } catch (err) {
      threw = err;
    }
    expect(threw).toBeInstanceOf(ConflictError);
  });

  it("assertHeldFor() passes for the exact staff+range and throws for a different staff or range", async () => {
    const svc = await service();
    const staffId = "live-staff-7";
    const range = uniqueRange();
    cleanupKeys.add(svc.key(staffId, range));

    const token = await svc.hold(staffId, range);
    expect(token).not.toBeNull();
    const t = token as string;

    await svc.assertHeldFor(t, staffId, range); // must not throw — exact match

    let threwWrongStaff: unknown;
    try {
      await svc.assertHeldFor(t, "live-staff-7-imposter", range);
    } catch (err) {
      threwWrongStaff = err;
    }
    expect(threwWrongStaff).toBeInstanceOf(ConflictError);

    const otherRange = uniqueRange();
    let threwWrongRange: unknown;
    try {
      await svc.assertHeldFor(t, staffId, otherRange);
    } catch (err) {
      threwWrongRange = err;
    }
    expect(threwWrongRange).toBeInstanceOf(ConflictError);
  });

  it("assertHeld() throws once the hold has actually expired (short TTL)", async () => {
    const staffId = "live-staff-6";
    const range = uniqueRange();
    const shortLived = new BookingHoldService(client as unknown as RedisLike, 1);
    const key = shortLived.key(staffId, range);
    cleanupKeys.add(key);

    const token = await shortLived.hold(staffId, range);
    expect(token).not.toBeNull();
    const t = token as string;

    await new Promise((resolve) => setTimeout(resolve, 1500));

    let threw: unknown;
    try {
      await shortLived.assertHeld(t);
    } catch (err) {
      threw = err;
    }
    expect(threw).toBeInstanceOf(ConflictError);
  });
});
