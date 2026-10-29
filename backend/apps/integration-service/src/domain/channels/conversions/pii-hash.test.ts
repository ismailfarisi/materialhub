import { describe, expect, it } from "bun:test";
import { hashAddressLine, hashEmail, hashName, hashPhone } from "./pii-hash.ts";

describe("hashEmail", () => {
  it("matches the Google-published canonical example", () => {
    // From Google's Enhanced Conversions docs: SHA-256("test@example.com") in
    // lowercase hex. This is the contract — if it ever fails, Google's match
    // quality will silently drop.
    expect(hashEmail("test@example.com")).toBe(
      "973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b",
    );
  });

  it("lowercases and trims before hashing", () => {
    const canonical = hashEmail("test@example.com");
    expect(hashEmail("  Test@Example.COM  ")).toBe(canonical);
    expect(hashEmail("TEST@EXAMPLE.COM")).toBe(canonical);
    expect(hashEmail("\ttest@example.com\n")).toBe(canonical);
  });

  it("returns a 64-character lowercase hex string", () => {
    const out = hashEmail("anyone@example.com");
    expect(out).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("hashPhone", () => {
  it("strips non-digit characters and prepends + when missing", () => {
    // "+1 (415) 555-2671" → strip → "+14155552671" → sha256(...)
    expect(hashPhone("+14155552671")).toBe(
      "cb6880e416769253645cb9c6b8989154bf66a56a77fc14c81fb1019663cbb928",
    );
  });

  it("normalizes any punctuation/spacing to the same E.164 form", () => {
    const canonical = hashPhone("+14155552671");
    expect(hashPhone("+1 (415) 555-2671")).toBe(canonical);
    expect(hashPhone("+1-415-555-2671")).toBe(canonical);
    expect(hashPhone("+1.415.555.2671")).toBe(canonical);
    expect(hashPhone("  +1 415 555 2671  ")).toBe(canonical);
  });

  it("prepends + when the input is missing it (digits-only)", () => {
    const canonical = hashPhone("+14155552671");
    expect(hashPhone("14155552671")).toBe(canonical);
    expect(hashPhone("1 (415) 555-2671")).toBe(canonical);
  });

  it("returns a 64-character lowercase hex string", () => {
    expect(hashPhone("+14155552671")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("hashName", () => {
  it("lowercases and trims before hashing", () => {
    const canonical = hashName("john");
    expect(hashName("JOHN")).toBe(canonical);
    expect(hashName("  John  ")).toBe(canonical);
    expect(hashName("\tjohn\n")).toBe(canonical);
  });

  it("returns a 64-character lowercase hex string", () => {
    expect(hashName("john")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("hashAddressLine", () => {
  it("collapses multiple internal spaces to a single space", () => {
    const canonical = hashAddressLine("123 main st");
    expect(hashAddressLine("123  main  st")).toBe(canonical);
    expect(hashAddressLine("123   main   st")).toBe(canonical);
    expect(hashAddressLine("123\tmain\tst")).toBe(canonical);
    expect(hashAddressLine("123 main\nst")).toBe(canonical);
  });

  it("lowercases and trims around the collapsed value", () => {
    const canonical = hashAddressLine("123 main st");
    expect(hashAddressLine("  123 MAIN ST  ")).toBe(canonical);
    expect(hashAddressLine("123 Main St")).toBe(canonical);
  });

  it("returns a 64-character lowercase hex string", () => {
    expect(hashAddressLine("123 main st")).toMatch(/^[0-9a-f]{64}$/);
  });
});
