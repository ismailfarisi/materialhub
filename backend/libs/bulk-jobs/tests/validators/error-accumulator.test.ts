import { describe, expect, test } from "bun:test";
import { ErrorAccumulator } from "../../src/validators/error-accumulator.ts";

describe("ErrorAccumulator", () => {
  test("collects errors per-row", () => {
    const acc = new ErrorAccumulator();
    acc.push({
      rowNumber: 1,
      sheetName: null,
      errorCode: "x",
      errorMessage: "y",
      field: null,
      rowSnapshot: {},
    });
    acc.push({
      rowNumber: 2,
      sheetName: null,
      errorCode: "a",
      errorMessage: "b",
      field: null,
      rowSnapshot: {},
    });
    expect(acc.count()).toBe(2);
    expect(acc.rowsWithErrors()).toEqual(new Set([1, 2]));
  });

  test("list returns all errors in insertion order", () => {
    const acc = new ErrorAccumulator();
    acc.push({
      rowNumber: 5,
      sheetName: null,
      errorCode: "a",
      errorMessage: "",
      field: null,
      rowSnapshot: {},
    });
    acc.push({
      rowNumber: 1,
      sheetName: null,
      errorCode: "b",
      errorMessage: "",
      field: null,
      rowSnapshot: {},
    });
    const list = acc.list();
    expect(list[0].rowNumber).toBe(5);
    expect(list[1].rowNumber).toBe(1);
  });

  test("hasAny is false when empty", () => {
    expect(new ErrorAccumulator().hasAny()).toBe(false);
  });
});
