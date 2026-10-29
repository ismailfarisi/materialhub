import { describe, expect, it } from "bun:test";
import { validateSpec } from "./validate.ts";

describe("validateSpec", () => {
  it("accepts a minimal valid spec", () => {
    const result = validateSpec({ version: 1, fields: [] });
    expect(result.ok).toBe(true);
  });

  it("accepts a spec with all field types", () => {
    const result = validateSpec({
      version: 1,
      constants: { channel: "x" },
      fields: [
        { target: "a", source: "x.y" },
        { target: "b", source: "x", value_map: { a: "A" }, default: "Z" },
        { target: "c", expression: "toUpper(value)" },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects wrong version", () => {
    const result = validateSpec({ version: 2, fields: [] } as any);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/version/);
  });

  it("rejects field without target", () => {
    const result = validateSpec({ version: 1, fields: [{ source: "x" } as any] });
    expect(result.ok).toBe(false);
  });

  it("rejects unknown expression function", () => {
    const result = validateSpec({
      version: 1,
      fields: [{ target: "a", expression: "evil(value)" }],
    });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/unknown/);
  });

  it("rejects when neither source nor expression nor constant", () => {
    const result = validateSpec({ version: 1, fields: [{ target: "a" }] });
    expect(result.ok).toBe(false);
  });
});
