import {
  AppDataSource,
  Reel,
  ReelBrief,
  ReelBriefBid,
  ReelBriefBidStatus,
  ReelBriefEvent,
  ReelBriefEventType,
  ReelBriefStatus,
  ReelLicenseEscrowHold,
  type ReelLicenseFundingSource,
  type ReelLicenseGrant,
  ReelLicenseHoldStatus,
  type ReelLicenseRightsScope,
  SiteSetting,
} from "@materialhub/database";
import { BadRequestError, ForbiddenError, NotFoundError } from "@materialhub/plugins";
import { type EntityManager, In, IsNull, LessThanOrEqual } from "typeorm";
import type { EscrowEngine } from "./escrow-engine.ts";

const SETTING = {
  feeRate: "reels_license_platform_fee_rate",
  minFils: "reels_license_min_offer_fils",
  deliveryTtlHours: "reels_brief_delivery_ttl_hours",
};
const DEFAULTS = { feeRate: 0.2, minFils: 5000, deliveryTtlHours: 168 };

export interface CreateBriefInput {
  vendorId: string;
  title: string;
  brief: string;
  rightsScope: ReelLicenseRightsScope;
  bidsCloseAt: Date;
  budgetGuideFils?: number | null;
  targetProductId?: string | null;
  targetCategory?: string | null;
}

export class BriefService {
  constructor(private readonly escrow: EscrowEngine) {}

  private async setting(key: string, fallback: number): Promise<number> {
    const row = await AppDataSource.getRepository(SiteSetting).findOne({ where: { key } });
    const n = Number(row?.value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  private async recordEvent(
    manager: EntityManager,
    input: {
      briefId: string;
      bidId?: string | null;
      actor: "vendor" | "creator" | "system";
      eventType: ReelBriefEventType;
      amountFils?: number | null;
      note?: string | null;
    },
  ): Promise<void> {
    const repo = manager.getRepository(ReelBriefEvent);
    await repo.save(
      repo.create({
        brief_id: input.briefId,
        bid_id: input.bidId ?? null,
        actor: input.actor,
        event_type: input.eventType,
        amount_fils_snapshot:
          input.amountFils === undefined || input.amountFils === null
            ? null
            : String(input.amountFils),
        note: input.note ?? null,
      }),
    );
  }

  private async lockBrief(manager: EntityManager, briefId: string): Promise<ReelBrief> {
    const brief = await manager
      .getRepository(ReelBrief)
      .findOne({ where: { id: briefId }, lock: { mode: "pessimistic_write" } });
    if (!brief) throw new NotFoundError("brief_not_found");
    return brief;
  }

  async createBrief(input: CreateBriefInput): Promise<ReelBrief> {
    return AppDataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ReelBrief);
      const brief = await repo.save(
        repo.create({
          vendor_id: input.vendorId,
          title: input.title,
          brief: input.brief,
          rights_scope: input.rightsScope,
          bids_close_at: input.bidsCloseAt,
          budget_guide_fils: input.budgetGuideFils != null ? String(input.budgetGuideFils) : null,
          target_product_id: input.targetProductId ?? null,
          target_category: input.targetCategory ?? null,
          status: ReelBriefStatus.open,
        }),
      );
      await this.recordEvent(manager, {
        briefId: brief.id,
        actor: "vendor",
        eventType: ReelBriefEventType.brief_created,
      });
      return brief;
    });
  }

  async updateBrief(
    vendorId: string,
    briefId: string,
    patch: Partial<
      Pick<
        CreateBriefInput,
        "title" | "brief" | "budgetGuideFils" | "bidsCloseAt" | "targetProductId" | "targetCategory"
      >
    >,
  ): Promise<ReelBrief> {
    return AppDataSource.transaction(async (manager) => {
      const brief = await this.lockBrief(manager, briefId);
      if (brief.vendor_id !== vendorId) throw new ForbiddenError("not_your_brief");
      if (brief.status !== ReelBriefStatus.open) throw new BadRequestError("brief_not_open");
      if (patch.title !== undefined) brief.title = patch.title;
      if (patch.brief !== undefined) brief.brief = patch.brief;
      if (patch.bidsCloseAt !== undefined) brief.bids_close_at = patch.bidsCloseAt;
      if (patch.budgetGuideFils !== undefined)
        brief.budget_guide_fils =
          patch.budgetGuideFils != null ? String(patch.budgetGuideFils) : null;
      if (patch.targetProductId !== undefined)
        brief.target_product_id = patch.targetProductId ?? null;
      if (patch.targetCategory !== undefined) brief.target_category = patch.targetCategory ?? null;
      return manager.getRepository(ReelBrief).save(brief);
    });
  }

  async cancelBrief(vendorId: string, briefId: string): Promise<void> {
    await AppDataSource.transaction(async (manager) => {
      const brief = await this.lockBrief(manager, briefId);
      if (brief.vendor_id !== vendorId) throw new ForbiddenError("not_your_brief");
      if (
        brief.status === ReelBriefStatus.fulfilled ||
        brief.status === ReelBriefStatus.cancelled
      ) {
        throw new BadRequestError("brief_not_cancellable");
      }
      // Release any live hold on an awarded bid, then always mark that bid rejected — even if no
      // live hold was found (e.g. it was already released) the awarded bid must not be left in a
      // non-terminal state once its brief is cancelled.
      if (brief.awarded_bid_id) {
        await this.escrow.releaseActiveHold(manager, { bidId: brief.awarded_bid_id });
        await manager
          .getRepository(ReelBriefBid)
          .update({ id: brief.awarded_bid_id }, { status: ReelBriefBidStatus.rejected });
      }
      await manager
        .getRepository(ReelBrief)
        .update({ id: briefId }, { status: ReelBriefStatus.cancelled, awarded_bid_id: null });
      await this.recordEvent(manager, {
        briefId,
        actor: "vendor",
        eventType: ReelBriefEventType.brief_cancelled,
      });
    });
  }

  async listBriefsForVendor(vendorId: string): Promise<ReelBrief[]> {
    return AppDataSource.getRepository(ReelBrief).find({
      where: { vendor_id: vendorId },
      order: { created_at: "DESC" },
      take: 100,
    });
  }

  async listOpenBriefs(): Promise<ReelBrief[]> {
    return AppDataSource.getRepository(ReelBrief).find({
      where: { status: ReelBriefStatus.open },
      order: { bids_close_at: "ASC" },
      take: 100,
    });
  }

  /** Public board: open briefs not past their close date. Non-sensitive fields only. */
  async listOpenBriefsPublic(): Promise<
    Array<{
      id: string;
      vendor_slug: string | null;
      vendor_name: string | null;
      title: string;
      rights_scope: string;
      budget_guide_fils: string | null;
      target_category: string | null;
      bids_close_at: Date;
      created_at: Date;
    }>
  > {
    const rows = await AppDataSource.getRepository(ReelBrief)
      .createQueryBuilder("b")
      .leftJoin("vendors", "v", "v.id = b.vendor_id AND v.deleted_at IS NULL")
      .where("b.status = :status", { status: ReelBriefStatus.open })
      .andWhere("b.deleted_at IS NULL")
      .andWhere("b.bids_close_at > now()")
      .orderBy("b.bids_close_at", "ASC")
      .take(100)
      .select([
        "b.id AS id",
        "v.slug AS vendor_slug",
        "v.name AS vendor_name",
        "b.title AS title",
        "b.rights_scope AS rights_scope",
        "b.budget_guide_fils AS budget_guide_fils",
        "b.target_category AS target_category",
        "b.bids_close_at AS bids_close_at",
        "b.created_at AS created_at",
      ])
      .getRawMany();
    return rows.map((r) => ({
      id: r.id,
      vendor_slug: r.vendor_slug ?? null,
      vendor_name: r.vendor_name ?? null,
      title: r.title,
      rights_scope: r.rights_scope,
      budget_guide_fils: r.budget_guide_fils ?? null,
      target_category: r.target_category ?? null,
      bids_close_at: r.bids_close_at,
      created_at: r.created_at,
    }));
  }

  async getBrief(briefId: string): Promise<ReelBrief> {
    const brief = await AppDataSource.getRepository(ReelBrief).findOne({ where: { id: briefId } });
    if (!brief) throw new NotFoundError("brief_not_found");
    return brief;
  }

  async listBids(vendorId: string, briefId: string): Promise<ReelBriefBid[]> {
    const brief = await this.getBrief(briefId);
    if (brief.vendor_id !== vendorId) throw new ForbiddenError("not_your_brief");
    return AppDataSource.getRepository(ReelBriefBid).find({
      where: { brief_id: briefId },
      order: { created_at: "ASC" },
    });
  }

  /** A creator's own bids across all briefs, with each brief's title — for the web "My Bids" tracker. Read-only. */
  async listBidsForCreator(creatorId: string): Promise<
    Array<{
      bid_id: string;
      brief_id: string;
      brief_title: string;
      amount_fils: string;
      status: string;
      delivery_round: number;
      delivery_deadline_at: Date | null;
      created_at: Date;
    }>
  > {
    const rows = await AppDataSource.getRepository(ReelBriefBid)
      .createQueryBuilder("bid")
      .innerJoin(ReelBrief, "b", "b.id = bid.brief_id")
      .where("bid.creator_id = :creatorId", { creatorId })
      .orderBy("bid.created_at", "DESC")
      .take(100)
      .select([
        "bid.id AS bid_id",
        "bid.brief_id AS brief_id",
        "b.title AS brief_title",
        "bid.amount_fils AS amount_fils",
        "bid.status AS status",
        "bid.delivery_round AS delivery_round",
        "bid.delivery_deadline_at AS delivery_deadline_at",
        "bid.created_at AS created_at",
      ])
      .getRawMany();
    return rows.map((r) => ({
      bid_id: r.bid_id,
      brief_id: r.brief_id,
      brief_title: r.brief_title,
      amount_fils: r.amount_fils,
      status: r.status,
      delivery_round: Number(r.delivery_round),
      delivery_deadline_at: r.delivery_deadline_at ?? null,
      created_at: r.created_at,
    }));
  }

  async placeBid(
    creatorId: string,
    briefId: string,
    amountFils: number,
    pitch: string,
  ): Promise<ReelBriefBid> {
    const minFils = await this.setting(SETTING.minFils, DEFAULTS.minFils);
    if (amountFils < minFils) throw new BadRequestError("amount_below_min");
    return AppDataSource.transaction(async (manager) => {
      const brief = await manager.getRepository(ReelBrief).findOne({ where: { id: briefId } });
      if (!brief) throw new NotFoundError("brief_not_found");
      if (brief.status !== ReelBriefStatus.open) throw new BadRequestError("brief_not_open");
      if (brief.bids_close_at.getTime() <= Date.now()) throw new BadRequestError("bids_closed");
      const bidRepo = manager.getRepository(ReelBriefBid);
      const bid = await bidRepo.save(
        bidRepo.create({
          brief_id: briefId,
          creator_id: creatorId,
          amount_fils: String(amountFils),
          pitch,
          status: ReelBriefBidStatus.pending,
          delivery_round: 0,
        }),
      );
      await this.recordEvent(manager, {
        briefId,
        bidId: bid.id,
        actor: "creator",
        eventType: ReelBriefEventType.bid_placed,
        amountFils,
      });
      return bid;
    });
  }

  async withdrawBid(creatorId: string, briefId: string, bidId: string): Promise<void> {
    await AppDataSource.transaction(async (manager) => {
      const bidRepo = manager.getRepository(ReelBriefBid);
      const bid = await bidRepo.findOne({ where: { id: bidId } });
      if (!bid || bid.brief_id !== briefId) throw new NotFoundError("bid_not_found");
      if (bid.creator_id !== creatorId) throw new ForbiddenError("not_your_bid");
      if (bid.status !== ReelBriefBidStatus.pending) throw new BadRequestError("bid_not_pending");
      await bidRepo.update({ id: bidId }, { status: ReelBriefBidStatus.withdrawn });
      await this.recordEvent(manager, {
        briefId,
        bidId,
        actor: "creator",
        eventType: ReelBriefEventType.bid_withdrawn,
      });
    });
  }

  async acceptBid(
    vendorId: string,
    briefId: string,
    bidId: string,
    fundingSource: ReelLicenseFundingSource,
    paymentMethodId?: string,
  ): Promise<ReelBriefBid> {
    const ttlHours = await this.setting(SETTING.deliveryTtlHours, DEFAULTS.deliveryTtlHours);
    return AppDataSource.transaction(async (manager) => {
      const brief = await this.lockBrief(manager, briefId);
      if (brief.vendor_id !== vendorId) throw new ForbiddenError("not_your_brief");
      if (brief.status !== ReelBriefStatus.open) throw new BadRequestError("brief_not_open");
      const bidRepo = manager.getRepository(ReelBriefBid);
      const bid = await bidRepo.findOne({ where: { id: bidId } });
      if (!bid || bid.brief_id !== briefId) throw new NotFoundError("bid_not_found");
      if (bid.status !== ReelBriefBidStatus.pending) throw new BadRequestError("bid_not_pending");

      const deadline = new Date(Date.now() + ttlHours * 3600 * 1000);
      await bidRepo.update(
        { id: bidId },
        { status: ReelBriefBidStatus.accepted, delivery_deadline_at: deadline },
      );
      await manager
        .getRepository(ReelBrief)
        .update({ id: briefId }, { status: ReelBriefStatus.awarded, awarded_bid_id: bidId });
      await this.recordEvent(manager, {
        briefId,
        bidId,
        actor: "vendor",
        eventType: ReelBriefEventType.bid_accepted,
        amountFils: Number(bid.amount_fils),
      });
      // Place the escrow hold LAST (irreversible external op). The hold carries bid_id, so no
      // post-hold write is needed — the hold is later found by bid_id.
      await this.escrow.placeHold(manager, {
        vendorId,
        fundingSource,
        amountFils: Number(bid.amount_fils),
        link: { bidId },
        paymentMethodId,
      });
      return { ...bid, status: ReelBriefBidStatus.accepted, delivery_deadline_at: deadline };
    });
  }

  async submitDelivery(
    creatorId: string,
    briefId: string,
    bidId: string,
    reelId: string,
  ): Promise<ReelBriefBid> {
    return AppDataSource.transaction(async (manager) => {
      const bidRepo = manager.getRepository(ReelBriefBid);
      const bid = await bidRepo.findOne({ where: { id: bidId } });
      if (!bid || bid.brief_id !== briefId) throw new NotFoundError("bid_not_found");
      if (bid.creator_id !== creatorId) throw new ForbiddenError("not_your_bid");
      if (
        bid.status !== ReelBriefBidStatus.accepted &&
        bid.status !== ReelBriefBidStatus.revision_requested
      ) {
        throw new BadRequestError("bid_not_accepted");
      }
      const reel = await manager.getRepository(Reel).findOne({ where: { id: reelId } });
      if (!reel || reel.user_id !== creatorId)
        throw new BadRequestError("reel_not_owned_by_creator");
      await bidRepo.update(
        { id: bidId },
        { status: ReelBriefBidStatus.delivered, delivered_reel_id: reelId },
      );
      await this.recordEvent(manager, {
        briefId,
        bidId,
        actor: "creator",
        eventType: ReelBriefEventType.delivered,
      });
      return { ...bid, status: ReelBriefBidStatus.delivered, delivered_reel_id: reelId };
    });
  }

  async approveDelivery(
    vendorId: string,
    briefId: string,
    bidId: string,
  ): Promise<ReelLicenseGrant> {
    const feeRate = await this.setting(SETTING.feeRate, DEFAULTS.feeRate);
    return AppDataSource.transaction(async (manager) => {
      const brief = await this.lockBrief(manager, briefId);
      if (brief.vendor_id !== vendorId) throw new ForbiddenError("not_your_brief");
      const bidRepo = manager.getRepository(ReelBriefBid);
      const bid = await bidRepo.findOne({ where: { id: bidId } });
      if (!bid || bid.brief_id !== briefId) throw new NotFoundError("bid_not_found");
      if (bid.status !== ReelBriefBidStatus.delivered)
        throw new BadRequestError("bid_not_delivered");
      if (!bid.delivered_reel_id) throw new BadRequestError("bid_not_delivered");
      const hold = await manager.getRepository(ReelLicenseEscrowHold).findOne({
        where: { bid_id: bidId, status: ReelLicenseHoldStatus.held },
      });
      if (!hold) throw new BadRequestError("hold_not_found");

      return this.escrow.captureAndComplete(manager, {
        link: { bidId },
        vendorId,
        creatorId: bid.creator_id,
        reelId: bid.delivered_reel_id,
        scope: brief.rights_scope,
        amountFils: Number(bid.amount_fils),
        hold,
        feeRate,
        beforeCapture: async (m, grant) => {
          await m
            .getRepository(ReelBriefBid)
            .update({ id: bidId }, { status: ReelBriefBidStatus.completed, grant_id: grant.id });
          await m
            .getRepository(ReelBrief)
            .update({ id: briefId }, { status: ReelBriefStatus.fulfilled });
          // Decline remaining pending bids (the auction is over).
          await m
            .getRepository(ReelBriefBid)
            .update(
              { brief_id: briefId, status: ReelBriefBidStatus.pending },
              { status: ReelBriefBidStatus.declined },
            );
          await this.recordEvent(m, {
            briefId,
            bidId,
            actor: "vendor",
            eventType: ReelBriefEventType.approved,
            amountFils: Number(bid.amount_fils),
          });
        },
      });
    });
  }

  async reviseDelivery(
    vendorId: string,
    briefId: string,
    bidId: string,
    note?: string,
  ): Promise<ReelBriefBid> {
    const ttlHours = await this.setting(SETTING.deliveryTtlHours, DEFAULTS.deliveryTtlHours);
    return AppDataSource.transaction(async (manager) => {
      const brief = await this.lockBrief(manager, briefId);
      if (brief.vendor_id !== vendorId) throw new ForbiddenError("not_your_brief");
      const bidRepo = manager.getRepository(ReelBriefBid);
      const bid = await bidRepo.findOne({ where: { id: bidId } });
      if (!bid || bid.brief_id !== briefId) throw new NotFoundError("bid_not_found");
      if (bid.status !== ReelBriefBidStatus.delivered)
        throw new BadRequestError("bid_not_delivered");
      const deadline = new Date(Date.now() + ttlHours * 3600 * 1000);
      await bidRepo.update(
        { id: bidId },
        {
          status: ReelBriefBidStatus.revision_requested,
          delivery_round: bid.delivery_round + 1,
          delivery_deadline_at: deadline,
        },
      );
      await this.recordEvent(manager, {
        briefId,
        bidId,
        actor: "vendor",
        eventType: ReelBriefEventType.revision_requested,
        note: note ?? null,
      });
      return {
        ...bid,
        status: ReelBriefBidStatus.revision_requested,
        delivery_round: bid.delivery_round + 1,
        delivery_deadline_at: deadline,
      };
    });
  }

  async rejectDelivery(
    vendorId: string,
    briefId: string,
    bidId: string,
    note?: string,
  ): Promise<void> {
    await AppDataSource.transaction(async (manager) => {
      const brief = await this.lockBrief(manager, briefId);
      if (brief.vendor_id !== vendorId) throw new ForbiddenError("not_your_brief");
      const bidRepo = manager.getRepository(ReelBriefBid);
      const bid = await bidRepo.findOne({ where: { id: bidId } });
      if (!bid || bid.brief_id !== briefId) throw new NotFoundError("bid_not_found");
      if (
        bid.status !== ReelBriefBidStatus.delivered &&
        bid.status !== ReelBriefBidStatus.revision_requested
      ) {
        throw new BadRequestError("bid_not_delivered");
      }
      await this.escrow.releaseActiveHold(manager, { bidId });
      await bidRepo.update({ id: bidId }, { status: ReelBriefBidStatus.rejected });
      await manager
        .getRepository(ReelBrief)
        .update({ id: briefId }, { status: ReelBriefStatus.open, awarded_bid_id: null });
      await this.recordEvent(manager, {
        briefId,
        bidId,
        actor: "vendor",
        eventType: ReelBriefEventType.rejected,
        amountFils: Number(bid.amount_fils),
        note: note ?? null,
      });
    });
  }

  /**
   * Cron sweep. (1) Open briefs whose bidding window lapsed with no award -> `expired`.
   * (2) In-flight bids (`accepted`/`revision_requested`) whose delivery deadline lapsed ->
   * release the hold, bid `rejected`, brief `expired`. Returns the two counts.
   */
  async expireDueBriefs(
    now = new Date(),
  ): Promise<{ briefsExpired: number; deliveriesExpired: number }> {
    let briefsExpired = 0;
    let deliveriesExpired = 0;

    // (1) Bidding window lapsed, never awarded.
    const staleBriefs = await AppDataSource.getRepository(ReelBrief).find({
      where: {
        status: ReelBriefStatus.open,
        awarded_bid_id: IsNull(),
        bids_close_at: LessThanOrEqual(now),
      },
      order: { bids_close_at: "ASC" },
      take: 200,
    });
    for (const row of staleBriefs) {
      await AppDataSource.transaction(async (manager) => {
        const brief = await this.lockBrief(manager, row.id);
        if (brief.status !== ReelBriefStatus.open || brief.awarded_bid_id) return;
        if (brief.bids_close_at.getTime() > now.getTime()) return;
        await manager
          .getRepository(ReelBrief)
          .update({ id: brief.id }, { status: ReelBriefStatus.expired });
        await this.recordEvent(manager, {
          briefId: brief.id,
          actor: "system",
          eventType: ReelBriefEventType.brief_expired,
        });
        briefsExpired++;
      });
    }

    // (2) Delivery deadline lapsed on an in-flight bid.
    const lateBids = await AppDataSource.getRepository(ReelBriefBid).find({
      where: {
        status: In([ReelBriefBidStatus.accepted, ReelBriefBidStatus.revision_requested]),
        delivery_deadline_at: LessThanOrEqual(now),
      },
      order: { delivery_deadline_at: "ASC" },
      take: 200,
    });
    for (const row of lateBids) {
      await AppDataSource.transaction(async (manager) => {
        const brief = await this.lockBrief(manager, row.brief_id);
        const bid = await manager.getRepository(ReelBriefBid).findOne({ where: { id: row.id } });
        if (
          !bid ||
          (bid.status !== ReelBriefBidStatus.accepted &&
            bid.status !== ReelBriefBidStatus.revision_requested)
        ) {
          return;
        }
        if (!bid.delivery_deadline_at || bid.delivery_deadline_at.getTime() > now.getTime()) return;
        await this.escrow.releaseActiveHold(manager, { bidId: bid.id });
        await manager
          .getRepository(ReelBriefBid)
          .update({ id: bid.id }, { status: ReelBriefBidStatus.rejected });
        await manager
          .getRepository(ReelBrief)
          .update({ id: brief.id }, { status: ReelBriefStatus.expired, awarded_bid_id: null });
        await this.recordEvent(manager, {
          briefId: brief.id,
          bidId: bid.id,
          actor: "system",
          eventType: ReelBriefEventType.delivery_expired,
          amountFils: Number(bid.amount_fils),
        });
        deliveriesExpired++;
      });
    }
    return { briefsExpired, deliveriesExpired };
  }
}
