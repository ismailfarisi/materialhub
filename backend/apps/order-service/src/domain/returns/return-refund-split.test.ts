import { describe, expect, test } from "bun:test";
import { splitRefundAcrossLines } from "./return-refund-split.ts";

describe("splitRefundAcrossLines", () => {
  test("pro rata by line value, remainder on the last line", () => {
    // 2 sheets of kraft liner (1,000) and 1 roll of book cloth (2,000).
    expect(splitRefundAcrossLines(3000, [{ value: 1000 }, { value: 2000 }])).toEqual([1000, 2000]);
    expect(splitRefundAcrossLines(1000, [{ value: 1 }, { value: 1 }, { value: 1 }])).toEqual([
      333, 333, 334,
    ]);
  });

  test("a reduced refund is still shared by value and sums exactly", () => {
    const shares = splitRefundAcrossLines(4999, [{ value: 4500 }, { value: 500 }, { value: 1234 }]);
    expect(shares.reduce((s, x) => s + x, 0)).toBe(4999);
    expect(shares.every(Number.isInteger)).toBe(true);
  });

  test("no value to weigh by: even split", () => {
    expect(splitRefundAcrossLines(101, [{ value: 0 }, { value: 0 }])).toEqual([50, 51]);
  });

  test("edge cases", () => {
    expect(splitRefundAcrossLines(500, [])).toEqual([]);
    expect(splitRefundAcrossLines(500, [{ value: 10 }])).toEqual([500]);
    expect(splitRefundAcrossLines(0, [{ value: 10 }, { value: 5 }])).toEqual([0, 0]);
  });
});
