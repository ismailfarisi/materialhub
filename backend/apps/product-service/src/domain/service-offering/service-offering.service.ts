import { ServiceOfferingStatus } from "@materialhub/database";
import type { ServiceOffering, ServiceOfferingTranslation, Vendor } from "@materialhub/database";
import { BadRequestError, NotFoundError } from "@materialhub/plugins";
import type { Repository } from "typeorm";
import { enqueueServiceSearchSync } from "../service-search/service-search-sync.job.ts";

export interface CreateServiceOfferingInput {
  name: string;
  category_id?: string | null;
  description?: string | null;
  media_urls?: string[];
  duration_minutes: number;
  buffer_before_minutes?: number;
  buffer_after_minutes?: number;
  slot_step_minutes?: number;
  location_mode?: "at_premises" | "home_visit" | "either";
  payment_mode?: "prepay" | "deposit" | "pay_at_venue";
  price_fils: number;
  deposit_type?: "percent" | "fixed" | "none";
  deposit_value?: number;
  vat_rate?: number;
  min_notice_minutes?: number;
  max_advance_days?: number;
  cancellation_window_hours?: number;
  cancellation_refund_policy?: "full" | "deposit_forfeit" | "percent";
  cancellation_penalty_percent?: number;
  reschedule_window_hours?: number;
  auto_approve?: boolean;
}

// `status` deliberately excludes pending_review and rejected: those are set by
// the approval workflow, never requested by a vendor. UpdateServiceOfferingBody
// enforces the same narrowing at the wire boundary.
export type UpdateServiceOfferingInput = Partial<CreateServiceOfferingInput> & {
  status?: "draft" | "published" | "paused" | "archived";
};

// What GET /vendor/services returns: the offering plus the server's verdict on
// what a Publish request would do right now. Vendor-facing only — the admin and
// public reads have no use for it.
export type VendorServiceOffering = ServiceOffering & {
  publish_requires_review: boolean;
};

export interface AdminOfferingQuery {
  page?: number;
  limit?: number;
  status?: string;
  vendorId?: string;
  search?: string;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export class ServiceOfferingService {
  constructor(
    private readonly offeringRepo: Repository<ServiceOffering>,
    private readonly translationRepo: Repository<ServiceOfferingTranslation>,
    private readonly vendorRepo: Repository<Vendor>,
    // Injected so unit tests can observe the enqueue without a live Redis.
    // Every write path calls this AFTER a successful save — a failed write
    // must never schedule an index update.
    private readonly onWrite: (offeringId: string) => Promise<void> = (offeringId) =>
      enqueueServiceSearchSync({ type: "upsert_offering", offeringId }),
  ) {}

  async create(vendorId: string, body: CreateServiceOfferingInput): Promise<ServiceOffering> {
    // A random suffix keeps the slug unique under the partial unique index
    // (WHERE deleted_at IS NULL) without a read-modify-write race.
    const suffix = crypto.randomUUID().slice(0, 8);
    const base = slugify(body.name) || "service";
    const offering = this.offeringRepo.create({
      ...body,
      vendor_id: vendorId,
      slug: `${base}-${suffix}`,
    } as Partial<ServiceOffering>);
    const saved = await this.offeringRepo.save(offering);
    await this.onWrite(saved.id);
    return saved;
  }

  async update(
    vendorId: string,
    id: string,
    body: UpdateServiceOfferingInput,
  ): Promise<ServiceOffering> {
    const offering = await this.offeringRepo.findOne({ where: { id, vendor_id: vendorId } });
    if (!offering) throw new NotFoundError("Service offering not found");

    Object.assign(offering, body);

    // The approval gate. A vendor asking to publish is only granted it if the
    // vendor has already had an offering approved; otherwise the request
    // becomes a review request. Every other status transition is unaffected.
    if (body.status === "published") {
      const vendor = await this.vendorRepo.findOne({ where: { id: vendorId } });
      if (!vendor?.services_trusted) {
        offering.status = ServiceOfferingStatus.pending_review;
        // A resubmission supersedes the previous decision.
        offering.rejection_reason = null;
      }
    }

    const saved = await this.offeringRepo.save(offering);
    await this.onWrite(saved.id);
    return saved;
  }

  // Each row carries `publish_requires_review` so the dashboard can tell the
  // vendor what Publish will actually do. The gate lives in update() above; if
  // the client re-derived it from a raw `services_trusted` flag the two would
  // drift, which is exactly how the "bookable immediately" copy came to lie to
  // untrusted vendors whose publish was being rewritten to pending_review.
  async listForVendor(vendorId: string): Promise<VendorServiceOffering[]> {
    const [offerings, vendor] = await Promise.all([
      this.offeringRepo.find({
        where: { vendor_id: vendorId },
        order: { created_at: "DESC" },
      }),
      this.vendorRepo.findOne({ where: { id: vendorId } }),
    ]);

    // A missing vendor row is treated as untrusted: the pessimistic branch only
    // costs an unnecessary review, while the optimistic one would promise the
    // vendor an instant publish the server will not honour.
    const requiresReview = !vendor?.services_trusted;
    return offerings.map((o) => ({ ...o, publish_requires_review: requiresReview }));
  }

  async getPublishedBySlug(slug: string): Promise<ServiceOffering> {
    const offering = await this.offeringRepo.findOne({
      where: { slug, status: "published" as ServiceOffering["status"] },
    });
    if (!offering) throw new NotFoundError("Service offering not found");
    return offering;
  }

  /**
   * Public id-keyed counterpart to getPublishedBySlug — same published-only
   * rule, same shape. Added for the storefront reschedule flow: a Booking
   * row only carries service_offering_id (no slug), and the only other
   * public offering read is slug-based, so the customer's my-bookings
   * detail page needs an id-keyed lookup to re-drive the availability
   * picker for a reschedule.
   */
  async getPublishedById(id: string): Promise<ServiceOffering> {
    const offering = await this.offeringRepo.findOne({
      where: { id, status: "published" as ServiceOffering["status"] },
    });
    if (!offering) throw new NotFoundError("Service offering not found");
    return offering;
  }

  // ─── Admin approval surface ──────────────────────────────────────────
  // Cross-vendor reads. Deliberately separate from listForVendor(), which is
  // vendor-scoped — no shared code path can accidentally drop the scoping.

  async adminList(query: AdminOfferingQuery): Promise<{ data: ServiceOffering[]; total: number }> {
    const page = query.page || 1;
    const limit = query.limit || 20;

    const qb = this.offeringRepo
      .createQueryBuilder("offering")
      .orderBy("offering.created_at", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    if (query.status) {
      qb.andWhere("offering.status = :status", { status: query.status });
    }
    if (query.vendorId) {
      qb.andWhere("offering.vendor_id = :vendorId", { vendorId: query.vendorId });
    }
    if (query.search) {
      qb.andWhere("offering.name ILIKE :search", { search: `%${query.search}%` });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async adminGetById(id: string): Promise<ServiceOffering | null> {
    return this.offeringRepo.findOne({ where: { id } });
  }

  async approve(id: string, adminUserId: string): Promise<ServiceOffering> {
    const offering = await this.offeringRepo.findOne({ where: { id } });
    if (!offering) throw new NotFoundError("Service offering not found");
    if (offering.status !== ServiceOfferingStatus.pending_review) {
      throw new BadRequestError(
        `Only offerings awaiting review can be approved (current status: ${offering.status})`,
      );
    }

    offering.status = ServiceOfferingStatus.published;
    offering.rejection_reason = null;
    offering.reviewed_at = new Date();
    offering.reviewed_by = adminUserId;
    const saved = await this.offeringRepo.save(offering);

    // First approval trusts the vendor for every future offering. Idempotent:
    // re-approving a already-trusted vendor's offering is a no-op write.
    await this.vendorRepo.update(offering.vendor_id, { services_trusted: true });

    await this.onWrite(saved.id);

    return saved;
  }

  async reject(id: string, adminUserId: string, reason: string): Promise<ServiceOffering> {
    const trimmed = reason?.trim();
    if (!trimmed) throw new BadRequestError("A rejection reason is required");

    const offering = await this.offeringRepo.findOne({ where: { id } });
    if (!offering) throw new NotFoundError("Service offering not found");
    if (offering.status !== ServiceOfferingStatus.pending_review) {
      throw new BadRequestError(
        `Only offerings awaiting review can be rejected (current status: ${offering.status})`,
      );
    }

    offering.status = ServiceOfferingStatus.rejected;
    offering.rejection_reason = trimmed;
    offering.reviewed_at = new Date();
    offering.reviewed_by = adminUserId;
    // Rejection does NOT change services_trusted — the vendor stays gated.
    const saved = await this.offeringRepo.save(offering);
    await this.onWrite(saved.id);
    return saved;
  }
}
