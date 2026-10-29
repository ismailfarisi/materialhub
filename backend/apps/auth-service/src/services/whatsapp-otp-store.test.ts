import { describe, expect, it } from "bun:test";
import { createMemoryOtpKv, createWhatsAppOtpStore } from "./whatsapp-otp-store.ts";

const PHONE = "+971501234567";

function buildStore() {
  let t = 1_000_000;
  const clock = {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
  const kv = createMemoryOtpKv(clock.now);
  const store = createWhatsAppOtpStore(kv);
  return { store, clock };
}

describe("WhatsAppOtpStore", () => {
  it("issues a 6-digit code that then verifies", async () => {
    const { store } = buildStore();
    const code = await store.issue(PHONE);

    expect(code).toMatch(/^\d{6}$/);
    expect(await store.verify(PHONE, code)).toBe(true);
  });

  it("rejects a wrong code", async () => {
    const { store } = buildStore();
    const code = await store.issue(PHONE);
    const wrong = code === "000000" ? "000001" : "000000";

    expect(await store.verify(PHONE, wrong)).toBe(false);
    // The right code still works after a wrong attempt.
    expect(await store.verify(PHONE, code)).toBe(true);
  });

  it("codes are single-use", async () => {
    const { store } = buildStore();
    const code = await store.issue(PHONE);

    expect(await store.verify(PHONE, code)).toBe(true);
    expect(await store.verify(PHONE, code)).toBe(false);
  });

  it("expires codes after the TTL", async () => {
    const { store, clock } = buildStore();
    const code = await store.issue(PHONE);

    clock.advance(301 * 1000);
    expect(await store.verify(PHONE, code)).toBe(false);
  });

  it("caps attempts at 5, then invalidates the code entirely", async () => {
    const { store } = buildStore();
    const code = await store.issue(PHONE);
    const wrong = code === "000000" ? "000001" : "000000";

    for (let i = 0; i < 5; i++) {
      expect(await store.verify(PHONE, wrong)).toBe(false);
    }
    // 6th attempt — even the RIGHT code is dead now.
    expect(await store.verify(PHONE, code)).toBe(false);
  });

  it("a re-issued code replaces the old one and resets attempts", async () => {
    const { store } = buildStore();
    const first = await store.issue(PHONE);
    const second = await store.issue(PHONE);

    if (first !== second) {
      expect(await store.verify(PHONE, first)).toBe(false);
      // first-code attempt above consumed 1 of 5 attempts; second still verifies
      expect(await store.verify(PHONE, second)).toBe(true);
    } else {
      expect(await store.verify(PHONE, second)).toBe(true);
    }
  });

  it("verify against a phone with no issued code returns false", async () => {
    const { store } = buildStore();
    expect(await store.verify("+971509999999", "123456")).toBe(false);
  });
});
