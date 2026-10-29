import { config } from "@materialhub/config";
import { AppDataSource } from "@materialhub/database";
import { Queue } from "bullmq";

export const INVALIDATE_QUEUE_NAME = "reels-cache-invalidation";
export const INVALIDATE_JOB_NAME = "invalidateCategoryCohorts";

export interface InvalidationPayload {
  /** Category ids whose cohorts should be flushed along with all ancestors. */
  seedCategoryIds: string[];
}

export interface HotRow {
  category_id: string;
  language_code: string;
  country_code: string;
}

export function computeAffectedCohortKeys(input: {
  ancestorCategoryIds: string[];
  hotRows: HotRow[];
}): string[] {
  const ancestorSet = new Set(input.ancestorCategoryIds);
  return input.hotRows
    .filter((h) => ancestorSet.has(h.category_id))
    .map((h) => `category:${h.category_id}:${h.language_code}:${h.country_code}`);
}

export async function resolveAncestorCategoryIds(seedIds: string[]): Promise<string[]> {
  if (seedIds.length === 0) return [];
  const rows = await AppDataSource.query<{ id: string }[]>(
    `
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_id FROM categories WHERE id = ANY($1) AND deleted_at IS NULL
      UNION ALL
      SELECT c.id, c.parent_id
      FROM categories c
      JOIN ancestors a ON a.parent_id = c.id
      WHERE c.deleted_at IS NULL
    )
    SELECT DISTINCT id FROM ancestors
    `,
    [seedIds],
  );
  return rows.map((r) => r.id);
}

export class CategoryCohortInvalidator {
  private readonly queue: Queue;

  constructor() {
    this.queue = new Queue(INVALIDATE_QUEUE_NAME, { connection: { url: config.bullmq.redisUrl } });
  }

  async enqueue(payload: InvalidationPayload): Promise<void> {
    if (payload.seedCategoryIds.length === 0) return;
    await this.queue.add(INVALIDATE_JOB_NAME, payload, {
      removeOnComplete: 50,
      removeOnFail: 200,
    });
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}
