import { describe, expect, test } from "bun:test";
import { VENDOR_TRANSITIONS, isValidTransition } from "./types.ts";

describe("vendor status state machine", () => {
  test("pending -> under_review is valid", () => {
    expect(isValidTransition("pending", "under_review")).toBe(true);
  });
  test("under_review -> approved is valid", () => {
    expect(isValidTransition("under_review", "approved")).toBe(true);
  });
  test("under_review -> rejected is valid", () => {
    expect(isValidTransition("under_review", "rejected")).toBe(true);
  });
  test("rejected -> pending is valid (re-apply)", () => {
    expect(isValidTransition("rejected", "pending")).toBe(true);
  });
  test("approved -> suspended is valid", () => {
    expect(isValidTransition("approved", "suspended")).toBe(true);
  });
  test("suspended -> approved is valid (reactivation)", () => {
    expect(isValidTransition("suspended", "approved")).toBe(true);
  });
  test("approved -> deactivated is valid", () => {
    expect(isValidTransition("approved", "deactivated")).toBe(true);
  });
  test("pending -> approved is INVALID", () => {
    expect(isValidTransition("pending", "approved")).toBe(false);
  });
  test("deactivated -> approved is INVALID", () => {
    expect(isValidTransition("deactivated", "approved")).toBe(false);
  });
  test("deactivated has no valid transitions", () => {
    expect(VENDOR_TRANSITIONS.deactivated).toEqual([]);
  });
});
