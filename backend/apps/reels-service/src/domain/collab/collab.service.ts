import {
  AppDataSource,
  CollabActor,
  CollabApplication,
  CollabApplicationStatus,
  type CollabDeliverable,
  CollabEvent,
  CollabEventType,
  CollabOpportunity,
  CollabOpportunityStatus,
  CollabOpportunityType,
  CollabVisibility,
  CreatorApplication,
  CreatorApplicationStatus,
  Product,
  ProductImage,
  ReelLicenseEscrowHold,
  type ReelLicenseFundingSource,
  type ReelLicenseGrant,
  ReelLicenseHoldStatus,
  ReelLicenseRightsScope,
  SiteSetting,
  type SocialPlatform,
  User,
  UserAddress,
  Vendor,
  VendorLocation,
} from "@materialhub/database";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "@materialhub/plugins";
import { Between, type EntityManager, In, IsNull, LessThanOrEqual } from "typeorm";
import type { DealLink, EscrowEngine } from "../licensing/escrow-engine.ts";
import {
  type CreatorProfile,
  type EligibilityRequirements,
  type EligibilityResult,
  evaluateEligibility,
} from "./eligibility.ts";
import { type VendorFacingApplication, toVendorFacingApplications } from "./serializers.ts";

export interface BoardRow {
  opportunity: HydratedOpportunity;
  eligibility?: EligibilityResult;
}

export interface HydratedOpportunity extends CollabOpportunity {
  vendor_name: string | null;
  vendor_logo_url: string | null;
  seeded_product_name: string | null;
  seeded_product_image_url: string | null;
}

/** Batch-resolves vendor and seeded-product identity, same pattern as hydrateFeedReelTags. */
async function hydrateOpportunityNames(rows: CollabOpportunity[]): Promise<HydratedOpportunity[]> {
  const vendorIds = Array.from(new Set(rows.map((r) => r.vendor_id)));
  const productIds = Array.from(
    new Set(rows.map((r) => r.seeded_product_id).filter((id): id is string => id != null)),
  );
  const [vendors, products, images] = await Promise.all([
    vendorIds.length > 0
      ? AppDataSource.getRepository(Vendor).find({ where: { id: In(vendorIds) } })
      : Promise.resolve([]),
    productIds.length > 0
      ? AppDataSource.getRepository(Product).find({ where: { id: In(productIds) } })
      : Promise.resolve([]),
    productIds.length > 0
      ? AppDataSource.getRepository(ProductImage).find({
          where: { product_id: In(productIds) },
          order: { is_primary: "DESC", sort_order: "ASC" },
        })
      : Promise.resolve([]),
  ]);
  const vendorNameById = new Map(vendors.map((v) => [v.id, v.business_name]));
  const vendorLogoById = new Map(vendors.map((v) => [v.id, v.logo_url]));
  const productNameById = new Map(products.map((p) => [p.id, p.name]));
  const imageByProduct = new Map<string, string>();
  for (const img of images) {
    if (!imageByProduct.has(img.product_id)) {
      imageByProduct.set(img.product_id, img.medium_url ?? img.url);
    }
  }
  return rows.map((r) => ({
    ...r,
    vendor_name: vendorNameById.get(r.vendor_id) ?? null,
    vendor_logo_url: vendorLogoById.get(r.vendor_id) ?? null,
    seeded_product_name: r.seeded_product_id
      ? (productNameById.get(r.seeded_product_id) ?? null)
      : null,
    seeded_product_image_url: r.seeded_product_id
      ? (imageByProduct.get(r.seeded_product_id) ?? null)
      : null,
  }));
}

export interface CreatorApplicationRow {
  application: CollabApplication;
  opportunity: HydratedOpportunity | null;
}

export interface HydratedApplication extends CollabApplication {
  creator_name: string | null;
  creator_avatar_url: string | null;
}

/** Batch-resolves the applicant's display name + avatar, same pattern as hydrateOpportunityNames. */
async function hydrateApplicationCreators(
  rows: CollabApplication[],
): Promise<HydratedApplication[]> {
  const creatorIds = Array.from(new Set(rows.map((r) => r.creator_id)));
  const users =
    creatorIds.length > 0
      ? await AppDataSource.getRepository(User).find({ where: { id: In(creatorIds) } })
      : [];
  const nameById = new Map(users.map((u) => [u.id, `${u.first_name} ${u.last_name}`.trim()]));
  const avatarById = new Map(users.map((u) => [u.id, u.avatar_url]));
  return rows.map((r) => ({
    ...r,
    creator_name: nameById.get(r.creator_id) ?? null,
    creator_avatar_url: avatarById.get(r.creator_id) ?? null,
  }));
}

export interface CreateOpportunityInput {
  vendorId: string;
  type: CollabOpportunityType;
  visibility: CollabVisibility;
  title: string;
  description: string;
  deliverables?: CollabDeliverable[] | null;
  slotsTotal?: number;
  applicationsCloseAt?: Date | null;
  deliverBy?: Date | null;
  minFollowerCount?: number | null;
  requiredPlatforms?: SocialPlatform[] | null;
  requiredCategories?: string[] | null;
  rightsScope?: ReelLicenseRightsScope | null;
  // paid_campaign
  feeFils?: number | null;
  fundingSource?: ReelLicenseFundingSource | null;
  // product_seeding
  seededProductId?: string | null;
  seededVariantId?: string | null;
  seededQty?: number | null;
  seedingValueFils?: number | null;
  // event_appearance
  locationId?: string | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
}

export type UpdateOpportunityInput = Partial<Omit<CreateOpportunityInput, "vendorId" | "type">>;

/** Types whose money path does not exist yet. Phase 3 removes `paid_campaign`,
 *  Phase 4 removes `event_appearance`. Until then the service refuses to create
 *  opportunities that could never be accepted. */
const UNAVAILABLE_TYPES: ReadonlySet<CollabOpportunityType> = new Set<CollabOpportunityType>();

/** Same key and default the brief flow uses — collabs must not invent a second
 *  platform fee. */
const SETTING = { feeRate: "reels_license_platform_fee_rate" };
const DEFAULTS = { feeRate: 0.2 };

/** Statuses in which a paid_campaign application is holding vendor funds. */
const HOLDING_STATUSES: readonly CollabApplicationStatus[] = [
  CollabApplicationStatus.accepted,
  CollabApplicationStatus.in_progress,
  CollabApplicationStatus.delivered,
  CollabApplicationStatus.revision_requested,
];

/** Days a shipped-but-unconfirmed seeding collab waits before the sweep expires it. */
export const SEEDING_RECEIPT_TIMEOUT_DAYS = 21;

/** Days an unanswered direct invitation stays open before the sweep expires it. */
export const INVITE_TTL_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Statuses that mean a creator is committed to the work. */
const COMMITTED_STATUSES: readonly CollabApplicationStatus[] = [
  CollabApplicationStatus.accepted,
  CollabApplicationStatus.in_progress,
  CollabApplicationStatus.delivered,
  CollabApplicationStatus.revision_requested,
  CollabApplicationStatus.completed,
];

/**
 * Vendor collaboration opportunities (spec §7).
 *
 * Mirrors BriefService: every mutation runs inside `AppDataSource.transaction`,
 * takes a `pessimistic_write` lock on the opportunity row, and appends to the
 * immutable `collab_events` trail before returning.
 */
/**
 * Producer side of the shared cross-service "notification-events" BullMQ queue.
 *
 * The queue NAME is the contract between services, not a shared TS import —
 * order-service, product-service and booking-service each hold their own
 * lightweight handle to it the same way. notification-service's consumer turns
 * `{ userId, notificationType, variables }` into a preference-aware fan-out
 * across in-app, email, push and WhatsApp.
 */
export interface NotificationEventQueueLike {
  add(
    name: string,
    data: Record<string, unknown>,
    opts?: Record<string, unknown>,
  ): Promise<unknown>;
}

export class CollabService {
  constructor(
    private readonly escrow: EscrowEngine,
    /** Absent in tests and in any context with no Redis; every emit is
     *  best-effort, so a missing queue simply means no notification. */
    private readonly notificationEvents?: NotificationEventQueueLike,
  ) {}

  /**
   * Best-effort notification emit. Never throws: a creator's invite row is
   * already committed by the time this runs, and a Redis blip must not fail
   * the vendor's invite call or roll anything back.
   */
  private async emitNotification(
    userId: string,
    notificationType: string,
    variables: Record<string, string>,
    eventId: string,
  ): Promise<void> {
    if (!this.notificationEvents) return;
    try {
      await this.notificationEvents.add("event", {
        userId,
        notificationType,
        variables,
        // The consumer passes eventId through as the dispatch job id, so a
        // retried invite cannot notify the same creator twice.
        eventId,
      });
    } catch (err) {
      console.error("[collab] notification emit failed", {
        userId,
        notificationType,
        error: String(err),
      });
    }
  }

  private async setting(key: string, fallback: number): Promise<number> {
    const row = await AppDataSource.getRepository(SiteSetting).findOne({ where: { key } });
    const n = Number(row?.value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  private static link(applicationId: string): DealLink {
    return { collabApplicationId: applicationId };
  }

  /** True when this collab type moves money through escrow. */
  private static isEscrowed(type: CollabOpportunityType): boolean {
    return (
      type === CollabOpportunityType.paid_campaign ||
      type === CollabOpportunityType.event_appearance
    );
  }

  /**
   * True when the collab is expected to produce a reel.
   *
   * An event appearance does not: the creator turns up in person. That is the
   * one distinction that decides whether settlement produces a ReelLicenseGrant
   * (rights over a reel) or a bare wallet credit.
   */
  private static producesReel(type: CollabOpportunityType): boolean {
    return type !== CollabOpportunityType.event_appearance;
  }

  /**
   * Release any active hold for an application that is giving up its slot.
   * Safe to call unconditionally: returns false when there was nothing held.
   */
  private async releaseIfHolding(
    manager: EntityManager,
    opp: CollabOpportunity,
    app: CollabApplication,
  ): Promise<void> {
    if (!CollabService.isEscrowed(opp.type)) return;
    if (!HOLDING_STATUSES.includes(app.status)) return;
    await this.escrow.releaseActiveHold(manager, CollabService.link(app.id));
  }

  private async recordEvent(
    manager: EntityManager,
    input: {
      opportunityId: string;
      applicationId?: string | null;
      actor: CollabActor;
      actorUserId?: string | null;
      eventType: CollabEventType;
      amountFils?: number | null;
      note?: string | null;
      metadata?: Record<string, unknown> | null;
    },
  ): Promise<void> {
    const repo = manager.getRepository(CollabEvent);
    await repo.save(
      repo.create({
        opportunity_id: input.opportunityId,
        application_id: input.applicationId ?? null,
        actor: input.actor,
        actor_user_id: input.actorUserId ?? null,
        event_type: input.eventType,
        amount_fils_snapshot:
          input.amountFils === undefined || input.amountFils === null
            ? null
            : String(input.amountFils),
        note: input.note ?? null,
        metadata: input.metadata ?? null,
      }),
    );
  }

  private async lockOpportunity(
    manager: EntityManager,
    opportunityId: string,
  ): Promise<CollabOpportunity> {
    const opp = await manager
      .getRepository(CollabOpportunity)
      .findOne({ where: { id: opportunityId }, lock: { mode: "pessimistic_write" } });
    if (!opp) throw new NotFoundError("opportunity_not_found");
    return opp;
  }

  private assertOwner(opp: CollabOpportunity, vendorId: string): void {
    if (opp.vendor_id !== vendorId) throw new ForbiddenError("not_your_opportunity");
  }

  /**
   * Type-specific required fields. Mirrors the `ck_collab_type_fields` CHECK so
   * callers get a named error instead of a raw constraint violation — the DB
   * remains the actual guarantee.
   */
  private assertTypeFields(
    type: CollabOpportunityType,
    o: {
      feeFils?: number | null;
      fundingSource?: ReelLicenseFundingSource | null;
      seededProductId?: string | null;
      seededQty?: number | null;
      locationId?: string | null;
      startsAt?: Date | null;
      endsAt?: Date | null;
    },
  ): void {
    if (type === CollabOpportunityType.product_seeding) {
      if (!o.seededProductId) throw new BadRequestError("seeded_product_required");
      if (!o.seededQty || o.seededQty <= 0) throw new BadRequestError("seeded_qty_required");
      return;
    }
    if (type === CollabOpportunityType.paid_campaign) {
      if (!o.feeFils || o.feeFils <= 0) throw new BadRequestError("fee_required");
      if (!o.fundingSource) throw new BadRequestError("funding_source_required");
      return;
    }
    if (type === CollabOpportunityType.event_appearance) {
      if (!o.locationId) throw new BadRequestError("location_required");
      if (!o.startsAt || !o.endsAt) throw new BadRequestError("slot_required");
      if (o.endsAt.getTime() <= o.startsAt.getTime()) {
        throw new BadRequestError("slot_end_before_start");
      }
      return;
    }
    throw new BadRequestError("unknown_collab_type");
  }

  async createOpportunity(input: CreateOpportunityInput): Promise<CollabOpportunity> {
    if (UNAVAILABLE_TYPES.has(input.type)) {
      throw new BadRequestError("collab_type_not_available");
    }
    this.assertTypeFields(input.type, input);

    if (input.type === CollabOpportunityType.event_appearance) {
      // The venue must be the vendor's own. Note this is the ENTIRE extent of the
      // booking-service reuse: an appearance deliberately does NOT go through the
      // availability engine or the bookings table (spec §7.6). Those model a
      // customer booking a staff member against working hours and a capacity
      // ledger; a creator is not a staff member, and forcing one in would corrupt
      // availability and capacity maths for real service bookings.
      const location = await AppDataSource.getRepository(VendorLocation).findOne({
        where: { id: input.locationId as string },
      });
      if (!location) throw new NotFoundError("location_not_found");
      if (location.vendor_id !== input.vendorId) throw new ForbiddenError("not_your_location");
    }

    const slotsTotal = input.slotsTotal ?? 1;
    if (slotsTotal <= 0) throw new BadRequestError("slots_total_invalid");

    return AppDataSource.transaction(async (manager) => {
      const repo = manager.getRepository(CollabOpportunity);
      const opp = await repo.save(
        repo.create({
          vendor_id: input.vendorId,
          type: input.type,
          visibility: input.visibility,
          status: CollabOpportunityStatus.draft,
          title: input.title,
          description: input.description,
          deliverables: input.deliverables ?? null,
          slots_total: slotsTotal,
          slots_filled: 0,
          applications_close_at: input.applicationsCloseAt ?? null,
          deliver_by: input.deliverBy ?? null,
          min_follower_count: input.minFollowerCount ?? null,
          required_platforms: input.requiredPlatforms ?? null,
          required_categories: input.requiredCategories ?? null,
          rights_scope: input.rightsScope ?? null,
          fee_fils: input.feeFils != null ? String(input.feeFils) : null,
          funding_source: input.fundingSource ?? null,
          seeded_product_id: input.seededProductId ?? null,
          seeded_variant_id: input.seededVariantId ?? null,
          seeded_qty: input.seededQty ?? null,
          seeding_value_fils:
            input.seedingValueFils != null ? String(input.seedingValueFils) : null,
          location_id: input.locationId ?? null,
          starts_at: input.startsAt ?? null,
          ends_at: input.endsAt ?? null,
        }),
      );
      await this.recordEvent(manager, {
        opportunityId: opp.id,
        actor: CollabActor.vendor,
        actorUserId: null,
        eventType: CollabEventType.created,
      });
      return opp;
    });
  }

  async updateOpportunity(
    vendorId: string,
    opportunityId: string,
    patch: UpdateOpportunityInput,
  ): Promise<CollabOpportunity> {
    return AppDataSource.transaction(async (manager) => {
      const opp = await this.lockOpportunity(manager, opportunityId);
      this.assertOwner(opp, vendorId);
      if (
        opp.status !== CollabOpportunityStatus.draft &&
        opp.status !== CollabOpportunityStatus.open
      ) {
        throw new ConflictError("opportunity_not_editable");
      }

      // Type is immutable: the type-specific columns and the CHECK are built
      // around it, and an accepted creator agreed to a specific kind of work.
      const merged = {
        feeFils: patch.feeFils ?? (opp.fee_fils != null ? Number(opp.fee_fils) : null),
        fundingSource: patch.fundingSource ?? opp.funding_source,
        seededProductId: patch.seededProductId ?? opp.seeded_product_id,
        seededQty: patch.seededQty ?? opp.seeded_qty,
        locationId: patch.locationId ?? opp.location_id,
        startsAt: patch.startsAt ?? opp.starts_at,
        endsAt: patch.endsAt ?? opp.ends_at,
      };
      this.assertTypeFields(opp.type, merged);

      if (patch.slotsTotal !== undefined) {
        if (patch.slotsTotal <= 0) throw new BadRequestError("slots_total_invalid");
        if (patch.slotsTotal < opp.slots_filled) {
          throw new ConflictError("slots_total_below_filled");
        }
        opp.slots_total = patch.slotsTotal;
      }

      if (patch.title !== undefined) opp.title = patch.title;
      if (patch.description !== undefined) opp.description = patch.description;
      if (patch.deliverables !== undefined) opp.deliverables = patch.deliverables ?? null;
      if (patch.applicationsCloseAt !== undefined) {
        opp.applications_close_at = patch.applicationsCloseAt ?? null;
      }
      if (patch.deliverBy !== undefined) opp.deliver_by = patch.deliverBy ?? null;
      if (patch.minFollowerCount !== undefined) {
        opp.min_follower_count = patch.minFollowerCount ?? null;
      }
      if (patch.requiredPlatforms !== undefined) {
        opp.required_platforms = patch.requiredPlatforms ?? null;
      }
      if (patch.requiredCategories !== undefined) {
        opp.required_categories = patch.requiredCategories ?? null;
      }
      if (patch.rightsScope !== undefined) opp.rights_scope = patch.rightsScope ?? null;
      if (patch.feeFils !== undefined) {
        opp.fee_fils = patch.feeFils != null ? String(patch.feeFils) : null;
      }
      if (patch.fundingSource !== undefined) opp.funding_source = patch.fundingSource ?? null;
      if (patch.seededProductId !== undefined) {
        opp.seeded_product_id = patch.seededProductId ?? null;
      }
      if (patch.seededVariantId !== undefined) {
        opp.seeded_variant_id = patch.seededVariantId ?? null;
      }
      if (patch.seededQty !== undefined) opp.seeded_qty = patch.seededQty ?? null;
      if (patch.seedingValueFils !== undefined) {
        opp.seeding_value_fils =
          patch.seedingValueFils != null ? String(patch.seedingValueFils) : null;
      }
      if (patch.locationId !== undefined) opp.location_id = patch.locationId ?? null;
      if (patch.startsAt !== undefined) opp.starts_at = patch.startsAt ?? null;
      if (patch.endsAt !== undefined) opp.ends_at = patch.endsAt ?? null;

      return manager.getRepository(CollabOpportunity).save(opp);
    });
  }

  async publishOpportunity(vendorId: string, opportunityId: string): Promise<CollabOpportunity> {
    return AppDataSource.transaction(async (manager) => {
      const opp = await this.lockOpportunity(manager, opportunityId);
      this.assertOwner(opp, vendorId);
      if (opp.status !== CollabOpportunityStatus.draft) {
        throw new ConflictError("opportunity_not_draft");
      }
      // A board post with no closing date can never expire, so it would sit open
      // forever and the sweep job would never reach it.
      if (opp.visibility === CollabVisibility.board && !opp.applications_close_at) {
        throw new BadRequestError("close_date_required");
      }

      opp.status = CollabOpportunityStatus.open;
      const saved = await manager.getRepository(CollabOpportunity).save(opp);
      await this.recordEvent(manager, {
        opportunityId: opp.id,
        actor: CollabActor.vendor,
        eventType: CollabEventType.published,
      });
      return saved;
    });
  }

  async cancelOpportunity(vendorId: string, opportunityId: string): Promise<void> {
    await AppDataSource.transaction(async (manager) => {
      const opp = await this.lockOpportunity(manager, opportunityId);
      this.assertOwner(opp, vendorId);
      if (
        opp.status === CollabOpportunityStatus.cancelled ||
        opp.status === CollabOpportunityStatus.completed
      ) {
        throw new ConflictError("opportunity_not_cancellable");
      }

      // Cancelling out from under an accepted creator is a broken promise. The
      // vendor must reject those applications first — a visible act with its own
      // event — before the opportunity itself can go.
      const committed = await manager.getRepository(CollabApplication).count({
        where: COMMITTED_STATUSES.map((status) => ({
          opportunity_id: opportunityId,
          status,
        })),
      });
      if (committed > 0) throw new ConflictError("has_accepted_applications");

      opp.status = CollabOpportunityStatus.cancelled;
      await manager.getRepository(CollabOpportunity).save(opp);
      await this.recordEvent(manager, {
        opportunityId: opp.id,
        actor: CollabActor.vendor,
        eventType: CollabEventType.cancelled,
      });
    });
  }

  async listForVendor(
    vendorId: string,
    filter: { status?: CollabOpportunityStatus; type?: CollabOpportunityType } = {},
  ): Promise<CollabOpportunity[]> {
    return AppDataSource.getRepository(CollabOpportunity).find({
      where: {
        vendor_id: vendorId,
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.type ? { type: filter.type } : {}),
      },
      order: { created_at: "DESC" },
    });
  }

  /**
   * Cross-vendor admin oversight list. Unlike `listForVendor`, `vendorId` here
   * is an optional filter rather than the caller's own scope — the route
   * guards this with requireRole("admin", "super_admin").
   */
  async listAllForAdmin(
    filter: {
      status?: CollabOpportunityStatus;
      type?: CollabOpportunityType;
      vendorId?: string;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<{ items: HydratedOpportunity[]; total: number; page: number; limit: number }> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const [rows, total] = await AppDataSource.getRepository(CollabOpportunity).findAndCount({
      where: {
        ...(filter.vendorId ? { vendor_id: filter.vendorId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.type ? { type: filter.type } : {}),
      },
      order: { created_at: "DESC" },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items: await hydrateOpportunityNames(rows), total, page, limit };
  }

  async getOpportunityForAdmin(
    opportunityId: string,
  ): Promise<{ opportunity: HydratedOpportunity; applications: VendorFacingApplication[] }> {
    const opportunity = await this.getOpportunity(opportunityId);
    // A single-element input always yields a single-element output — see
    // hydrateOpportunityNames, which maps 1:1 over its input rows.
    const [hydrated] = await hydrateOpportunityNames([opportunity]);
    if (!hydrated) throw new NotFoundError("opportunity_not_found");
    const applications = await AppDataSource.getRepository(CollabApplication).find({
      where: { opportunity_id: opportunityId },
      order: { created_at: "DESC" },
    });
    const hydratedApps = await hydrateApplicationCreators(applications);
    return { opportunity: hydrated, applications: toVendorFacingApplications(hydratedApps) };
  }

  async getOpportunity(opportunityId: string): Promise<CollabOpportunity> {
    const opp = await AppDataSource.getRepository(CollabOpportunity).findOne({
      where: { id: opportunityId },
    });
    if (!opp) throw new NotFoundError("opportunity_not_found");
    return opp;
  }

  async listEvents(opportunityId: string): Promise<CollabEvent[]> {
    return AppDataSource.getRepository(CollabEvent).find({
      where: { opportunity_id: opportunityId },
      order: { created_at: "ASC" },
    });
  }

  // ── Creator profile & eligibility ──────────────────────────────────────────

  /**
   * Combined audience reach for eligibility checks.
   *
   * TODO(spec §1-6): when `creator_social_accounts` exists, sum verified
   * external follower counts across connected platforms and add on-platform
   * followers. Until then on-platform followers are the only signal we have.
   * This is the ONLY function §1-6 needs to change for reach.
   */
  async resolveCreatorReach(creatorId: string): Promise<number> {
    const user = await AppDataSource.getRepository(User).findOne({ where: { id: creatorId } });
    return user?.follower_count ?? 0;
  }

  /**
   * The creator's niche categories.
   *
   * TODO(spec §1-6): the media-kit editor lets creators pick several niches.
   * Until it ships, the single `primary_category` from their approved creator
   * application is all we have.
   */
  async resolveCreatorCategories(creatorId: string): Promise<string[]> {
    const app = await AppDataSource.getRepository(CreatorApplication).findOne({
      where: { user_id: creatorId, status: CreatorApplicationStatus.approved },
    });
    return app?.primary_category ? [app.primary_category] : [];
  }

  /**
   * Platforms the creator has connected.
   *
   * TODO(spec §1-6): read from `creator_social_accounts` where
   * `sync_status != 'expired'`. Until that table exists no creator has
   * connected accounts, so an opportunity that sets `required_platforms` will
   * match nobody — which is why the vendor UI should not offer that filter
   * until §1-6 lands.
   */
  async resolveCreatorPlatforms(_creatorId: string): Promise<SocialPlatform[]> {
    return [];
  }

  async resolveCreatorProfile(creatorId: string): Promise<CreatorProfile> {
    const [reach, categories, platforms] = await Promise.all([
      this.resolveCreatorReach(creatorId),
      this.resolveCreatorCategories(creatorId),
      this.resolveCreatorPlatforms(creatorId),
    ]);
    return { reach, categories, platforms };
  }

  async evaluateEligibility(
    creatorId: string,
    opportunity: EligibilityRequirements,
  ): Promise<EligibilityResult> {
    return evaluateEligibility(await this.resolveCreatorProfile(creatorId), opportunity);
  }

  /** Open board opportunities, each with the viewer's eligibility when known. */
  async listBoard(viewerId?: string): Promise<BoardRow[]> {
    const opportunities = await hydrateOpportunityNames(
      await AppDataSource.getRepository(CollabOpportunity).find({
        where: { status: CollabOpportunityStatus.open, visibility: CollabVisibility.board },
        order: { applications_close_at: "ASC" },
      }),
    );
    if (!viewerId) return opportunities.map((opportunity) => ({ opportunity }));

    // One profile lookup for the whole page rather than one per row.
    const profile = await this.resolveCreatorProfile(viewerId);
    return opportunities.map((opportunity) => ({
      opportunity,
      eligibility: evaluateEligibility(profile, opportunity),
    }));
  }

  // ── Applications ───────────────────────────────────────────────────────────

  private async lockApplication(
    manager: EntityManager,
    applicationId: string,
  ): Promise<CollabApplication> {
    const app = await manager
      .getRepository(CollabApplication)
      .findOne({ where: { id: applicationId }, lock: { mode: "pessimistic_write" } });
    if (!app) throw new NotFoundError("application_not_found");
    return app;
  }

  private assertStatus(
    app: CollabApplication,
    allowed: readonly CollabApplicationStatus[],
    error: string,
  ): void {
    if (!allowed.includes(app.status)) throw new ConflictError(error);
  }

  /**
   * Vendor seeds `invited` applications for named creators on a direct
   * opportunity, optionally with a personal note.
   *
   * The note is the only free text a vendor can put in front of a creator
   * before the collab is accepted — it rides along with the invite
   * notification rather than opening any direct channel.
   */
  async invite(
    vendorId: string,
    opportunityId: string,
    creatorIds: string[],
    note?: string | null,
  ): Promise<CollabApplication[]> {
    if (creatorIds.length === 0) throw new BadRequestError("no_creators");
    const unique = [...new Set(creatorIds)];
    const inviteNote = (note ?? "").trim() || null;

    const { created, opportunityTitle } = await AppDataSource.transaction(async (manager) => {
      const opp = await this.lockOpportunity(manager, opportunityId);
      this.assertOwner(opp, vendorId);
      if (opp.status !== CollabOpportunityStatus.open) {
        throw new ConflictError("opportunity_not_open");
      }

      const repo = manager.getRepository(CollabApplication);
      const created: CollabApplication[] = [];
      for (const creatorId of unique) {
        const existing = await repo.findOne({
          where: { opportunity_id: opportunityId, creator_id: creatorId },
        });
        // Re-inviting someone who already has a row is a no-op, not an error —
        // the vendor should not have to diff the list they already sent.
        if (existing) continue;

        const app = await repo.save(
          repo.create({
            opportunity_id: opportunityId,
            creator_id: creatorId,
            status: CollabApplicationStatus.invited,
            invite_note: inviteNote,
            revision_count: 0,
          }),
        );
        await this.recordEvent(manager, {
          opportunityId,
          applicationId: app.id,
          actor: CollabActor.vendor,
          eventType: CollabEventType.invited,
        });
        created.push(app);
      }

      return { created, opportunityTitle: opp.title ?? "" };
    });

    // Notified after commit, deliberately: a notification for a row that then
    // rolled back would be a lie. Nothing below can throw — the invite is
    // already the vendor's successful result.
    if (created.length > 0 && this.notificationEvents) {
      const vendorName = await this.lookupVendorName(vendorId);
      for (const app of created) {
        await this.emitNotification(
          app.creator_id,
          "collab_invited",
          {
            vendor_name: vendorName,
            opportunity_title: opportunityTitle,
            invite_note: inviteNote ?? "",
          },
          `collab_invited_${app.id}`,
        );
      }
    }

    return created;
  }

  /** Display name for the invite notification. Falls back to an empty string,
   *  which the template renders as "A brand" — a name lookup is not worth
   *  failing an already-committed invite over. */
  private async lookupVendorName(vendorId: string): Promise<string> {
    try {
      const vendor = await AppDataSource.getRepository(Vendor).findOne({
        where: { id: vendorId },
      });
      return vendor?.business_name ?? "";
    } catch {
      return "";
    }
  }

  /** Creator applies to a board opportunity. */
  async apply(
    creatorId: string,
    opportunityId: string,
    input: { pitch?: string | null; proposedFeeFils?: number | null } = {},
  ): Promise<CollabApplication> {
    const profile = await this.resolveCreatorProfile(creatorId);

    return AppDataSource.transaction(async (manager) => {
      const opp = await this.lockOpportunity(manager, opportunityId);
      if (opp.status !== CollabOpportunityStatus.open) {
        throw new ConflictError("opportunity_not_open");
      }
      if (opp.visibility !== CollabVisibility.board) {
        throw new ForbiddenError("opportunity_is_invite_only");
      }
      if (opp.applications_close_at && opp.applications_close_at.getTime() <= Date.now()) {
        throw new ConflictError("applications_closed");
      }
      if (opp.slots_filled >= opp.slots_total) throw new ConflictError("no_slots_remaining");

      const { eligible, reasons } = evaluateEligibility(profile, opp);
      if (!eligible) throw new ForbiddenError(`not_eligible:${reasons.join(",")}`);

      const repo = manager.getRepository(CollabApplication);
      // The partial unique index is the real guard; this is the friendly error.
      const existing = await repo.findOne({
        where: { opportunity_id: opportunityId, creator_id: creatorId },
      });
      // A creator's own withdrawal is reversible — the unique index keeps the
      // row around, so re-applying reuses it instead of hitting "already_applied"
      // forever. Any other existing row (invited/applied/accepted/declined/...)
      // is a real conflict.
      if (existing && existing.status !== CollabApplicationStatus.withdrawn) {
        throw new ConflictError("already_applied");
      }

      const fields = {
        status: CollabApplicationStatus.applied,
        pitch: input.pitch ?? null,
        proposed_fee_fils: input.proposedFeeFils != null ? String(input.proposedFeeFils) : null,
        agreed_fee_fils: null,
        delivered_reel_id: null,
        shipping_address_id: null,
        carrier: null,
        tracking_number: null,
        shipped_at: null,
        received_at: null,
        deliver_by: null,
        revision_count: 0,
        responded_at: new Date(),
        accepted_at: null,
        delivered_at: null,
        completed_at: null,
      };
      const app = existing
        ? await repo.save(Object.assign(existing, fields))
        : await repo.save(
            repo.create({ opportunity_id: opportunityId, creator_id: creatorId, ...fields }),
          );
      await this.recordEvent(manager, {
        opportunityId,
        applicationId: app.id,
        actor: CollabActor.creator,
        actorUserId: creatorId,
        eventType: CollabEventType.applied,
      });
      return app;
    });
  }

  /** Creator accepts or declines a direct invite. */
  async respondToInvite(
    creatorId: string,
    applicationId: string,
    accept: boolean,
  ): Promise<CollabApplication> {
    return AppDataSource.transaction(async (manager) => {
      const app = await this.lockApplication(manager, applicationId);
      if (app.creator_id !== creatorId) throw new ForbiddenError("not_your_application");
      this.assertStatus(app, [CollabApplicationStatus.invited], "application_not_invited");

      const repo = manager.getRepository(CollabApplication);
      app.responded_at = new Date();

      if (!accept) {
        app.status = CollabApplicationStatus.declined;
        const saved = await repo.save(app);
        await this.recordEvent(manager, {
          opportunityId: app.opportunity_id,
          applicationId: app.id,
          actor: CollabActor.creator,
          actorUserId: creatorId,
          eventType: CollabEventType.declined,
        });
        return saved;
      }

      // Accepting an invite makes the creator available; the vendor still has to
      // accept them into a slot, which is where the slot accounting happens.
      app.status = CollabApplicationStatus.applied;
      const saved = await repo.save(app);
      await this.recordEvent(manager, {
        opportunityId: app.opportunity_id,
        applicationId: app.id,
        actor: CollabActor.creator,
        actorUserId: creatorId,
        eventType: CollabEventType.applied,
      });
      return saved;
    });
  }

  /** Vendor accepts a creator into a slot. */
  async acceptApplication(vendorId: string, applicationId: string): Promise<CollabApplication> {
    return AppDataSource.transaction(async (manager) => {
      const app = await this.lockApplication(manager, applicationId);
      // Lock the opportunity BEFORE reading slots_filled: two vendor tabs racing
      // for the last slot must serialise here, with ck_collab_slots as backstop.
      const opp = await this.lockOpportunity(manager, app.opportunity_id);
      this.assertOwner(opp, vendorId);
      this.assertStatus(
        app,
        [CollabApplicationStatus.applied, CollabApplicationStatus.invited],
        "application_not_acceptable",
      );
      if (opp.status !== CollabOpportunityStatus.open) {
        throw new ConflictError("opportunity_not_open");
      }
      if (opp.slots_filled >= opp.slots_total) throw new ConflictError("no_slots_remaining");

      app.status = CollabApplicationStatus.accepted;
      app.accepted_at = new Date();
      if (app.proposed_fee_fils) app.agreed_fee_fils = app.proposed_fee_fils;
      else if (opp.fee_fils) app.agreed_fee_fils = opp.fee_fils;
      const saved = await manager.getRepository(CollabApplication).save(app);

      opp.slots_filled += 1;
      // Remaining applicants stay `applied` — silently declining people is worse
      // than leaving them pending for the vendor or the sweep job to resolve.
      if (opp.slots_filled >= opp.slots_total) opp.status = CollabOpportunityStatus.filled;
      await manager.getRepository(CollabOpportunity).save(opp);

      // Money is committed inside the same transaction as the slot. If the hold
      // throws, the whole accept rolls back — a filled slot with no held funds is
      // the failure mode this ordering exists to prevent.
      if (CollabService.isEscrowed(opp.type)) {
        const amount = Number(app.agreed_fee_fils ?? opp.fee_fils ?? 0);
        if (!amount || amount <= 0) throw new BadRequestError("fee_not_set");
        if (!opp.funding_source) throw new BadRequestError("funding_source_not_set");
        await this.escrow.placeHold(manager, {
          vendorId,
          fundingSource: opp.funding_source,
          amountFils: amount,
          link: CollabService.link(app.id),
        });
      }

      await this.recordEvent(manager, {
        opportunityId: opp.id,
        applicationId: app.id,
        actor: CollabActor.vendor,
        eventType: CollabEventType.accepted,
        amountFils: app.agreed_fee_fils ? Number(app.agreed_fee_fils) : null,
      });
      return saved;
    });
  }

  async declineApplication(
    vendorId: string,
    applicationId: string,
    note?: string | null,
  ): Promise<void> {
    await AppDataSource.transaction(async (manager) => {
      const app = await this.lockApplication(manager, applicationId);
      const opp = await this.lockOpportunity(manager, app.opportunity_id);
      this.assertOwner(opp, vendorId);
      this.assertStatus(
        app,
        [CollabApplicationStatus.applied, CollabApplicationStatus.invited],
        "application_not_declinable",
      );

      app.status = CollabApplicationStatus.declined;
      await manager.getRepository(CollabApplication).save(app);
      await this.recordEvent(manager, {
        opportunityId: opp.id,
        applicationId: app.id,
        actor: CollabActor.vendor,
        eventType: CollabEventType.declined,
        note: note ?? null,
      });
    });
  }

  /** Creator pulls out. Frees the slot if they had already been accepted. */
  async withdraw(creatorId: string, applicationId: string): Promise<void> {
    await AppDataSource.transaction(async (manager) => {
      const app = await this.lockApplication(manager, applicationId);
      if (app.creator_id !== creatorId) throw new ForbiddenError("not_your_application");
      this.assertStatus(
        app,
        [
          CollabApplicationStatus.invited,
          CollabApplicationStatus.applied,
          CollabApplicationStatus.accepted,
          CollabApplicationStatus.in_progress,
        ],
        "application_not_withdrawable",
      );

      const priorStatus = app.status;
      const heldSlot =
        app.status === CollabApplicationStatus.accepted ||
        app.status === CollabApplicationStatus.in_progress;

      app.status = CollabApplicationStatus.withdrawn;
      await manager.getRepository(CollabApplication).save(app);

      if (heldSlot) {
        const opp = await this.lockOpportunity(manager, app.opportunity_id);
        await this.releaseIfHolding(manager, opp, { ...app, status: priorStatus });
        opp.slots_filled = Math.max(0, opp.slots_filled - 1);
        // Reopening is what lets the vendor fill the freed slot.
        if (opp.status === CollabOpportunityStatus.filled) {
          opp.status = CollabOpportunityStatus.open;
        }
        await manager.getRepository(CollabOpportunity).save(opp);
      }

      await this.recordEvent(manager, {
        opportunityId: app.opportunity_id,
        applicationId: app.id,
        actor: CollabActor.creator,
        actorUserId: creatorId,
        eventType: CollabEventType.withdrawn,
      });
    });
  }

  /** Creator links the reel that satisfies the deliverable. */
  /**
   * Creator marks the work done.
   *
   * `reelId` is required for the types that produce a reel and omitted for an
   * event appearance, where the vendor confirms attendance instead — the same
   * delivered → approved transition, with a null `delivered_reel_id`.
   */
  async submitDelivery(
    creatorId: string,
    applicationId: string,
    reelId?: string | null,
  ): Promise<CollabApplication> {
    return AppDataSource.transaction(async (manager) => {
      const app = await this.lockApplication(manager, applicationId);
      if (app.creator_id !== creatorId) throw new ForbiddenError("not_your_application");
      this.assertStatus(
        app,
        [
          CollabApplicationStatus.accepted,
          CollabApplicationStatus.in_progress,
          CollabApplicationStatus.revision_requested,
        ],
        "application_not_deliverable",
      );
      const opp = await this.lockOpportunity(manager, app.opportunity_id);
      if (CollabService.producesReel(opp.type) && !reelId) {
        throw new BadRequestError("reel_required");
      }

      app.status = CollabApplicationStatus.delivered;
      app.delivered_reel_id = reelId ?? null;
      app.delivered_at = new Date();
      const saved = await manager.getRepository(CollabApplication).save(app);
      await this.recordEvent(manager, {
        opportunityId: app.opportunity_id,
        applicationId: app.id,
        actor: CollabActor.creator,
        actorUserId: creatorId,
        eventType: CollabEventType.delivered,
        metadata: { reel_id: reelId },
      });
      return saved;
    });
  }

  async requestRevision(
    vendorId: string,
    applicationId: string,
    note: string,
  ): Promise<CollabApplication> {
    return AppDataSource.transaction(async (manager) => {
      const app = await this.lockApplication(manager, applicationId);
      const opp = await this.lockOpportunity(manager, app.opportunity_id);
      this.assertOwner(opp, vendorId);
      this.assertStatus(app, [CollabApplicationStatus.delivered], "application_not_delivered");

      app.status = CollabApplicationStatus.revision_requested;
      app.revision_count += 1;
      const saved = await manager.getRepository(CollabApplication).save(app);
      await this.recordEvent(manager, {
        opportunityId: opp.id,
        applicationId: app.id,
        actor: CollabActor.vendor,
        eventType: CollabEventType.revision_requested,
        note,
      });
      return saved;
    });
  }

  /**
   * Capture the escrowed fee for a paid_campaign and complete the application.
   *
   * Reuses EscrowEngine.captureAndComplete so a collab produces a real
   * ReelLicenseGrant over the delivered reel, on the same platform fee rate as
   * the brief flow. Status and audit writes go in `beforeCapture` so everything
   * reversible is persisted before the irreversible rail call.
   */
  private async captureCollab(
    manager: EntityManager,
    opp: CollabOpportunity,
    app: CollabApplication,
    feeRate: number,
  ): Promise<ReelLicenseGrant | null> {
    const hold = await manager.getRepository(ReelLicenseEscrowHold).findOne({
      where: { collab_application_id: app.id, status: ReelLicenseHoldStatus.held },
    });
    if (!hold) throw new ConflictError("no_active_hold");
    const amount = Number(app.agreed_fee_fils ?? opp.fee_fils ?? 0);

    const complete = async (m: EntityManager) => {
      app.status = CollabApplicationStatus.completed;
      app.completed_at = new Date();
      await m.getRepository(CollabApplication).save(app);
      await this.recordEvent(m, {
        opportunityId: opp.id,
        applicationId: app.id,
        actor: CollabActor.vendor,
        eventType: CollabEventType.settled,
        amountFils: amount,
      });
    };

    // An event appearance produces no reel, so there is nothing to grant rights
    // over. It settles straight to the creator wallet instead. The wallet's
    // LedgerContext already takes an arbitrary referenceType/referenceId pair,
    // so nothing in the wallet changes — only which capture path runs.
    if (!CollabService.producesReel(opp.type)) {
      await this.escrow.captureToWallet(manager, {
        link: CollabService.link(app.id),
        creatorId: app.creator_id,
        amountFils: amount,
        hold,
        feeRate,
        transactionType: "collab_appearance_credit",
        referenceType: "collab_application",
        referenceId: app.id,
        description: `Appearance for collab ${opp.id}`,
        beforeCapture: complete,
      });
      return null;
    }

    if (!app.delivered_reel_id) throw new ConflictError("no_delivered_reel");
    return this.escrow.captureAndComplete(manager, {
      link: CollabService.link(app.id),
      vendorId: opp.vendor_id,
      creatorId: app.creator_id,
      reelId: app.delivered_reel_id,
      scope: opp.rights_scope ?? ReelLicenseRightsScope.in_platform,
      amountFils: amount,
      hold,
      feeRate,
      beforeCapture: complete,
    });
  }

  /**
   * Vendor approves the delivery.
   *
   * Phase 1 has no money, so this simply completes. Phase 3 hangs the escrow
   * capture off this method for `paid_campaign`, and Phase 4 adds the wallet
   * settlement path for `event_appearance`.
   */
  async approveDelivery(vendorId: string, applicationId: string): Promise<CollabApplication> {
    const feeRate = await this.setting(SETTING.feeRate, DEFAULTS.feeRate);
    return AppDataSource.transaction(async (manager) => {
      const app = await this.lockApplication(manager, applicationId);
      const opp = await this.lockOpportunity(manager, app.opportunity_id);
      this.assertOwner(opp, vendorId);
      this.assertStatus(app, [CollabApplicationStatus.delivered], "application_not_delivered");

      if (CollabService.isEscrowed(opp.type)) {
        await this.captureCollab(manager, opp, app, feeRate);
      } else {
        app.status = CollabApplicationStatus.completed;
        app.completed_at = new Date();
        await manager.getRepository(CollabApplication).save(app);
      }
      const saved = app;
      await this.recordEvent(manager, {
        opportunityId: opp.id,
        applicationId: app.id,
        actor: CollabActor.vendor,
        eventType: CollabEventType.approved,
      });

      // The opportunity is done once every filled slot has completed.
      const outstanding = await manager.getRepository(CollabApplication).count({
        where: COMMITTED_STATUSES.filter((s) => s !== CollabApplicationStatus.completed).map(
          (status) => ({ opportunity_id: opp.id, status }),
        ),
      });
      if (outstanding === 0 && opp.slots_filled >= opp.slots_total) {
        opp.status = CollabOpportunityStatus.completed;
        await manager.getRepository(CollabOpportunity).save(opp);
      }
      return saved;
    });
  }

  async rejectDelivery(vendorId: string, applicationId: string, note: string): Promise<void> {
    await AppDataSource.transaction(async (manager) => {
      const app = await this.lockApplication(manager, applicationId);
      const opp = await this.lockOpportunity(manager, app.opportunity_id);
      this.assertOwner(opp, vendorId);
      this.assertStatus(
        app,
        [CollabApplicationStatus.delivered, CollabApplicationStatus.revision_requested],
        "application_not_rejectable",
      );

      await this.releaseIfHolding(manager, opp, app);
      app.status = CollabApplicationStatus.rejected;
      await manager.getRepository(CollabApplication).save(app);

      // A rejected creator releases their slot back to the vendor.
      opp.slots_filled = Math.max(0, opp.slots_filled - 1);
      if (opp.status === CollabOpportunityStatus.filled) {
        opp.status = CollabOpportunityStatus.open;
      }
      await manager.getRepository(CollabOpportunity).save(opp);

      await this.recordEvent(manager, {
        opportunityId: opp.id,
        applicationId: app.id,
        actor: CollabActor.vendor,
        eventType: CollabEventType.rejected,
        note,
      });
    });
  }

  async listApplicationsForOpportunity(
    vendorId: string,
    opportunityId: string,
  ): Promise<HydratedApplication[]> {
    const opp = await this.getOpportunity(opportunityId);
    this.assertOwner(opp, vendorId);
    const applications = await AppDataSource.getRepository(CollabApplication).find({
      where: { opportunity_id: opportunityId },
      order: { created_at: "ASC" },
    });
    return hydrateApplicationCreators(applications);
  }

  async listApplicationsForCreator(creatorId: string): Promise<CreatorApplicationRow[]> {
    const applications = await AppDataSource.getRepository(CollabApplication).find({
      where: { creator_id: creatorId },
      order: { created_at: "DESC" },
    });
    if (applications.length === 0) return [];

    const opportunityIds = Array.from(new Set(applications.map((a) => a.opportunity_id)));
    const opportunities = await hydrateOpportunityNames(
      await AppDataSource.getRepository(CollabOpportunity).find({
        where: { id: In(opportunityIds) },
      }),
    );
    const opportunityById = new Map(opportunities.map((o) => [o.id, o]));
    return applications.map((application) => ({
      application,
      opportunity: opportunityById.get(application.opportunity_id) ?? null,
    }));
  }

  // ── Seeding fulfilment (spec §7.5) ─────────────────────────────────────────

  /**
   * Creator nominates the address the seeded product ships to.
   *
   * The address id is stored but never surfaced to the vendor — see
   * `toVendorFacingApplication`. Ownership is checked so a creator cannot point
   * a shipment at somebody else's address.
   */
  async setShippingAddress(
    creatorId: string,
    applicationId: string,
    addressId: string,
  ): Promise<CollabApplication> {
    const address = await AppDataSource.getRepository(UserAddress).findOne({
      where: { id: addressId },
    });
    if (!address) throw new NotFoundError("address_not_found");
    if (address.user_id !== creatorId) throw new ForbiddenError("not_your_address");

    return AppDataSource.transaction(async (manager) => {
      const app = await this.lockApplication(manager, applicationId);
      if (app.creator_id !== creatorId) throw new ForbiddenError("not_your_application");
      const opp = await this.lockOpportunity(manager, app.opportunity_id);
      if (opp.type !== CollabOpportunityType.product_seeding) {
        throw new BadRequestError("not_a_seeding_collab");
      }
      this.assertStatus(
        app,
        [CollabApplicationStatus.accepted, CollabApplicationStatus.in_progress],
        "application_not_awaiting_address",
      );

      app.shipping_address_id = addressId;
      return manager.getRepository(CollabApplication).save(app);
    });
  }

  /** Vendor records dispatch. Refused until the creator has nominated an address. */
  async markShipped(
    vendorId: string,
    applicationId: string,
    input: { carrier?: string | null; trackingNumber?: string | null } = {},
  ): Promise<CollabApplication> {
    return AppDataSource.transaction(async (manager) => {
      const app = await this.lockApplication(manager, applicationId);
      const opp = await this.lockOpportunity(manager, app.opportunity_id);
      this.assertOwner(opp, vendorId);
      if (opp.type !== CollabOpportunityType.product_seeding) {
        throw new BadRequestError("not_a_seeding_collab");
      }
      this.assertStatus(app, [CollabApplicationStatus.accepted], "application_not_shippable");
      if (!app.shipping_address_id) throw new ConflictError("awaiting_creator_address");

      app.status = CollabApplicationStatus.in_progress;
      app.carrier = input.carrier ?? null;
      app.tracking_number = input.trackingNumber ?? null;
      app.shipped_at = new Date();
      const saved = await manager.getRepository(CollabApplication).save(app);

      await this.recordEvent(manager, {
        opportunityId: opp.id,
        applicationId: app.id,
        actor: CollabActor.vendor,
        eventType: CollabEventType.shipped,
        metadata: {
          carrier: app.carrier,
          tracking_number: app.tracking_number,
        },
      });
      return saved;
    });
  }

  /**
   * Receipt confirmation — by the creator, or by `system` when a carrier
   * delivery event fires.
   *
   * This is where the delivery clock starts. `deliver_by` is resolved to an
   * absolute timestamp here and snapshotted on the application, so shipping time
   * does not eat into the creator's window and a later edit to the opportunity
   * cannot move the deadline out from under them.
   */
  async confirmReceipt(
    applicationId: string,
    actor: { kind: CollabActor; creatorId?: string },
  ): Promise<CollabApplication> {
    return AppDataSource.transaction(async (manager) => {
      const app = await this.lockApplication(manager, applicationId);
      if (actor.kind === CollabActor.creator) {
        if (app.creator_id !== actor.creatorId) throw new ForbiddenError("not_your_application");
      }
      const opp = await this.lockOpportunity(manager, app.opportunity_id);
      if (opp.type !== CollabOpportunityType.product_seeding) {
        throw new BadRequestError("not_a_seeding_collab");
      }
      this.assertStatus(app, [CollabApplicationStatus.in_progress], "application_not_in_transit");
      // Idempotent: a creator tap and a carrier webhook can race.
      if (app.received_at) return app;

      const now = new Date();
      app.received_at = now;
      app.deliver_by = this.resolveDeliverBy(opp, now);
      const saved = await manager.getRepository(CollabApplication).save(app);

      await this.recordEvent(manager, {
        opportunityId: opp.id,
        applicationId: app.id,
        actor: actor.kind,
        actorUserId: actor.creatorId ?? null,
        eventType: CollabEventType.received,
        metadata: { deliver_by: app.deliver_by?.toISOString() ?? null },
      });
      return saved;
    });
  }

  /**
   * The absolute deadline for a creator who received their product at `from`.
   *
   * The opportunity's `deliver_by` is a calendar date the vendor set when the
   * collab was posted. Once product is in the creator's hands, what matters is
   * how long they get — so a creator who receives late still gets the full
   * window, floored at the vendor's original date.
   */
  private resolveDeliverBy(opp: CollabOpportunity, from: Date): Date | null {
    if (!opp.deliver_by) return null;
    const windowMs = opp.deliver_by.getTime() - opp.created_at.getTime();
    const fromReceipt = new Date(from.getTime() + Math.max(0, windowMs));
    return fromReceipt.getTime() > opp.deliver_by.getTime() ? fromReceipt : opp.deliver_by;
  }

  /**
   * Sweep seeded collabs that were shipped but never confirmed received.
   *
   * Nothing is captured — seeding holds no money — so this only expires the
   * application and leaves an audit trail for both sides.
   */
  async expireStaleSeedingReceipts(
    now: Date = new Date(),
    days = SEEDING_RECEIPT_TIMEOUT_DAYS,
  ): Promise<number> {
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const stale = await AppDataSource.getRepository(CollabApplication).find({
      where: {
        status: CollabApplicationStatus.in_progress,
        received_at: IsNull(),
        shipped_at: LessThanOrEqual(cutoff),
      },
    });

    let expired = 0;
    for (const row of stale) {
      await AppDataSource.transaction(async (manager) => {
        const app = await this.lockApplication(manager, row.id);
        // Re-check under the lock: the creator may have confirmed in between.
        if (app.status !== CollabApplicationStatus.in_progress || app.received_at) return;

        app.status = CollabApplicationStatus.expired;
        await manager.getRepository(CollabApplication).save(app);

        const opp = await this.lockOpportunity(manager, app.opportunity_id);
        opp.slots_filled = Math.max(0, opp.slots_filled - 1);
        if (opp.status === CollabOpportunityStatus.filled) {
          opp.status = CollabOpportunityStatus.open;
        }
        await manager.getRepository(CollabOpportunity).save(opp);

        await this.recordEvent(manager, {
          opportunityId: app.opportunity_id,
          applicationId: app.id,
          actor: CollabActor.system,
          eventType: CollabEventType.expired,
          note: `no receipt confirmed within ${days} days of dispatch`,
        });
        expired += 1;
      });
    }
    return expired;
  }

  // ── Scheduled expiry (spec §7.8) ───────────────────────────────────────────

  /**
   * Sweep everything that has run out of time.
   *
   * Four distinct cases, deliberately kept apart because they mean different
   * things to the people involved:
   *
   *   1. An invitation nobody answered.
   *   2. An application on an opportunity that closed without them.
   *   3. An opportunity that closed with nobody accepted.
   *   4. Work that blew its deadline — the only case that releases money.
   *
   * Mirrors `BriefService.expireDueBriefs`: batches of 200, every row re-checked
   * under its own lock, every transition recorded with a `system` actor so both
   * sides can see what happened and why.
   */
  async expireDueCollabs(now = new Date()): Promise<{
    invitesExpired: number;
    applicationsExpired: number;
    opportunitiesExpired: number;
    deliveriesExpired: number;
  }> {
    const result = {
      invitesExpired: 0,
      applicationsExpired: 0,
      opportunitiesExpired: 0,
      deliveriesExpired: 0,
    };
    const appRepo = AppDataSource.getRepository(CollabApplication);
    const oppRepo = AppDataSource.getRepository(CollabOpportunity);

    // (1) Invitations that went unanswered. Direct opportunities usually carry no
    // closing date, so these age out on their own TTL rather than waiting forever.
    const inviteCutoff = new Date(now.getTime() - INVITE_TTL_DAYS * DAY_MS);
    const staleInvites = await appRepo.find({
      where: {
        status: CollabApplicationStatus.invited,
        created_at: LessThanOrEqual(inviteCutoff),
      },
      order: { created_at: "ASC" },
      take: 200,
    });
    for (const row of staleInvites) {
      await AppDataSource.transaction(async (manager) => {
        const app = await this.lockApplication(manager, row.id);
        if (app.status !== CollabApplicationStatus.invited) return;
        app.status = CollabApplicationStatus.expired;
        await manager.getRepository(CollabApplication).save(app);
        await this.recordEvent(manager, {
          opportunityId: app.opportunity_id,
          applicationId: app.id,
          actor: CollabActor.system,
          eventType: CollabEventType.expired,
          note: `invitation unanswered for ${INVITE_TTL_DAYS} days`,
        });
        result.invitesExpired++;
      });
    }

    // (2) + (3) Opportunities whose application window has closed.
    const closedOpps = await oppRepo.find({
      where: {
        status: CollabOpportunityStatus.open,
        applications_close_at: LessThanOrEqual(now),
      },
      order: { applications_close_at: "ASC" },
      take: 200,
    });
    for (const row of closedOpps) {
      await AppDataSource.transaction(async (manager) => {
        const opp = await this.lockOpportunity(manager, row.id);
        if (opp.status !== CollabOpportunityStatus.open) return;
        if (!opp.applications_close_at || opp.applications_close_at.getTime() > now.getTime()) {
          return;
        }

        // Applicants who were never picked. Their application can no longer be
        // accepted, so leaving it "applied" forever would be a lie.
        const pending = await manager.getRepository(CollabApplication).find({
          where: { opportunity_id: opp.id, status: CollabApplicationStatus.applied },
        });
        for (const p of pending) {
          p.status = CollabApplicationStatus.expired;
          await manager.getRepository(CollabApplication).save(p);
          await this.recordEvent(manager, {
            opportunityId: opp.id,
            applicationId: p.id,
            actor: CollabActor.system,
            eventType: CollabEventType.expired,
            note: "applications closed without selection",
          });
          result.applicationsExpired++;
        }

        // The opportunity itself only expires if nobody is working on it. A
        // vendor who filled one of three slots still has real work in flight —
        // that finishes on its own and the opportunity completes with it.
        if (opp.slots_filled === 0) {
          opp.status = CollabOpportunityStatus.expired;
          await manager.getRepository(CollabOpportunity).save(opp);
          await this.recordEvent(manager, {
            opportunityId: opp.id,
            actor: CollabActor.system,
            eventType: CollabEventType.expired,
            note: "closed with no creators accepted",
          });
          result.opportunitiesExpired++;
        }
      });
    }

    // (4) Work that missed its deadline. This is the only branch that touches
    // money: an accepted creator who never delivered is holding vendor funds.
    const overdue = await appRepo.find({
      where: {
        status: In([
          CollabApplicationStatus.accepted,
          CollabApplicationStatus.in_progress,
          CollabApplicationStatus.revision_requested,
        ]),
        deliver_by: LessThanOrEqual(now),
      },
      order: { deliver_by: "ASC" },
      take: 200,
    });
    for (const row of overdue) {
      await AppDataSource.transaction(async (manager) => {
        const app = await this.lockApplication(manager, row.id);
        if (!app.deliver_by || app.deliver_by.getTime() > now.getTime()) return;
        if (!HOLDING_STATUSES.includes(app.status)) return;

        const opp = await this.lockOpportunity(manager, app.opportunity_id);
        await this.releaseIfHolding(manager, opp, app);

        app.status = CollabApplicationStatus.expired;
        await manager.getRepository(CollabApplication).save(app);

        opp.slots_filled = Math.max(0, opp.slots_filled - 1);
        if (opp.status === CollabOpportunityStatus.filled) {
          opp.status = CollabOpportunityStatus.open;
        }
        await manager.getRepository(CollabOpportunity).save(opp);

        await this.recordEvent(manager, {
          opportunityId: opp.id,
          applicationId: app.id,
          actor: CollabActor.system,
          eventType: CollabEventType.expired,
          note: "delivery deadline passed",
        });
        result.deliveriesExpired++;
      });
    }

    return result;
  }

  /**
   * Applications approaching their deadline, for the reminder job.
   *
   * Returns the creator and how long they have left. Deliberately read-only —
   * the job decides what to send, and a reminder that fails to send must not
   * change collab state.
   */
  async findUpcomingDeadlines(
    daysAhead: number,
    now = new Date(),
  ): Promise<Array<{ applicationId: string; creatorId: string; opportunityId: string }>> {
    const from = new Date(now.getTime() + (daysAhead - 1) * DAY_MS);
    const to = new Date(now.getTime() + daysAhead * DAY_MS);
    const rows = await AppDataSource.getRepository(CollabApplication).find({
      where: {
        status: In([
          CollabApplicationStatus.accepted,
          CollabApplicationStatus.in_progress,
          CollabApplicationStatus.revision_requested,
        ]),
        deliver_by: Between(from, to),
      },
      order: { deliver_by: "ASC" },
      take: 500,
    });
    return rows.map((r) => ({
      applicationId: r.id,
      creatorId: r.creator_id,
      opportunityId: r.opportunity_id,
    }));
  }
}
