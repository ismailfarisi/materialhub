export interface CsvOptions {
  currencyColumns?: Set<string>; // values in these columns are fils; formatted as "AED X.XX".
}

function escapeField(val: unknown): string {
  const s = val == null ? "" : String(val);
  return /[,"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function formatAED(fils: number): string {
  const aed = fils / 100;
  return `AED ${aed.toFixed(2)}`;
}

export function leaderboardToCsv(
  columns: string[],
  rows: Record<string, unknown>[],
  opts: CsvOptions = {},
): string {
  const currencyColumns = opts.currencyColumns ?? new Set();
  const header = columns.join(",");
  if (rows.length === 0) return header;
  const body = rows
    .map((r) =>
      columns
        .map((c) => {
          const v = r[c];
          if (currencyColumns.has(c) && typeof v === "number") return escapeField(formatAED(v));
          return escapeField(v);
        })
        .join(","),
    )
    .join("\n");
  return `${header}\n${body}`;
}
