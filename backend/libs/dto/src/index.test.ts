import { describe, expect, test } from "bun:test";
import { FormatRegistry } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { ErrorResponse, HealthResponse, IdParam, PaginationQuery } from "./index.ts";

// Register UUID format if not already registered
if (!FormatRegistry.Has("uuid")) {
  FormatRegistry.Set("uuid", (value) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value),
  );
}

describe("PaginationQuery schema", () => {
  test("accepts valid pagination", () => {
    expect(Value.Check(PaginationQuery, { page: 1, limit: 20 })).toBe(true);
  });

  test("accepts empty object (all optional)", () => {
    expect(Value.Check(PaginationQuery, {})).toBe(true);
  });

  test("rejects page < 1", () => {
    expect(Value.Check(PaginationQuery, { page: 0 })).toBe(false);
    expect(Value.Check(PaginationQuery, { page: -1 })).toBe(false);
  });

  test("rejects limit < 1", () => {
    expect(Value.Check(PaginationQuery, { limit: 0 })).toBe(false);
  });

  test("rejects limit > 100", () => {
    expect(Value.Check(PaginationQuery, { limit: 101 })).toBe(false);
  });

  test("accepts boundary values", () => {
    expect(Value.Check(PaginationQuery, { page: 1, limit: 1 })).toBe(true);
    expect(Value.Check(PaginationQuery, { page: 1, limit: 100 })).toBe(true);
  });
});

describe("IdParam schema", () => {
  test("accepts valid UUID", () => {
    expect(Value.Check(IdParam, { id: "550e8400-e29b-41d4-a716-446655440000" })).toBe(true);
  });

  test("rejects non-UUID string", () => {
    expect(Value.Check(IdParam, { id: "not-a-uuid" })).toBe(false);
  });

  test("rejects empty string", () => {
    expect(Value.Check(IdParam, { id: "" })).toBe(false);
  });

  test("rejects missing id", () => {
    expect(Value.Check(IdParam, {})).toBe(false);
  });
});

describe("ErrorResponse schema", () => {
  test("accepts valid error response", () => {
    const valid = {
      statusCode: 404,
      message: "Not found",
      error: "NOT_FOUND",
      timestamp: "2024-01-01T00:00:00.000Z",
    };
    expect(Value.Check(ErrorResponse, valid)).toBe(true);
  });

  test("accepts error response without optional error field", () => {
    const valid = {
      statusCode: 500,
      message: "Internal error",
      timestamp: "2024-01-01T00:00:00.000Z",
    };
    expect(Value.Check(ErrorResponse, valid)).toBe(true);
  });

  test("rejects missing statusCode", () => {
    expect(
      Value.Check(ErrorResponse, { message: "err", timestamp: "2024-01-01T00:00:00.000Z" }),
    ).toBe(false);
  });

  test("rejects missing message", () => {
    expect(
      Value.Check(ErrorResponse, { statusCode: 400, timestamp: "2024-01-01T00:00:00.000Z" }),
    ).toBe(false);
  });
});

describe("HealthResponse schema", () => {
  test("accepts valid health response", () => {
    const valid = {
      status: "ok",
      service: "api-gateway",
      timestamp: "2024-01-01T00:00:00.000Z",
    };
    expect(Value.Check(HealthResponse, valid)).toBe(true);
  });

  test("rejects missing fields", () => {
    expect(Value.Check(HealthResponse, { status: "ok" })).toBe(false);
    expect(Value.Check(HealthResponse, {})).toBe(false);
  });
});
