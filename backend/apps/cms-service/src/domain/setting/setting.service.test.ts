import { describe, expect, test } from "bun:test";
import { VALUE_TYPE_VALIDATORS } from "./setting.service.ts";

function validator(type: string) {
  const fn = VALUE_TYPE_VALIDATORS[type];
  if (!fn) throw new Error(`no validator registered for "${type}"`);
  return fn;
}

describe("site setting value validators", () => {
  test("integer settings take whole numbers only", () => {
    expect(validator("integer")("30")).toBe(true);
    expect(validator("integer")("3.5")).toBe(false);
    expect(validator("integer")("")).toBe(false);
  });
  test("number settings reject blanks and text", () => {
    expect(validator("number")("5")).toBe(true);
    expect(validator("number")("")).toBe(false);
    expect(validator("number")("five")).toBe(false);
  });
});
