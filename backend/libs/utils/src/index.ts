export { generateSlug } from "./slug.ts";
export {
  clearInProcessServices,
  inProcessOrigins,
  registerInProcessService,
  serviceFetch,
  type ServiceHandler,
} from "./service-fetch.ts";
export { MediaService, type ProcessedImages } from "./media.service.ts";
export {
  ASSET_TYPE_CONFIG,
  buildAssetKey,
  isAssetType,
  type AssetTypeConfig,
  type MediaAssetType,
} from "./asset-type-config.ts";
export { EmailService } from "./email.service.ts";
export {
  WhatsAppService,
  type WhatsAppConfig,
  type WhatsAppTemplateComponent,
} from "./whatsapp.service.ts";
export { normalizePhoneE164 } from "./phone.ts";
export { getS3Client, getCloudFrontClient } from "./s3-client.ts";
export { EncryptionService } from "./encryption.service.ts";
export { maxCommissionForNet } from "./commission-cap.ts";
export { revalidateStorefrontTags } from "./storefront-revalidate.ts";
export { encodeCursor, decodeCursor, type CursorData, type PaginatedResult } from "./pagination.ts";

/**
 * Convert AED amount to fils (smallest currency unit).
 */
export function toFils(aed: number): number {
  return Math.round(aed * 100);
}

/**
 * Convert fils back to AED.
 */
export function toAed(fils: number): number {
  return fils / 100;
}

/**
 * Slugify a string for URL-safe identifiers.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Paginate helper — returns offset and limit from page/perPage.
 */
export function paginate(page = 1, perPage = 20) {
  const limit = Math.min(Math.max(perPage, 1), 100);
  const offset = (Math.max(page, 1) - 1) * limit;
  return { offset, limit };
}

/**
 * Calculate VAT (default 5% for UAE).
 */
export function calculateVat(amount: number, rate = 5): number {
  return Math.round(amount * (rate / 100));
}

export {
  checkTrn,
  isValidTrn,
  normalizeTrn,
  peppolIdFromTrn,
  tinFromTrn,
  TRN_LENGTH,
  TIN_LENGTH,
  UAE_PEPPOL_SCHEME,
} from "./trn.ts";
export type { TrnCheck } from "./trn.ts";

export {
  availableCreditFils,
  checkNetTermsEligibility,
  daysOverdue,
  isNetTerms,
  NET_TERMS_DAYS,
  netTermsDueDate,
  OVERDUE_NET_TERMS_SQL,
  receivableStatus,
} from "./net-terms.ts";
export type {
  NetTerms,
  NetTermsBlockReason,
  NetTermsEligibility,
  NetTermsEligibilityInput,
  ReceivableStatus,
} from "./net-terms.ts";
