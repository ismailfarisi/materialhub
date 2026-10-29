import { describe, expect, test } from "bun:test";

function cartesianProduct<T>(arrays: T[][]): T[][] {
  return arrays.reduce<T[][]>(
    (acc, arr) => acc.flatMap((combo) => arr.map((item) => [...combo, item])),
    [[]],
  );
}

function sortOptionValues(obj: Record<string, string>): Record<string, string> {
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = obj[key] ?? "";
  }
  return sorted;
}

describe("variant generation", () => {
  test("2x2 cartesian product gives 4 combinations", () => {
    const result = cartesianProduct([
      ["red", "blue"],
      ["S", "M"],
    ]);
    expect(result).toHaveLength(4);
    expect(result).toContainEqual(["red", "S"]);
    expect(result).toContainEqual(["red", "M"]);
    expect(result).toContainEqual(["blue", "S"]);
    expect(result).toContainEqual(["blue", "M"]);
  });

  test("single attribute gives flat list", () => {
    const result = cartesianProduct([["S", "M", "L"]]);
    expect(result).toHaveLength(3);
  });

  test("3x3 gives 9 combinations", () => {
    const result = cartesianProduct([
      ["A", "B", "C"],
      ["1", "2", "3"],
    ]);
    expect(result).toHaveLength(9);
  });

  test("empty array gives single empty combo", () => {
    const result = cartesianProduct([]);
    expect(result).toEqual([[]]);
  });

  test("sortOptionValues sorts keys alphabetically", () => {
    const sorted = sortOptionValues({ size: "M", color: "red" });
    expect(Object.keys(sorted)).toEqual(["color", "size"]);
  });

  test("sortOptionValues deterministic for matching check", () => {
    const a = JSON.stringify(sortOptionValues({ size: "M", color: "red" }));
    const b = JSON.stringify(sortOptionValues({ color: "red", size: "M" }));
    expect(a).toBe(b);
  });
});
