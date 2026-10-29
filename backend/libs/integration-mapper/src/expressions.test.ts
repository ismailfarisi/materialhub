import { describe, expect, it } from "bun:test";
import { callExpression, parseExpression } from "./expressions.ts";

describe("parseExpression", () => {
  it("parses a simple call", () => {
    expect(parseExpression("toUpper(value)")).toEqual({
      name: "toUpper",
      args: ["value"],
    });
  });

  it("parses a call with multiple args", () => {
    expect(parseExpression("formatDate(value, 'YYYY-MM-DD')")).toEqual({
      name: "formatDate",
      args: ["value", "YYYY-MM-DD"],
    });
  });

  it("parses a numeric literal arg", () => {
    expect(parseExpression("multiply(value, 0.01)")).toEqual({
      name: "multiply",
      args: ["value", 0.01],
    });
  });

  it("rejects unknown function", () => {
    expect(() => parseExpression("evilFunction(x)")).toThrow(/unknown expression/i);
  });

  it("rejects malformed input", () => {
    expect(() => parseExpression("not a call")).toThrow();
  });
});

describe("callExpression", () => {
  const ctx = { value: "hello", a: { b: "world" } };
  it("toUpper", () => {
    expect(callExpression("toUpper(value)", ctx)).toBe("HELLO");
  });
  it("toLower", () => {
    expect(callExpression("toLower('HELLO')", ctx)).toBe("hello");
  });
  it("concat with separator", () => {
    expect(callExpression("concat(value, a.b, ' ')", ctx)).toBe("hello world");
  });
  it("concat without separator", () => {
    expect(callExpression("concat('x', 'y')", {})).toBe("xy");
  });
  it("multiply", () => {
    expect(callExpression("multiply(value, 0.01)", { value: 10000 })).toBe(100);
  });
  it("divide", () => {
    expect(callExpression("divide(value, 10)", { value: 100 })).toBe(10);
  });
  it("formatDate", () => {
    expect(
      callExpression("formatDate(value, 'yyyy-MM-dd')", { value: "2026-04-27T10:00:00Z" }),
    ).toBe("2026-04-27");
  });
  it("default returns fallback when value is null", () => {
    expect(callExpression("default(value, 'fallback')", { value: null })).toBe("fallback");
  });
  it("default returns value when present", () => {
    expect(callExpression("default(value, 'fallback')", { value: "x" })).toBe("x");
  });
  it("rejects wrong arity", () => {
    expect(() => callExpression("multiply(value)", { value: 1 })).toThrow(/arity/i);
  });
});
