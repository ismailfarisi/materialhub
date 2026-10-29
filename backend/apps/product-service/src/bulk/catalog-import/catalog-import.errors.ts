import { BulkErrorCodes } from "@materialhub/bulk-jobs";

/** Thrown by the write path when update mode finds no record to update. */
export class UpdateTargetNotFoundError extends Error {
  readonly code: string;
  constructor(kind: "product" | "variant", key: string | null) {
    super(`no existing ${kind} matches "${key ?? ""}" (update mode)`);
    this.name = "UpdateTargetNotFoundError";
    this.code =
      kind === "product"
        ? BulkErrorCodes.UPDATE_PRODUCT_NOT_FOUND
        : BulkErrorCodes.UPDATE_VARIANT_NOT_FOUND;
  }
}
