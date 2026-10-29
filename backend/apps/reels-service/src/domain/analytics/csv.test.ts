import { describe, expect, it } from "bun:test";
import { leaderboardToCsv } from "./csv.ts";

describe("leaderboardToCsv", () => {
  it("writes header + rows, escapes commas and quotes, formats fils→AED", () => {
    const csv = leaderboardToCsv(
      ["id", "label", "value", "orders"],
      [
        { id: "a", label: "Simple", value: 12345, orders: 2 },
        { id: "b", label: "With, comma", value: 0, orders: 0 },
        { id: "c", label: 'With "quote"', value: 99, orders: 1 },
      ],
      { currencyColumns: new Set(["value"]) },
    );
    const lines = csv.split("\n");
    expect(lines[0]).toBe("id,label,value,orders");
    expect(lines[1]).toBe("a,Simple,AED 123.45,2");
    expect(lines[2]).toBe('b,"With, comma",AED 0.00,0');
    expect(lines[3]).toBe('c,"With ""quote""",AED 0.99,1');
  });

  it("emits header-only when rows are empty", () => {
    const csv = leaderboardToCsv(["id", "value"], [], {
      currencyColumns: new Set(["value"]),
    });
    expect(csv).toBe("id,value");
  });
});
