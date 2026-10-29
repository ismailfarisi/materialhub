import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseCsv } from "../../src/parsers/csv-parser.ts";

describe("parseCsv", () => {
  test("parses a simple 3-row file", async () => {
    const buf = readFileSync("tests/fixtures/simple.csv");
    const result = await parseCsv(buf);
    expect(result.fileLevelErrors).toEqual([]);
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]).toEqual({
      rowNumber: 1,
      sheetName: null,
      values: { sku: "SKU-100", quantity_on_hand: "50", note: "morning sync" },
    });
    expect(result.rows[2].values.quantity_on_hand).toBe("1200");
  });

  test("strips UTF-8 BOM from the first header", async () => {
    const buf = readFileSync("tests/fixtures/bom.csv");
    const result = await parseCsv(buf);
    expect(result.rows[0].values).toHaveProperty("sku");
    expect(Object.keys(result.rows[0].values).some((k) => k.charCodeAt(0) === 0xfeff)).toBe(false);
  });

  test("returns MALFORMED_FILE on unmatched quote", async () => {
    const buf = Buffer.from('sku,qty\n"unterminated,1\n');
    const result = await parseCsv(buf);
    expect(result.rows).toEqual([]);
    expect(result.fileLevelErrors).toHaveLength(1);
    expect(result.fileLevelErrors[0].errorCode).toBe("malformed_file");
  });

  test("trims trailing empty rows (Excel artifact)", async () => {
    const buf = Buffer.from("sku,qty\nA,1\nB,2\n,\n,\n");
    const result = await parseCsv(buf);
    expect(result.rows).toHaveLength(2);
  });
});

/**
 * Excel on a Western Windows locale exports CSV as Windows-1252. Decoding those
 * bytes as UTF-8 replaces every invalid byte with U+FFFD and raises no error, so
 * the corruption reaches products.name unnoticed. Each byte below is a class of
 * damage observed on production data.
 */
describe("parseCsv encoding detection", () => {
  // Every cp1252 fallback in this block logs by design, and the 0x80-0xFF
  // sweep below trips it 128 times. Silenced here (not per-test) so CI output
  // stays readable; the observability tests read their assertions off this
  // same spy rather than stacking a second one on top of it.
  let warn: ReturnType<typeof spyOn<Console, "warn">>;
  beforeEach(() => {
    warn = spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
  });

  /** Header + one `name` cell built from raw bytes, so the test asserts on bytes not source text. */
  function csvWithNameBytes(nameBytes: number[]): Buffer {
    return Buffer.concat([
      Buffer.from("sku,name\nSKU-1,", "latin1"),
      Buffer.from(nameBytes),
      Buffer.from("\n", "latin1"),
    ]);
  }

  test("decodes Windows-1252 0xAE as ® rather than U+FFFD", async () => {
    // "Nail Enamel® - 538"
    const buf = csvWithNameBytes([
      ...Buffer.from("Nail Enamel", "latin1"),
      0xae,
      ...Buffer.from(" - 538", "latin1"),
    ]);
    const result = await parseCsv(buf);
    expect(result.fileLevelErrors).toEqual([]);
    expect(result.rows[0].values.name).toBe("Nail Enamel® - 538");
    expect(result.rows[0].values.name).not.toContain("�");
  });

  test("decodes Windows-1252 0xA0 as a non-breaking space", async () => {
    // "Professional<NBSP>False Nail Cutter"
    const buf = csvWithNameBytes([
      ...Buffer.from("Professional", "latin1"),
      0xa0,
      ...Buffer.from("False Nail Cutter", "latin1"),
    ]);
    const result = await parseCsv(buf);
    expect(result.rows[0].values.name).toBe("Professional False Nail Cutter");
  });

  test("decodes Windows-1252 0x96 as an en dash", async () => {
    // 0x96 is the case that proves cp1252 and not latin-1: in latin-1 it is an unprintable control.
    const buf = csvWithNameBytes([
      ...Buffer.from("Nail Enamel 57 ", "latin1"),
      0x96,
      ...Buffer.from(" Toasted Berry", "latin1"),
    ]);
    const result = await parseCsv(buf);
    expect(result.rows[0].values.name).toBe("Nail Enamel 57 – Toasted Berry");
  });

  test("leaves valid UTF-8 multi-byte text untouched", async () => {
    // Must not be mis-decoded as cp1252 — that would mojibake every Arabic name.
    const buf = Buffer.from("sku,name\nSKU-1,تياترو – 50ml\n", "utf8");
    const result = await parseCsv(buf);
    expect(result.rows[0].values.name).toBe("تياترو – 50ml");
  });

  test("decodes UTF-16LE (Excel 'Unicode Text' export) via its BOM", async () => {
    const buf = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from("sku,name\nSKU-1,Rouge – 12\n", "utf16le"),
    ]);
    const result = await parseCsv(buf);
    expect(result.rows[0].values).toEqual({ sku: "SKU-1", name: "Rouge – 12" });
  });

  test("decodes UTF-16BE via its BOM", async () => {
    const le = Buffer.from("sku,name\nSKU-1,Rouge\n", "utf16le");
    const be = Buffer.alloc(le.length);
    for (let i = 0; i < le.length; i += 2) {
      be[i] = le[i + 1];
      be[i + 1] = le[i];
    }
    const buf = Buffer.concat([Buffer.from([0xfe, 0xff]), be]);
    const result = await parseCsv(buf);
    expect(result.rows[0].values.name).toBe("Rouge");
  });

  test("still honours a UTF-8 BOM ahead of multi-byte content", async () => {
    const buf = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from("sku,name\nSKU-1,Café\n", "utf8"),
    ]);
    const result = await parseCsv(buf);
    expect(result.rows[0].values.sku).toBe("SKU-1");
    expect(result.rows[0].values.name).toBe("Café");
  });

  test("never emits U+FFFD for any single high byte", async () => {
    // Regression guard for the whole 0x80-0xFF range, not just the three observed classes.
    for (let byte = 0x80; byte <= 0xff; byte++) {
      const result = await parseCsv(csvWithNameBytes([0x41, byte, 0x42]));
      expect(result.rows[0].values.name).not.toContain("�");
    }
  });

  /**
   * The fallback rewrites the meaning of every high byte in the file and raises
   * no file-level or row-level error — the same silent-and-total shape as the
   * bug it replaces. It must at least be greppable in the worker logs.
   */
  describe("fallback observability", () => {
    test("warns when the whole file is reinterpreted as windows-1252", async () => {
      await parseCsv(csvWithNameBytes([...Buffer.from("Nail Enamel", "latin1"), 0xae]));
      expect(warn).toHaveBeenCalledTimes(1);
      const msg = String(warn.mock.calls[0]?.[0]);
      expect(msg).toContain("[csv-parser]");
      expect(msg).toContain("windows-1252");
      // An ordinary Excel export carries no well-formed multi-byte sequences.
      expect(msg).toContain("consistent with an ordinary Excel/Windows-1252 export");
    });

    test("stays silent for a file that decodes cleanly as UTF-8", async () => {
      await parseCsv(Buffer.from("sku,name\nSKU-1,تياترو – 50ml\n", "utf8"));
      expect(warn).not.toHaveBeenCalled();
    });

    test("flags the dangerous case: UTF-8 content with one stray byte, not a cp1252 export", async () => {
      // Arabic UTF-8 plus a spliced-in 0xAE. Decoding this as cp1252 mojibakes
      // every Arabic name in the file, so the warning must say so rather than
      // reporting a routine Excel export.
      const buf = Buffer.concat([
        Buffer.from("sku,name\nSKU-1,تياترو ", "utf8"),
        Buffer.from([0xae]),
        Buffer.from("\n", "latin1"),
      ]);
      await parseCsv(buf);
      const msg = String(warn.mock.calls[0]?.[0]);
      expect(msg).toContain("UTF-8 with localised damage");
      expect(msg).toContain("mojibaked");
    });

    test("flags a UTF-8 file truncated mid-sequence the same way", async () => {
      const full = Buffer.from("sku,name\nSKU-1,تياترو\n", "utf8");
      await parseCsv(full.subarray(0, full.length - 2));
      expect(String(warn.mock.calls[0]?.[0])).toContain("UTF-8 with localised damage");
    });
  });
});
