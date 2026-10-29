import { describe, expect, test } from "bun:test";
import { assertCapacity } from "./gift-box.service.ts";

describe("assertCapacity", () => {
  test("passes when sum of quantities <= capacity", () => {
    expect(() => assertCapacity([{ quantity: 2 }, { quantity: 1 }], 3)).not.toThrow();
  });
  test("throws when over capacity", () => {
    expect(() => assertCapacity([{ quantity: 2 }, { quantity: 2 }], 3)).toThrow(/capacity/i);
  });
});
