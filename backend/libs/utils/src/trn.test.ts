import { describe, expect, test } from "bun:test";
import { checkTrn, isValidTrn, normalizeTrn, peppolIdFromTrn, tinFromTrn } from "./trn.ts";

describe("TRN validator", () => {
  test("accepts exactly 15 digits", () => {
    expect(isValidTrn("100234567800003")).toBe(true);
    expect(checkTrn("100234567800003")).toEqual({ ok: true, trn: "100234567800003" });
  });

  test("normalises spaces, dashes and dots from pasted certificates", () => {
    expect(normalizeTrn(" 100-2345-6780-0003 ")).toBe("100234567800003");
    expect(normalizeTrn("100.234.567.800.003")).toBe("100234567800003");
    expect(isValidTrn("100 2345 6780 0003")).toBe(true);
  });

  test("rejects wrong length", () => {
    expect(checkTrn("10023456780000")).toEqual({ ok: false, reason: "wrong_length" });
    expect(checkTrn("1002345678000031")).toEqual({ ok: false, reason: "wrong_length" });
  });

  test("rejects letters and empty input", () => {
    expect(checkTrn("10023456780000A")).toEqual({ ok: false, reason: "not_digits" });
    expect(checkTrn("")).toEqual({ ok: false, reason: "empty" });
    expect(checkTrn("   ")).toEqual({ ok: false, reason: "empty" });
    expect(checkTrn(null)).toEqual({ ok: false, reason: "empty" });
    expect(isValidTrn(undefined)).toBe(false);
  });

  test("TIN is the first 10 digits", () => {
    expect(tinFromTrn("100234567800003")).toBe("1002345678");
    expect(tinFromTrn("123")).toBeNull();
  });

  test("Peppol participant ID is derived from the TIN", () => {
    expect(peppolIdFromTrn("100234567800003")).toBe("0235:1002345678");
    expect(peppolIdFromTrn("not-a-trn")).toBeNull();
  });
});
