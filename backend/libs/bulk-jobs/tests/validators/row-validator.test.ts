import { describe, expect, test } from "bun:test";
import { Type } from "@sinclair/typebox";
import { ErrorAccumulator } from "../../src/validators/error-accumulator.ts";
import { validateRowSchema } from "../../src/validators/row-validator.ts";

const schema = Type.Object({
  sku: Type.String({ minLength: 1 }),
  quantity_on_hand: Type.Integer({ minimum: 0, maximum: 10_000_000 }),
});

function mkRow(v: Record<string, string>, n = 1) {
  return { rowNumber: n, sheetName: null, values: v };
}

describe("validateRowSchema", () => {
  test("accepts a valid row (with numeric coercion from string)", () => {
    const acc = new ErrorAccumulator();
    const ok = validateRowSchema(mkRow({ sku: "A", quantity_on_hand: "100" }), schema, acc);
    expect(ok).toBe(true);
    expect(acc.hasAny()).toBe(false);
  });

  test("rejects missing required field", () => {
    const acc = new ErrorAccumulator();
    const ok = validateRowSchema(mkRow({ quantity_on_hand: "100" }), schema, acc);
    expect(ok).toBe(false);
    expect(acc.count()).toBeGreaterThan(0);
    expect(acc.list().some((e) => e.field === "sku")).toBe(true);
  });

  test("rejects negative integer", () => {
    const acc = new ErrorAccumulator();
    const ok = validateRowSchema(mkRow({ sku: "A", quantity_on_hand: "-1" }), schema, acc);
    expect(ok).toBe(false);
    expect(acc.list().some((e) => e.field === "quantity_on_hand")).toBe(true);
  });

  test("rejects non-integer", () => {
    const acc = new ErrorAccumulator();
    validateRowSchema(mkRow({ sku: "A", quantity_on_hand: "3.5" }), schema, acc);
    expect(acc.list().some((e) => e.field === "quantity_on_hand")).toBe(true);
  });

  // Regression: Value.Convert mutates its input in place (TypeBox 0.34), so validating
  // against an integer/boolean field used to rewrite row.values[field] from a string into
  // a number/boolean. Downstream coerceRow implementations read row.values as strings
  // (the documented Record<string, string> contract) and call .trim() on them, so the
  // mutation crashed inventory-update and flash-deal-import with ".trim is not a function".
  test("does not mutate row.values (leaves cell values as strings)", () => {
    const acc = new ErrorAccumulator();
    const row = mkRow({ sku: "A", quantity_on_hand: "100" });
    validateRowSchema(row, schema, acc);
    expect(typeof row.values.quantity_on_hand).toBe("string");
    expect(row.values.quantity_on_hand).toBe("100");
  });

  test("does not mutate boolean-typed fields either", () => {
    const boolSchema = Type.Object({
      sku: Type.String({ minLength: 1 }),
      is_active: Type.Optional(Type.Boolean()),
    });
    const acc = new ErrorAccumulator();
    const row = mkRow({ sku: "A", is_active: "true" });
    validateRowSchema(row, boolSchema, acc);
    expect(typeof row.values.is_active).toBe("string");
    expect(row.values.is_active).toBe("true");
  });
});
