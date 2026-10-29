const DUBAI_OFFSET_MS = 4 * 60 * 60 * 1000; // UTC+4, no DST

export type ParseDateResult = { ok: true; value: Date } | { ok: false };

/**
 * Lenient date parser for flash-deal import rows.
 * Accepts:
 *   - Date object (Excel cells via exceljs return Date)
 *   - ISO with explicit offset:        2026-06-01T09:00:00Z, 2026-06-01T09:00:00+04:00
 *   - ISO without offset (assumed Dubai): 2026-06-01T09:00:00
 *   - YYYY-MM-DD HH:mm (assumed Dubai):   2026-06-01 09:00
 *   - YYYY-MM-DD bare date (Dubai midnight): 2026-06-01
 *
 * Anything else returns { ok: false }; caller emits INVALID_DATE_FORMAT.
 */
export function parseFlashDealDate(input: unknown): ParseDateResult {
  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return { ok: true, value: input };
  }
  if (typeof input !== "string") return { ok: false };
  const trimmed = input.trim();
  if (!trimmed) return { ok: false };

  // Has explicit offset? (Z or ±HH:MM at end, after a T)
  const isoWithOffset = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;
  if (isoWithOffset.test(trimmed)) {
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? { ok: false } : { ok: true, value: d };
  }

  // ISO without offset: 2026-06-01T09:00 or 2026-06-01T09:00:00
  const isoNoOffset = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;
  let m = trimmed.match(isoNoOffset);
  if (m) return parseDubaiLocal(m[1]!, Number(m[2]), Number(m[3]), Number(m[4] ?? 0));

  // Space-separated datetime: 2026-06-01 09:00 or 2026-06-01 09:00:00
  const spaceDatetime = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/;
  m = trimmed.match(spaceDatetime);
  if (m) return parseDubaiLocal(m[1]!, Number(m[2]), Number(m[3]), Number(m[4] ?? 0));

  // Bare date: 2026-06-01
  const bareDate = /^(\d{4}-\d{2}-\d{2})$/;
  m = trimmed.match(bareDate);
  if (m) return parseDubaiLocal(m[1]!, 0, 0, 0);

  return { ok: false };
}

function parseDubaiLocal(
  ymd: string,
  hour: number,
  minute: number,
  second: number,
): ParseDateResult {
  const [y, mo, d] = ymd.split("-").map(Number) as [number, number, number];
  if (
    !Number.isFinite(y) ||
    !Number.isFinite(mo) ||
    !Number.isFinite(d) ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return { ok: false };
  }
  const utcWall = Date.UTC(y, mo - 1, d, hour, minute, second);
  return { ok: true, value: new Date(utcWall - DUBAI_OFFSET_MS) };
}
