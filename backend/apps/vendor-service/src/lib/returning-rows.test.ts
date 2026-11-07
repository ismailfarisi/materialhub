import { describe, expect, test } from "bun:test";
import { returningRows } from "./returning-rows.ts";

describe("returningRows", () => {
  test("UPDATE ... RETURNING shape [rows, count]", () => {
    expect(returningRows([[{ user_id: "u1" }], 1])).toEqual([{ user_id: "u1" }]);
    expect(returningRows([[], 0])).toEqual([]);
  });

  test("plain rows (SELECT / INSERT ... RETURNING)", () => {
    expect(returningRows([{ id: "a" }, { id: "b" }])).toEqual([{ id: "a" }, { id: "b" }]);
  });

  test("anything else is no rows", () => {
    expect(returningRows(undefined)).toEqual([]);
  });
});
