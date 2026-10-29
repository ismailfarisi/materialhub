import { BulkImportJobRowError } from "@materialhub/database";
import type { DataSource, EntityManager } from "typeorm";
import type { RowError } from "../types/parsed-row.ts";

export class ErrorsRepository {
  constructor(private readonly dataSource: DataSource) {}

  async insertMany(jobId: string, errors: RowError[], manager?: EntityManager): Promise<void> {
    if (errors.length === 0) return;
    const runner = manager ?? this.dataSource.manager;
    const rows = errors.map((e) => ({
      job_id: jobId,
      row_number: e.rowNumber,
      sheet_name: e.sheetName,
      error_code: e.errorCode,
      error_message: e.errorMessage,
      field: e.field,
      row_snapshot: e.rowSnapshot,
    }));
    await runner
      .createQueryBuilder()
      .insert()
      .into(BulkImportJobRowError)
      // biome-ignore lint/suspicious/noExplicitAny: TypeORM QueryDeepPartialEntity cannot accept `unknown`
      .values(rows as any[])
      .execute();
  }

  async listByJob(jobId: string): Promise<BulkImportJobRowError[]> {
    return this.dataSource
      .getRepository(BulkImportJobRowError)
      .find({ where: { job_id: jobId }, order: { row_number: "ASC" } });
  }

  /**
   * Render the error report as CSV text.
   */
  renderCsv(errors: BulkImportJobRowError[]): string {
    const snapshotKeys = new Set<string>();
    for (const e of errors) for (const k of Object.keys(e.row_snapshot)) snapshotKeys.add(k);
    const snapshotCols = [...snapshotKeys].sort();
    const header = [
      "row_number",
      "sheet_name",
      "error_code",
      "error_message",
      "field",
      ...snapshotCols,
    ];

    const escapeCsv = (v: unknown): string => {
      const s = v == null ? "" : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const lines = [header.map(escapeCsv).join(",")];
    for (const e of errors) {
      const row = [
        e.row_number,
        e.sheet_name ?? "",
        e.error_code,
        e.error_message,
        e.field ?? "",
        ...snapshotCols.map((k) => (e.row_snapshot as Record<string, unknown>)[k] ?? ""),
      ];
      lines.push(row.map(escapeCsv).join(","));
    }
    return lines.join("\n");
  }
}
