import Papa from "papaparse";
import { BulkErrorCodes } from "../types/error-codes.ts";
import type { ParseResult, ParsedRow, RowError } from "../types/parsed-row.ts";

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/** Drop a dangling odd byte so `swap16`/utf16le never throw on a truncated file. */
function evenBytes(buf: Buffer): Buffer {
  return buf.length % 2 === 0 ? buf : buf.subarray(0, buf.length - 1);
}

/** Which encoding `decodeBuffer` actually used, so the choice can be logged. */
export type DetectedEncoding = "utf-8" | "utf-16le" | "utf-16be" | "windows-1252";

/**
 * Does the buffer contain at least one WELL-FORMED multi-byte UTF-8 sequence?
 *
 * Used only to grade the warning emitted when the cp1252 fallback fires, never
 * to pick the encoding. A file that both fails a strict UTF-8 decode AND holds
 * valid multi-byte sequences is far more likely UTF-8 with localised damage (a
 * truncated tail, a spliced-in stray byte) than a genuine Western-Excel export,
 * and reading it as cp1252 mojibakes every one of those sequences. Deliberately
 * lax — overlongs and surrogate ranges are not rejected — because this decides
 * the wording of a log line, not the bytes anyone gets.
 *
 * Called with the raw buffer, BOM included, on purpose: a UTF-8 BOM is itself a
 * well-formed 3-byte sequence, and a file that declares UTF-8 and then fails a
 * strict UTF-8 decode is damaged UTF-8 by definition — exactly the case this
 * wants to flag.
 */
function hasWellFormedMultiByteUtf8(buf: Buffer): boolean {
  for (let i = 0; i < buf.length; i++) {
    const lead = buf[i] as number;
    if (lead < 0x80) continue;
    const width =
      lead >= 0xf0 && lead <= 0xf4
        ? 4
        : lead >= 0xe0 && lead <= 0xef
          ? 3
          : lead >= 0xc2 && lead <= 0xdf
            ? 2
            : 0;
    if (width === 0 || i + width > buf.length) continue;
    let wellFormed = true;
    for (let k = 1; k < width; k++) {
      const cont = buf[i + k] as number;
      if (cont < 0x80 || cont > 0xbf) {
        wellFormed = false;
        break;
      }
    }
    if (wellFormed) return true;
  }
  return false;
}

/**
 * Decode the upload to text, detecting the encoding instead of assuming UTF-8.
 *
 * Excel on a Western Windows locale exports CSV as Windows-1252. A bare
 * `buffer.toString("utf8")` replaces every byte in 0x80-0xFF that is not valid
 * UTF-8 with U+FFFD and raises no error at file or row level, so the corruption
 * lands in `products.name` unnoticed and is unrecoverable afterwards.
 *
 * Order matters: a UTF-16 BOM is decoded as declared, and UTF-8 is always tried
 * strictly before falling back — a file that decodes cleanly as UTF-8 is UTF-8.
 * The fallback is whole-file, so a UTF-8 file carrying a stray non-UTF-8 byte is
 * read as Windows-1252; such a file is malformed either way, and cp1252 at least
 * loses nothing.
 *
 * Returns the encoding it settled on so the caller can log it. The fallback
 * rewrites the meaning of every high byte in the file and raises nothing — the
 * same silent-and-total shape as the bug it replaces — so it must not also be
 * invisible.
 */
function decodeBuffer(buffer: Buffer): { text: string; encoding: DetectedEncoding } {
  if (buffer.length >= 2) {
    // Buffer's own utf16le is used rather than TextDecoder because @types narrows the
    // TextDecoder label union and rejects "utf-16le"/"utf-16be".
    if (buffer[0] === 0xff && buffer[1] === 0xfe)
      return {
        text: evenBytes(buffer.subarray(2)).toString("utf16le"),
        encoding: "utf-16le",
      };
    // No native big-endian decoder; swap16 on a copy reduces it to the little-endian case.
    if (buffer[0] === 0xfe && buffer[1] === 0xff)
      return {
        text: Buffer.from(evenBytes(buffer.subarray(2)))
          .swap16()
          .toString("utf16le"),
        encoding: "utf-16be",
      };
  }

  const body =
    buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf
      ? buffer.subarray(3)
      : buffer;

  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(body), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(body), encoding: "windows-1252" };
  }
}

function isEmptyRow(values: Record<string, string>): boolean {
  return Object.values(values).every((v) => v == null || String(v).trim() === "");
}

export async function parseCsv(buffer: Buffer): Promise<ParseResult> {
  const { text: decoded, encoding } = decodeBuffer(buffer);
  if (encoding === "windows-1252") {
    // The whole point of this parser's fix is that a silent whole-file
    // reinterpretation is what let 121 corrupted names reach production. The
    // fallback is the right default (rejecting would hard-fail the job — see
    // parse-file.ts:22 -> bulk-job-worker markFailed) but it must leave a
    // trace: it changes the meaning of every high byte in the file and no
    // file-level or row-level error is raised.
    const verdict = hasWellFormedMultiByteUtf8(buffer)
      ? "It DOES contain well-formed multi-byte UTF-8 sequences, so it is more likely UTF-8 with localised damage (truncated tail or a spliced-in stray byte) than a Western-Excel export — in which case every one of those sequences has just been mojibaked. Check the imported names before trusting this job."
      : "No well-formed multi-byte UTF-8 sequences present, consistent with an ordinary Excel/Windows-1252 export.";
    console.warn(
      `[csv-parser] upload (${buffer.length} bytes) is not valid UTF-8; decoded the whole file as windows-1252. ${verdict}`,
    );
  }
  const text = stripBom(decoded);

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: false,
    transformHeader: (h) => stripBom(h).trim(),
    dynamicTyping: false,
  });

  const fileLevelErrors: RowError[] = [];
  if (parsed.errors.length > 0) {
    const severe = parsed.errors.find((e) => e.code === "MissingQuotes" || e.type === "Quotes");
    if (severe) {
      fileLevelErrors.push({
        rowNumber: severe.row != null ? severe.row + 1 : 0,
        sheetName: null,
        errorCode: BulkErrorCodes.MALFORMED_FILE,
        errorMessage: severe.message,
        field: null,
        rowSnapshot: {},
      });
      return { rows: [], fileLevelErrors };
    }
  }

  const rows: ParsedRow[] = [];
  parsed.data.forEach((values, idx) => {
    if (isEmptyRow(values)) return;
    const normalized: Record<string, string> = {};
    for (const [k, v] of Object.entries(values)) {
      normalized[k.trim()] = v == null ? "" : String(v);
    }
    rows.push({
      rowNumber: idx + 1,
      sheetName: null,
      values: normalized,
    });
  });

  return { rows, fileLevelErrors };
}
