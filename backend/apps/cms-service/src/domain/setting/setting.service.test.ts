import { describe, expect, test } from "bun:test";
import { VALUE_TYPE_VALIDATORS } from "./setting.service.ts";

describe("site setting value validators", () => {
  test("integer settings take whole numbers only", () => {
    expect(VALUE_TYPE_VALIDATORS.integer("30")).toBe(true);
    expect(VALUE_TYPE_VALIDATORS.integer("3.5")).toBe(false);
    expect(VALUE_TYPE_VALIDATORS.integer("")).toBe(false);
  });
  test("number settings reject blanks and text", () => {
    expect(VALUE_TYPE_VALIDATORS.number("5")).toBe(true);
    expect(VALUE_TYPE_VALIDATORS.number("")).toBe(false);
    expect(VALUE_TYPE_VALIDATORS.number("five")).toBe(false);
  });
});
