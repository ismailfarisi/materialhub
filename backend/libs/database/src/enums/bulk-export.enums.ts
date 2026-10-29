export enum BulkExportJobType {
  ProductExport = "product_export",
}

export enum BulkExportJobStatus {
  Queued = "queued",
  Running = "running",
  Completed = "completed",
  Failed = "failed",
  Cancelled = "cancelled",
}

export enum BulkExportFileFormat {
  Csv = "csv",
  Xlsx = "xlsx",
}

export enum ProductExportPreset {
  CatalogOverview = "catalog_overview",
  Pricing = "pricing",
  Inventory = "inventory",
  MediaHealth = "media_health",
  Seo = "seo",
  Custom = "custom",
}
