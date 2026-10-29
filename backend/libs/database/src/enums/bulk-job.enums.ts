// ─── Bulk jobs (Phase 0 foundation) ──────────────────────────────────────────

export enum BulkJobType {
  InventoryUpdate = "inventory_update",
  CatalogImport = "catalog_import",
  FlashDealImport = "flash_deal_import",
  FlashDealDelete = "flash_deal_delete",
}

export enum BulkJobStatus {
  PendingUpload = "pending_upload",
  Queued = "queued",
  Running = "running",
  Completed = "completed",
  CompletedWithErrors = "completed_with_errors",
  Failed = "failed",
  Cancelled = "cancelled",
}

export enum BulkJobStrictness {
  AllOrNothing = "all_or_nothing",
  BestEffort = "best_effort",
}

export enum BulkImportMode {
  /** Default: create new rows, update existing rows matched by key. */
  Upsert = "upsert",
  /** Update existing rows only; keys matching nothing error. Never creates. */
  Update = "update",
}

export enum BulkJobFileFormat {
  Csv = "csv",
  Xlsx = "xlsx",
}

export enum BulkImageTaskStatus {
  Queued = "queued",
  Running = "running",
  Succeeded = "succeeded",
  Failed = "failed",
  Retrying = "retrying",
}
