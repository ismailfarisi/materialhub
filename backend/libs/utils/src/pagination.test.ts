import { describe, expect, test } from "bun:test";
import { decodeCursor, encodeCursor } from "./pagination.ts";

describe("cursor pagination", () => {
  test("encodeCursor produces a base64 string", () => {
    const cursor = encodeCursor("created_at", "2026-01-01T00:00:00Z", "uuid-123");
    expect(typeof cursor).toBe("string");
    expect(cursor.length).toBeGreaterThan(0);
  });

  test("decodeCursor reverses encodeCursor", () => {
    const cursor = encodeCursor("created_at", "2026-01-01T00:00:00Z", "uuid-123");
    const decoded = decodeCursor(cursor);
    expect(decoded).toEqual({
      sortField: "created_at",
      sortValue: "2026-01-01T00:00:00Z",
      id: "uuid-123",
    });
  });

  test("decodeCursor returns null for invalid cursor", () => {
    expect(decodeCursor("not-valid-base64!!!")).toBeNull();
    expect(decodeCursor("")).toBeNull();
  });

  test("round-trips with numeric sort values", () => {
    const cursor = encodeCursor("price", "15000", "uuid-456");
    const decoded = decodeCursor(cursor);
    expect(decoded?.sortField).toBe("price");
    expect(decoded?.sortValue).toBe("15000");
    expect(decoded?.id).toBe("uuid-456");
  });
});
