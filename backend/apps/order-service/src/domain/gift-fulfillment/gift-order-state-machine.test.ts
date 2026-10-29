import { describe, expect, test } from "bun:test";
import { GiftFulfillmentStatus } from "@materialhub/database";
import { assertGiftTransition, canGiftTransition } from "./gift-order-state-machine.ts";

const S = GiftFulfillmentStatus;

describe("gift-order state machine", () => {
  test("awaiting_items → partially_received is allowed", () => {
    expect(canGiftTransition(S.awaiting_items, S.partially_received)).toBe(true);
  });
  test("ready_to_assemble → packed is allowed", () => {
    expect(canGiftTransition(S.ready_to_assemble, S.packed)).toBe(true);
  });
  test("packed → shipped → delivered is allowed", () => {
    expect(canGiftTransition(S.packed, S.shipped)).toBe(true);
    expect(canGiftTransition(S.shipped, S.delivered)).toBe(true);
  });
  test("awaiting_items → shipped is NOT allowed", () => {
    expect(canGiftTransition(S.awaiting_items, S.shipped)).toBe(false);
    expect(() => assertGiftTransition(S.awaiting_items, S.shipped)).toThrow(/transition/i);
  });
  test("any active state → cancelled is allowed", () => {
    expect(canGiftTransition(S.ready_to_assemble, S.cancelled)).toBe(true);
  });
  test("delivered is terminal", () => {
    expect(canGiftTransition(S.delivered, S.shipped)).toBe(false);
  });
  test("partially_received can stay partially_received (another parcel, not all in)", () => {
    expect(canGiftTransition(S.partially_received, S.partially_received)).toBe(true);
  });
});
