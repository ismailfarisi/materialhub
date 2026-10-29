import { describe, expect, test } from "bun:test";
import { parseFlashDealDate } from "./date-parser.ts";

describe("parseFlashDealDate", () => {
  test("ISO with Z returns the same UTC instant", () => {
    const r = parseFlashDealDate("2026-06-01T09:00:00Z");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.toISOString()).toBe("2026-06-01T09:00:00.000Z");
  });

  test("ISO with +04:00 (Dubai) returns equivalent UTC", () => {
    const r = parseFlashDealDate("2026-06-01T09:00:00+04:00");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.toISOString()).toBe("2026-06-01T05:00:00.000Z");
  });

  test("ISO without offset → interpreted as Asia/Dubai (UTC+4)", () => {
    const r = parseFlashDealDate("2026-06-01T09:00:00");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.toISOString()).toBe("2026-06-01T05:00:00.000Z");
  });

  test("YYYY-MM-DD HH:mm → Dubai", () => {
    const r = parseFlashDealDate("2026-06-01 09:00");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.toISOString()).toBe("2026-06-01T05:00:00.000Z");
  });

  test("YYYY-MM-DD bare date → Dubai midnight", () => {
    const r = parseFlashDealDate("2026-06-01");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.toISOString()).toBe("2026-05-31T20:00:00.000Z");
  });

  test("Date object passed through (Excel cell)", () => {
    const d = new Date("2026-06-01T05:00:00.000Z");
    const r = parseFlashDealDate(d);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.toISOString()).toBe(d.toISOString());
  });

  test("garbage string → not ok", () => {
    const r = parseFlashDealDate("not a date");
    expect(r.ok).toBe(false);
  });

  test("empty string → not ok", () => {
    const r = parseFlashDealDate("");
    expect(r.ok).toBe(false);
  });

  test("null → not ok", () => {
    const r = parseFlashDealDate(null);
    expect(r.ok).toBe(false);
  });
});
