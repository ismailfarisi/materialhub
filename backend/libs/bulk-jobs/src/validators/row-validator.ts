import type { TObject, TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { BulkErrorCodes } from "../types/error-codes.ts";
import type { ParsedRow } from "../types/parsed-row.ts";
import type { ErrorAccumulator } from "./error-accumulator.ts";

/**
 * For Object schemas, return a map of property name → true when the property
 * type is "integer". Used to catch fractional strings before Value.Convert
 * silently truncates them (e.g. "3.5" → 3).
 */
function integerFields(schema: TSchema): Set<string> {
  const result = new Set<string>();
  if (schema.type !== "object") return result;
  const props = (schema as TObject).properties ?? {};
  for (const [key, propSchema] of Object.entries(props)) {
    if ((propSchema as TSchema).type === "integer") result.add(key);
  }
  return result;
}

/**
 * Coerce string row values against a TypeBox schema. Errors pushed to the accumulator.
 * Returns true if the row validates.
 */
export function validateRowSchema(row: ParsedRow, schema: TSchema, acc: ErrorAccumulator): boolean {
  // Pre-check: reject fractional string values aimed at integer fields
  // before Value.Convert silently truncates them.
  const intFields = integerFields(schema);
  const preErrors: { field: string; message: string }[] = [];
  for (const field of intFields) {
    const raw = row.values[field];
    if (raw !== undefined && raw !== "" && !Number.isInteger(Number(raw))) {
      preErrors.push({
        field,
        message: `Expected integer but received "${raw}"`,
      });
    }
  }

  if (preErrors.length > 0) {
    for (const e of preErrors) {
      acc.push({
        rowNumber: row.rowNumber,
        sheetName: row.sheetName,
        errorCode: BulkErrorCodes.INVALID_VALUE,
        errorMessage: e.message,
        field: e.field,
        rowSnapshot: { ...row.values },
      });
    }
    return false;
  }

  // Value.Convert mutates its input in place, so pass a shallow clone. row.values is the
  // documented Record<string, string> that every coerceRow reads (and calls .trim() on);
  // converting it directly would rewrite integer/boolean cells into numbers/booleans and
  // crash those callers with ".trim is not a function".
  const coerced = Value.Convert(schema, { ...row.values });
  if (Value.Check(schema, coerced)) return true;

  const errors = [...Value.Errors(schema, coerced)];
  for (const e of errors) {
    const field = e.path.replace(/^\//, "").split("/")[0] || null;
    const code = e.message.toLowerCase().includes("required")
      ? BulkErrorCodes.MISSING_REQUIRED_FIELD
      : BulkErrorCodes.INVALID_VALUE;
    acc.push({
      rowNumber: row.rowNumber,
      sheetName: row.sheetName,
      errorCode: code,
      errorMessage: e.message,
      field,
      rowSnapshot: { ...row.values },
    });
  }
  return false;
}
