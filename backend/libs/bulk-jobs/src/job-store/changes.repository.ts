import { BulkImportJobRowChange } from "@materialhub/database";
import type { DataSource, EntityManager } from "typeorm";

export interface ChangeEntry {
  jobId: string;
  rowNumber: number;
  entityType: "product" | "product_variant" | "inventory";
  entityId: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

export class ChangesRepository {
  constructor(private readonly dataSource: DataSource) {}

  async insertMany(entries: ChangeEntry[], manager?: EntityManager): Promise<void> {
    if (entries.length === 0) return;
    const runner = manager ?? this.dataSource.manager;
    const rows = entries.map((e) => ({
      job_id: e.jobId,
      row_number: e.rowNumber,
      entity_type: e.entityType,
      entity_id: e.entityId,
      field: e.field,
      old_value: e.oldValue,
      new_value: e.newValue,
    }));
    await runner
      .createQueryBuilder()
      .insert()
      .into(BulkImportJobRowChange)
      // biome-ignore lint/suspicious/noExplicitAny: TypeORM QueryDeepPartialEntity cannot accept `unknown`
      .values(rows as any[])
      .execute();
  }

  async listByJob(
    jobId: string,
    limit: number,
    offset: number,
  ): Promise<{ items: BulkImportJobRowChange[]; total: number }> {
    const [items, total] = await this.dataSource
      .getRepository(BulkImportJobRowChange)
      .findAndCount({
        where: { job_id: jobId },
        order: { row_number: "ASC", created_at: "ASC" },
        take: limit,
        skip: offset,
      });
    return { items, total };
  }
}
