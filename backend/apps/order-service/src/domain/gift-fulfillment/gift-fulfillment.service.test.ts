import { describe, expect, test } from "bun:test";
import { GiftFulfillmentStatus } from "@materialhub/database";
import { recomputeAfterReceipt } from "./gift-fulfillment.service.ts";

const S = GiftFulfillmentStatus;

describe("recomputeAfterReceipt", () => {
  test("not all received → partially_received", () => {
    expect(recomputeAfterReceipt(2, 1)).toBe(S.partially_received);
  });
  test("all received → ready_to_assemble", () => {
    expect(recomputeAfterReceipt(2, 2)).toBe(S.ready_to_assemble);
    expect(recomputeAfterReceipt(3, 3)).toBe(S.ready_to_assemble);
  });
});
