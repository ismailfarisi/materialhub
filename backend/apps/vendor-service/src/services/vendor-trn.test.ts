import { describe, expect, test } from "bun:test";
import { parseVendorTrn, withTrnStatus } from "./vendor.service.ts";

describe("vendor TRN", () => {
  test("accepts 15 digits and strips separators", () => {
    expect(parseVendorTrn("100 9876 5430 0003")).toBe("100987654300003");
  });

  test("empty clears the TRN", () => {
    expect(parseVendorTrn("")).toBeNull();
    expect(parseVendorTrn(null)).toBeNull();
  });

  test("rejects anything that is not 15 digits", () => {
    expect(() => parseVendorTrn("12345")).toThrow(/15 digits/);
    expect(() => parseVendorTrn("10098765430000X")).toThrow(/15 digits/);
  });

  test("adds the format flag for dashboards", () => {
    expect(withTrnStatus({ trn: "100987654300003" }).trn_format_valid).toBe(true);
    expect(withTrnStatus({ trn: null }).trn_format_valid).toBe(false);
  });
});
