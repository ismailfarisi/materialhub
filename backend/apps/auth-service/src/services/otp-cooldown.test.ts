import { afterAll, describe, expect, test } from "bun:test";
import {
  type OtpCooldownStore,
  createMemoryOtpCooldownStore,
  createOtpCooldown,
  stopCleanupTimer,
} from "./otp-cooldown.ts";

afterAll(() => {
  stopCleanupTimer();
});

function makeStore(counts: Record<string, number>, ttls: Record<string, number> = {}) {
  const store: OtpCooldownStore = {
    hit: async (key) => {
      counts[key] = (counts[key] ?? 0) + 1;
      return { count: counts[key], ttl: ttls[key] ?? 30 };
    },
    undo: async (key) => {
      if (counts[key] === undefined) return;
      counts[key] = Math.max(0, counts[key] - 1);
    },
  };
  return store;
}

describe("otp cooldown", () => {
  test("allows the first send", async () => {
    const cooldown = createOtpCooldown(makeStore({}));
    await cooldown.check("u1", "+971501234567"); // must not throw
  });

  test("throws 429 OTP_RATE_LIMITED on a resend inside the 60s window", async () => {
    // A pre-existing key means a send already happened in the window.
    const counts = { "otp:cd:u1:+971501234567": 1 };
    const cooldown = createOtpCooldown(makeStore(counts, { "otp:cd:u1:+971501234567": 42 }));
    const err = await cooldown.check("u1", "+971501234567").catch((e) => e);
    expect(err.statusCode).toBe(429);
    expect(err.code).toBe("OTP_RATE_LIMITED");
    expect(err.details?.retry_after_seconds).toBe(42);
  });

  test("throws 429 once the hourly cap is exhausted", async () => {
    const counts = { "otp:hr:u1": 5 };
    const cooldown = createOtpCooldown(makeStore(counts, { "otp:hr:u1": 900 }));
    const err = await cooldown.check("u1", "+971509999999").catch((e) => e);
    expect(err.statusCode).toBe(429);
    expect(err.code).toBe("OTP_RATE_LIMITED");
  });

  test("counts the hourly cap per user, not per number", async () => {
    const counts: Record<string, number> = {};
    const cooldown = createOtpCooldown(makeStore(counts));
    await cooldown.check("u1", "+971501111111");
    await cooldown.check("u1", "+971502222222");
    expect(counts["otp:hr:u1"]).toBe(2);
  });

  test("refund gives back the hourly slot", async () => {
    const counts: Record<string, number> = {};
    const cooldown = createOtpCooldown(makeStore(counts));
    await cooldown.check("u1", "+971501111111");
    expect(counts["otp:hr:u1"]).toBe(1);
    await cooldown.refund("u1");
    expect(counts["otp:hr:u1"]).toBe(0);
  });

  test("refund leaves the per-number cooldown intact", async () => {
    // A send can fail *after* Twilio dispatched, so the 60s window must stand
    // or an instant retry could double-send to the same number.
    const counts: Record<string, number> = {};
    const cooldown = createOtpCooldown(makeStore(counts));
    await cooldown.check("u1", "+971501111111");
    await cooldown.refund("u1");
    expect(counts["otp:cd:u1:+971501111111"]).toBe(1);
  });

  test("repeated failed sends never exhaust the hourly cap", async () => {
    // The regression: check() spends the budget before the SMS is attempted,
    // so five failures in a row locked the user out for an hour with zero SMS.
    const counts: Record<string, number> = {};
    const cooldown = createOtpCooldown(makeStore(counts));
    for (let i = 0; i < 8; i++) {
      // Each attempt targets a different number so only the hourly cap is in
      // play, mimicking a user retrying against a failing provider.
      await cooldown.check("u1", `+97150000000${i}`);
      await cooldown.refund("u1");
    }
    expect(counts["otp:hr:u1"]).toBe(0);
    // A real send afterwards still gets through.
    await cooldown.check("u1", "+971509999999");
    expect(counts["otp:hr:u1"]).toBe(1);
  });
});

describe("memoryOtpCooldownStore (production fallback)", () => {
  test("allows the first call", async () => {
    const store = createMemoryOtpCooldownStore();
    const result = await store.hit("k1", 60);
    expect(result.count).toBe(1);
  });

  test("rejects a resend inside the window when wired through createOtpCooldown", async () => {
    let now = 1_000_000;
    const store = createMemoryOtpCooldownStore(() => now);
    const cooldown = createOtpCooldown(store);

    await cooldown.check("u1", "+971501234567"); // first send: allowed

    now += 5_000; // still well inside the 60s cooldown
    const err = await cooldown.check("u1", "+971501234567").catch((e) => e);
    expect(err.statusCode).toBe(429);
    expect(err.code).toBe("OTP_RATE_LIMITED");
    expect(err.details?.retry_after_seconds).toBeGreaterThan(0);
  });

  test("reports a sensible positive ttl", async () => {
    const store = createMemoryOtpCooldownStore();
    const first = await store.hit("k2", 60);
    expect(first.ttl).toBeGreaterThan(0);
    expect(first.ttl).toBeLessThanOrEqual(60);

    const second = await store.hit("k2", 60);
    expect(second.ttl).toBeGreaterThan(0);
    expect(second.ttl).toBeLessThanOrEqual(60);
  });

  test("resets the count once the window has fully elapsed", async () => {
    let now = 1_000_000;
    const store = createMemoryOtpCooldownStore(() => now);

    const first = await store.hit("k3", 60);
    expect(first.count).toBe(1);

    now += 61_000; // past the 60s window
    const second = await store.hit("k3", 60);
    expect(second.count).toBe(1);
    expect(second.ttl).toBe(60);
  });

  test("undo gives back one unit without extending the window", async () => {
    let now = 1_000_000;
    const store = createMemoryOtpCooldownStore(() => now);

    await store.hit("k4", 60);
    const second = await store.hit("k4", 60);
    expect(second.count).toBe(2);

    await store.undo("k4");
    now += 1_000;
    const third = await store.hit("k4", 60);
    expect(third.count).toBe(2); // back to 1, then this hit makes 2
    // The TTL still tracks the ORIGINAL window rather than restarting.
    expect(third.ttl).toBeLessThanOrEqual(59);
  });

  test("undo never drives a count below zero", async () => {
    const store = createMemoryOtpCooldownStore();
    await store.hit("k5", 60);
    await store.undo("k5");
    await store.undo("k5");
    await store.undo("k5");
    const next = await store.hit("k5", 60);
    expect(next.count).toBe(1);
  });

  test("undo on an unknown key is a no-op", async () => {
    const store = createMemoryOtpCooldownStore();
    await store.undo("never-seen"); // must not throw or create the key
    const next = await store.hit("never-seen", 60);
    expect(next.count).toBe(1);
  });

  test("undo on an expired key leaves the fresh window alone", async () => {
    let now = 1_000_000;
    const store = createMemoryOtpCooldownStore(() => now);

    await store.hit("k6", 60);
    now += 61_000; // the window this unit belonged to is over
    await store.undo("k6");

    const next = await store.hit("k6", 60);
    expect(next.count).toBe(1); // a fresh window, not -1 or 0
  });
});
