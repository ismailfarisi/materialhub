/**
 * Canonical error codes emitted during parsing, validation, and write.
 * Stored in bulk_import_job_row_errors.error_code.
 */
export const BulkErrorCodes = {
  // Parse-time (file-level)
  INVALID_FILE_TYPE: "invalid_file_type",
  MALFORMED_FILE: "malformed_file",
  MISSING_SHEET: "missing_sheet",
  MISSING_REQUIRED_COLUMN: "missing_required_column",
  ROW_LIMIT_EXCEEDED: "row_limit_exceeded",
  ENCODING_NOT_UTF8: "encoding_not_utf8",

  // Row-level generic
  INVALID_VALUE: "invalid_value",
  MISSING_REQUIRED_FIELD: "missing_required_field",
  DUPLICATE_KEY_IN_FILE: "duplicate_key_in_file",

  // Domain-specific
  UNKNOWN_PRODUCT: "unknown_product",
  UNKNOWN_VARIANT: "unknown_variant",
  AMBIGUOUS_PRODUCT: "ambiguous_product",
  PRODUCT_NOT_OWNED: "product_not_owned",
  UNKNOWN_CATEGORY: "unknown_category",
  UNKNOWN_BRAND: "unknown_brand",
  UNKNOWN_ATTRIBUTE: "unknown_attribute",
  UNKNOWN_ATTRIBUTE_VALUE: "unknown_attribute_value",
  MISSING_REQUIRED_ATTRIBUTE: "missing_required_attribute",
  DUPLICATE_VARIANT_OPTIONS: "duplicate_variant_options",
  GROUP_ATTRIBUTE_REQUIRED: "group_attribute_required",
  ATTRIBUTE_NOT_GROUPABLE: "attribute_not_groupable",
  GROUP_VALUE_MISSING: "group_value_missing",
  INCONSISTENT_GROUP_ATTRIBUTE: "inconsistent_group_attribute",
  DUPLICATE_GROUP_VALUE: "duplicate_group_value",
  SLUG_COLLISION: "slug_collision",
  HAS_VARIANTS_BUT_NO_VARIANT_KEY: "has_variants_but_no_variant_key",
  SOFT_DELETED: "soft_deleted",
  INVALID_PRICE: "invalid_price",
  NEGATIVE_QUANTITY: "negative_quantity",
  QUANTITY_TOO_LARGE: "quantity_too_large",
  NO_DEFAULT_WAREHOUSE: "no_default_warehouse",
  VENDOR_SUSPENDED: "vendor_suspended",
  UPDATE_PRODUCT_NOT_FOUND: "update_product_not_found",
  UPDATE_VARIANT_NOT_FOUND: "update_variant_not_found",

  // Drive folder expansion (catalog import)
  DRIVE_API_NOT_CONFIGURED: "drive_api_not_configured",
  DRIVE_FOLDER_NOT_FOUND: "drive_folder_not_found",
  DRIVE_FOLDER_INACCESSIBLE: "drive_folder_inaccessible",
  DRIVE_API_ERROR: "drive_api_error",

  // postimg gallery expansion (catalog import)
  POSTIMG_GALLERY_NOT_FOUND: "postimg_gallery_not_found",
  POSTIMG_GALLERY_INACCESSIBLE: "postimg_gallery_inaccessible",
  POSTIMG_GALLERY_EMPTY: "postimg_gallery_empty",
  POSTIMG_FETCH_ERROR: "postimg_fetch_error",

  // Worker-level
  WORKER_CRASHED: "worker_crashed",
} as const;

export type BulkErrorCode = (typeof BulkErrorCodes)[keyof typeof BulkErrorCodes];
