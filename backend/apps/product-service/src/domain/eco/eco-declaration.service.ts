import { EcoDeclarationStatus } from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";

/**
 * Plastic-ban ready declarations (eco catalogue, workstream 4).
 *
 * A vendor declares that a product is plastic-ban ready, optionally attaching a
 * certificate (FSC/PEFC chain of custody, compostability, test report). An
 * admin approves or rejects it with a reason. Only approved declarations reach
 * the storefront badge and the `plastic_ban_ready` search facet.
 *
 * MaterialHub reviews the declaration as a listing check; it does not certify
 * legal compliance. Storefront copy must say so.
 */

export const MAX_STATEMENT_LENGTH = 2000;
export const MIN_REJECTION_REASON_LENGTH = 5;
export const ECO_CERTIFICATE_PREFIX = "private/eco-certificates/";

export interface EcoDeclarationRow {
  id: string;
  product_id: string;
  vendor_id: string;
  status: EcoDeclarationStatus;
  statement: string | null;
  certificate_key: string | null;
  certificate_filename: string | null;
  declared_by: string | null;
  submitted_at: Date;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  rejection_reason: string | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface DeclarationInput {
  statement?: string | null;
  certificate_key?: string | null;
  certificate_filename?: string | null;
  /** The vendor must tick "I declare…"; anything but `true` is rejected. */
  confirm: boolean;
}

export interface AdminListFilters {
  status?: string;
  q?: string;
  page?: number | string;
  limit?: number | string;
}

/** Storage + lookups the service needs; the container wires TypeORM in. */
export interface EcoDeclarationStore {
  findByProduct(productId: string): Promise<EcoDeclarationRow | null>;
  findById(id: string): Promise<EcoDeclarationRow | null>;
  save(row: Partial<EcoDeclarationRow>): Promise<EcoDeclarationRow>;
  /** Vendor that owns the product, or null when the product doesn't exist. */
  productOwner(productId: string): Promise<string | null>;
  adminList(filters: {
    status?: EcoDeclarationStatus;
    q?: string;
    page: number;
    limit: number;
  }): Promise<{ items: any[]; total: number }>;
  adminDetail(id: string): Promise<any | null>;
}

export interface EcoDeclarationDeps {
  store: EcoDeclarationStore;
  reindex: (productId: string) => Promise<void>;
  signedUrl: (key: string) => Promise<{ url: string; expiresAt: Date }>;
  now?: () => Date;
}

/** Public, storefront-safe view: only approved declarations, no keys or reasons. */
export function toPublicEcoDeclaration(
  row: Pick<EcoDeclarationRow, "status" | "reviewed_at" | "certificate_key"> | null | undefined,
): { status: "approved"; reviewed_at: Date | null; has_certificate: boolean } | null {
  if (!row || row.status !== EcoDeclarationStatus.approved) return null;
  return {
    status: "approved",
    reviewed_at: row.reviewed_at ?? null,
    has_certificate: !!row.certificate_key,
  };
}

/** Vendor view: everything except the raw storage key. */
export function toVendorEcoDeclaration(row: EcoDeclarationRow | null) {
  if (!row) return null;
  const { certificate_key, ...rest } = row;
  return { ...rest, has_certificate: !!certificate_key };
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export class EcoDeclarationService {
  private readonly store: EcoDeclarationStore;
  private readonly reindex: (productId: string) => Promise<void>;
  private readonly signedUrl: EcoDeclarationDeps["signedUrl"];
  private readonly now: () => Date;

  constructor(deps: EcoDeclarationDeps) {
    this.store = deps.store;
    this.reindex = deps.reindex;
    this.signedUrl = deps.signedUrl;
    this.now = deps.now ?? (() => new Date());
  }

  private async assertOwner(productId: string, vendorId: string): Promise<void> {
    const owner = await this.store.productOwner(productId);
    if (!owner || owner !== vendorId) {
      throw new HttpError(404, "Product not found", "PRODUCT_NOT_FOUND");
    }
  }

  async getForVendor(productId: string, vendorId: string) {
    await this.assertOwner(productId, vendorId);
    return toVendorEcoDeclaration(await this.store.findByProduct(productId));
  }

  /**
   * Create or update the declaration. Any change to the statement or
   * certificate sends it back to review; re-submitting identical content on an
   * approved declaration is a no-op, so double-submits don't drop the badge.
   */
  async declare(productId: string, vendorId: string, userId: string, input: DeclarationInput) {
    await this.assertOwner(productId, vendorId);
    if (input.confirm !== true) {
      throw new HttpError(422, "Tick the declaration to submit it", "ECO_DECLARATION_UNCONFIRMED");
    }
    const statement = cleanText(input.statement);
    if (statement && statement.length > MAX_STATEMENT_LENGTH) {
      throw new HttpError(
        422,
        `Statement must be ${MAX_STATEMENT_LENGTH} characters or fewer`,
        "ECO_STATEMENT_TOO_LONG",
      );
    }

    const existing = await this.store.findByProduct(productId);
    // `undefined` keeps the current certificate; `null` or "" removes it.
    const certificateKey =
      input.certificate_key === undefined
        ? (existing?.certificate_key ?? null)
        : cleanText(input.certificate_key);
    if (certificateKey && !certificateKey.startsWith(`${ECO_CERTIFICATE_PREFIX}${vendorId}/`)) {
      throw new HttpError(
        422,
        "Certificate must be uploaded through the eco certificate upload",
        "ECO_CERTIFICATE_INVALID",
      );
    }
    const certificateFilename = certificateKey
      ? input.certificate_filename === undefined
        ? (existing?.certificate_filename ?? null)
        : (cleanText(input.certificate_filename)?.slice(0, 255) ?? null)
      : null;

    const unchanged =
      existing &&
      existing.status !== EcoDeclarationStatus.withdrawn &&
      existing.status !== EcoDeclarationStatus.rejected &&
      existing.statement === statement &&
      existing.certificate_key === certificateKey;
    if (unchanged) return toVendorEcoDeclaration(existing);

    const wasApproved = existing?.status === EcoDeclarationStatus.approved;
    const saved = await this.store.save({
      ...(existing ?? {}),
      product_id: productId,
      vendor_id: vendorId,
      status: EcoDeclarationStatus.pending,
      statement,
      certificate_key: certificateKey,
      certificate_filename: certificateFilename,
      declared_by: userId,
      submitted_at: this.now(),
      reviewed_by: null,
      reviewed_at: null,
      rejection_reason: null,
    });
    if (wasApproved) await this.reindex(productId);
    return toVendorEcoDeclaration(saved);
  }

  async withdraw(productId: string, vendorId: string) {
    await this.assertOwner(productId, vendorId);
    const existing = await this.store.findByProduct(productId);
    if (!existing || existing.status === EcoDeclarationStatus.withdrawn) {
      return toVendorEcoDeclaration(existing);
    }
    const wasApproved = existing.status === EcoDeclarationStatus.approved;
    const saved = await this.store.save({ ...existing, status: EcoDeclarationStatus.withdrawn });
    if (wasApproved) await this.reindex(productId);
    return toVendorEcoDeclaration(saved);
  }

  async certificateUrlForVendor(productId: string, vendorId: string) {
    await this.assertOwner(productId, vendorId);
    const row = await this.store.findByProduct(productId);
    if (!row?.certificate_key) {
      throw new HttpError(404, "No certificate on this declaration", "ECO_CERTIFICATE_NOT_FOUND");
    }
    return this.signedUrl(row.certificate_key);
  }

  // ─── Admin review queue ────────────────────────────────────────────

  async adminList(filters: AdminListFilters) {
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
    const status =
      filters.status && filters.status !== "all"
        ? (Object.values(EcoDeclarationStatus) as string[]).includes(filters.status)
          ? (filters.status as EcoDeclarationStatus)
          : undefined
        : undefined;
    if (filters.status && filters.status !== "all" && !status) {
      throw new HttpError(422, `Unknown status: ${filters.status}`, "ECO_STATUS_INVALID");
    }
    const { items, total } = await this.store.adminList({
      status,
      q: cleanText(filters.q) ?? undefined,
      page,
      limit,
    });
    return { items, total, page, limit, hasMore: page * limit < total };
  }

  async adminGet(id: string) {
    const row = await this.store.adminDetail(id);
    if (!row) throw new HttpError(404, "Declaration not found", "ECO_DECLARATION_NOT_FOUND");
    return row;
  }

  private async loadForReview(id: string): Promise<EcoDeclarationRow> {
    const row = await this.store.findById(id);
    if (!row) throw new HttpError(404, "Declaration not found", "ECO_DECLARATION_NOT_FOUND");
    if (row.status === EcoDeclarationStatus.withdrawn) {
      throw new HttpError(409, "The vendor withdrew this declaration", "ECO_DECLARATION_WITHDRAWN");
    }
    return row;
  }

  /** Idempotent: approving an approved declaration returns it unchanged. */
  async approve(id: string, reviewerId: string) {
    const row = await this.loadForReview(id);
    if (row.status === EcoDeclarationStatus.approved) return row;
    const saved = await this.store.save({
      ...row,
      status: EcoDeclarationStatus.approved,
      reviewed_by: reviewerId,
      reviewed_at: this.now(),
      rejection_reason: null,
    });
    await this.reindex(row.product_id);
    return saved;
  }

  async reject(id: string, reviewerId: string, reason: string) {
    const cleaned = cleanText(reason);
    if (!cleaned || cleaned.length < MIN_REJECTION_REASON_LENGTH) {
      throw new HttpError(422, "Give the vendor a reason", "ECO_REJECTION_REASON_REQUIRED");
    }
    const row = await this.loadForReview(id);
    const wasApproved = row.status === EcoDeclarationStatus.approved;
    const saved = await this.store.save({
      ...row,
      status: EcoDeclarationStatus.rejected,
      reviewed_by: reviewerId,
      reviewed_at: this.now(),
      rejection_reason: cleaned.slice(0, MAX_STATEMENT_LENGTH),
    });
    if (wasApproved) await this.reindex(row.product_id);
    return saved;
  }

  async adminCertificateUrl(id: string) {
    const row = await this.store.findById(id);
    if (!row?.certificate_key) {
      throw new HttpError(404, "No certificate on this declaration", "ECO_CERTIFICATE_NOT_FOUND");
    }
    return this.signedUrl(row.certificate_key);
  }
}
