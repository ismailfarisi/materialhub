import type {
  BulkExportFileFormat,
  BulkExportJobStatus,
  ProductExportPreset,
} from "../../../../../libs/database/src/enums/bulk-export.enums.ts";
import type { UserRole } from "../../../../../libs/database/src/enums/user.enums.ts";

export type ExportCallerRole = UserRole | "admin" | "super_admin" | "vendor" | "customer" | "guest";

export interface ProductExportFilters {
  vendorId?: string;
  status?: string;
  categoryId?: string;
  brandId?: string;
  stockState?: "in_stock" | "low_stock" | "out_of_stock";
  publishState?: string;
  search?: string;
  createdFrom?: string;
  createdTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
}

export interface ProductExportCreateRequest {
  format: BulkExportFileFormat | "csv" | "xlsx";
  preset: ProductExportPreset;
  fieldGroups: string[];
  fields?: string[];
  filters?: ProductExportFilters;
}

export interface ProductExportField {
  key: string;
  label: string;
  group: string;
  sheet: "products" | "variants" | "inventory" | "media" | "attributes";
  csvMode: "value" | "summary" | "xlsx_only";
}

export interface ProductExportFieldGroup {
  key: string;
  label: string;
  defaultFields: string[];
}

export interface ProductExportPresetDescriptor {
  key: ProductExportPreset;
  label: string;
  defaultFieldGroups: string[];
}

export interface ProductExportFilterMetadata {
  vendorId: boolean;
  status: boolean;
  categoryId: boolean;
  brandId: boolean;
  stockState: boolean;
  publishState: boolean;
  search: boolean;
  createdFrom: boolean;
  createdTo: boolean;
  updatedFrom: boolean;
  updatedTo: boolean;
}

export interface ProductExportValidationError {
  code: string;
  message: string;
}

export interface ResolvedProductExportFields {
  fieldGroups: string[];
  fields: string[];
  sheets: Array<"products" | "variants" | "inventory" | "media" | "attributes">;
}

export interface ProductExportJobSummary {
  id: string;
  jobType: string;
  status: BulkExportJobStatus;
  vendorId: string | null;
  format: BulkExportFileFormat;
  preset: ProductExportPreset;
  fileName: string;
  fileSizeBytes: number | null;
  rowCounts: Record<string, number> | null;
  errorMessage: string | null;
  expiresAt: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}
