import type { BulkImportJob } from "@materialhub/database";
import type { EntityManager } from "typeorm";

export interface WriteContext {
  /** The job we're processing. */
  job: BulkImportJob;
  /** Scoped transaction manager provided by the worker base for each batch. */
  manager: EntityManager;
  /** The batch's sequential index, 0-based. */
  batchIndex: number;
  /** Log a diff-log entry for an update. Worker base provides the implementation. */
  logChange: (entry: {
    rowNumber: number;
    entityType: "product" | "product_variant" | "inventory" | "flash_deal";
    entityId: string;
    field: string;
    oldValue: unknown;
    newValue: unknown;
  }) => void;
  /** Pushes a follow-up task (e.g. an image-fetch payload) to be enqueued after the job completes. */
  pushFollowUp: (followUp: FollowUpTask) => void;
}

export interface FollowUpTask {
  queue: "bulk-import-image-fetch" | string;
  payload: Record<string, unknown>;
}

export interface BatchResult<TResult = unknown> {
  succeeded: TResult[];
  skipped: Array<{ rowNumber: number; reason: string; errorCode?: string }>;
}
