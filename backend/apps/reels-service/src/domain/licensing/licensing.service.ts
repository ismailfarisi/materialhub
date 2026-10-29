import {
  AppDataSource,
  Reel,
  ReelLicenseEscrowHold,
  ReelLicenseEventType,
  ReelLicenseFundingSource,
  type ReelLicenseGrant,
  ReelLicenseHoldStatus,
  ReelLicenseOffer,
  ReelLicenseOfferEvent,
  ReelLicenseOfferStatus,
  type ReelLicenseRightsScope,
  ReelStatus,
  SiteSetting,
} from "@materialhub/database";
import { BadRequestError, ForbiddenError, NotFoundError } from "@materialhub/plugins";
import { In, LessThanOrEqual } from "typeorm";
import type { CreatorWalletService } from "../commerce/creator-wallet.service.ts";
import { EscrowEngine } from "./escrow-engine.ts";
import type { FundingRail } from "./funding-rail.ts";

const SETTING = {
  feeRate: "reels_license_platform_fee_rate",
  ttlHours: "reels_license_offer_ttl_hours",
  minFils: "reels_license_min_offer_fils",
};
const DEFAULTS = { feeRate: 0.2, ttlHours: 168, minFils: 5000 };

export interface CreateOfferInput {
  vendorId: string;
  reelId: string;
  amountFils: number;
  rightsScope: ReelLicenseRightsScope;
  fundingSource: ReelLicenseFundingSource;
  message?: string | null;
  paymentMethodId?: string; // stripe funding only
}

export class LicensingService {
  private readonly escrow: EscrowEngine;

  constructor(
    private readonly rails: Record<ReelLicenseFundingSource, FundingRail>,
    private readonly wallet: CreatorWalletService,
  ) {
    this.escrow = new EscrowEngine(rails, wallet);
  }

  private async setting(key: string, fallback: number): Promise<number> {
    const row = await AppDataSource.getRepository(SiteSetting).findOne({ where: { key } });
    const n = Number(row?.value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  async createOffer(input: CreateOfferInput): Promise<ReelLicenseOffer> {
    const minFils = await this.setting(SETTING.minFils, DEFAULTS.minFils);
    if (!Number.isInteger(input.amountFils) || input.amountFils < minFils) {
      throw new BadRequestError(`offer_below_minimum:${minFils}`);
    }
    const reel = await AppDataSource.getRepository(Reel).findOne({ where: { id: input.reelId } });
    if (!reel || reel.status !== ReelStatus.approved)
      throw new NotFoundError("reel_not_found_or_not_published");
    if (reel.user_id === input.vendorId) throw new BadRequestError("cannot_license_own_reel"); // defensive

    const ttlHours = await this.setting(SETTING.ttlHours, DEFAULTS.ttlHours);
    const rail = this.rails[input.fundingSource];
    if (!rail) throw new BadRequestError("unknown_funding_source");

    return AppDataSource.transaction(async (manager) => {
      const offerRepo = manager.getRepository(ReelLicenseOffer);
      const expiresAt = new Date(Date.now() + ttlHours * 3600_000);
      const offer = await offerRepo.save(
        offerRepo.create({
          reel_id: input.reelId,
          vendor_id: input.vendorId,
          creator_id: reel.user_id,
          amount_fils: String(input.amountFils),
          rights_scope: input.rightsScope,
          funding_source: input.fundingSource,
          status: ReelLicenseOfferStatus.pending_creator,
          last_actor: "vendor",
          expires_at: expiresAt,
          message: input.message ?? null,
        }),
      );
      await this.placeHold(manager, offer, input.amountFils, input.paymentMethodId);
      await this.recordEvent(manager, {
        offerId: offer.id,
        actor: "vendor",
        eventType: ReelLicenseEventType.offered,
        amountFils: input.amountFils,
        note: input.message ?? null,
      });
      return offer;
    });
  }

  async cancelOffer(vendorId: string, offerId: string): Promise<void> {
    await AppDataSource.transaction(async (manager) => {
      const offer = await this.lockOffer(manager, offerId);
      if (offer.vendor_id !== vendorId) throw new ForbiddenError("not_your_offer");
      if (
        offer.status !== ReelLicenseOfferStatus.pending_creator &&
        offer.status !== ReelLicenseOfferStatus.countered
      ) {
        throw new BadRequestError(`cannot_cancel_in_status:${offer.status}`);
      }
      const released = await this.releaseActiveHold(manager, offer);
      if (released) {
        await this.recordEvent(manager, {
          offerId: offer.id,
          actor: "vendor",
          eventType: ReelLicenseEventType.released,
        });
      }
      await manager.getRepository(ReelLicenseOffer).update(
        { id: offer.id },
        {
          status: ReelLicenseOfferStatus.cancelled,
          cancelled_at: new Date(),
          last_actor: "vendor",
        },
      );
      await this.recordEvent(manager, {
        offerId: offer.id,
        actor: "vendor",
        eventType: ReelLicenseEventType.cancelled,
      });
    });
  }

  async acceptOffer(creatorId: string, offerId: string): Promise<ReelLicenseGrant> {
    const feeRate = await this.setting(SETTING.feeRate, DEFAULTS.feeRate);
    return AppDataSource.transaction(async (manager) => {
      const offer = await this.lockOffer(manager, offerId);
      if (offer.creator_id !== creatorId) throw new ForbiddenError("not_your_offer");
      if (offer.status !== ReelLicenseOfferStatus.pending_creator) {
        throw new BadRequestError(`cannot_accept_in_status:${offer.status}`);
      }
      if (offer.expires_at.getTime() <= Date.now()) throw new BadRequestError("offer_expired");

      const holdRepo = manager.getRepository(ReelLicenseEscrowHold);
      const hold = await holdRepo.findOne({
        where: { offer_id: offer.id, status: ReelLicenseHoldStatus.held },
      });
      if (!hold) throw new BadRequestError("no_active_hold");

      return this.captureAndComplete(manager, offer, hold, feeRate, "creator");
    });
  }

  async declineOffer(creatorId: string, offerId: string): Promise<void> {
    await AppDataSource.transaction(async (manager) => {
      const offer = await this.lockOffer(manager, offerId);
      if (offer.creator_id !== creatorId) throw new ForbiddenError("not_your_offer");
      if (offer.status !== ReelLicenseOfferStatus.pending_creator) {
        throw new BadRequestError(`cannot_decline_in_status:${offer.status}`);
      }
      const released = await this.releaseActiveHold(manager, offer);
      if (released) {
        await this.recordEvent(manager, {
          offerId: offer.id,
          actor: "creator",
          eventType: ReelLicenseEventType.released,
        });
      }
      await manager.getRepository(ReelLicenseOffer).update(
        { id: offer.id },
        {
          status: ReelLicenseOfferStatus.declined,
          declined_at: new Date(),
          last_actor: "creator",
        },
      );
      await this.recordEvent(manager, {
        offerId: offer.id,
        actor: "creator",
        eventType: ReelLicenseEventType.declined,
      });
    });
  }

  /** Creator proposes a different amount on a pending offer: release the vendor's hold,
   *  move to `countered`, record the creator's asking price, reset the TTL (vendor's turn). */
  async counterOffer(
    creatorId: string,
    offerId: string,
    amountFils: number,
    note?: string | null,
  ): Promise<ReelLicenseOffer> {
    const minFils = await this.setting(SETTING.minFils, DEFAULTS.minFils);
    if (!Number.isInteger(amountFils) || amountFils < minFils) {
      throw new BadRequestError(`offer_below_minimum:${minFils}`);
    }
    const ttlHours = await this.setting(SETTING.ttlHours, DEFAULTS.ttlHours);
    return AppDataSource.transaction(async (manager) => {
      const offer = await this.lockOffer(manager, offerId);
      if (offer.creator_id !== creatorId) throw new ForbiddenError("not_your_offer");
      if (offer.status !== ReelLicenseOfferStatus.pending_creator) {
        throw new BadRequestError(`cannot_counter_in_status:${offer.status}`);
      }
      // Release the vendor's hold — the platform never holds vendor funds while the ball
      // is in the vendor's court.
      const released = await this.releaseActiveHold(manager, offer);
      if (released) {
        await this.recordEvent(manager, {
          offerId: offer.id,
          actor: "creator",
          eventType: ReelLicenseEventType.released,
        });
      }
      const expiresAt = new Date(Date.now() + ttlHours * 3600_000);
      await manager.getRepository(ReelLicenseOffer).update(
        { id: offer.id },
        {
          status: ReelLicenseOfferStatus.countered,
          amount_fils: String(amountFils),
          countered_at: new Date(),
          expires_at: expiresAt,
          last_actor: "creator",
          message: note ?? offer.message,
        },
      );
      await this.recordEvent(manager, {
        offerId: offer.id,
        actor: "creator",
        eventType: ReelLicenseEventType.countered,
        amountFils,
        note: note ?? null,
      });
      const updated = await manager
        .getRepository(ReelLicenseOffer)
        .findOne({ where: { id: offer.id } });
      if (!updated) throw new NotFoundError("offer_not_found");
      return updated;
    });
  }

  /** Vendor accepts the creator's countered price: re-hold the offer amount, then capture →
   *  credit → grant → completed (one transaction). Stripe funding needs a fresh payment method. */
  async acceptCounter(
    vendorId: string,
    offerId: string,
    paymentMethodId?: string,
  ): Promise<ReelLicenseGrant> {
    const feeRate = await this.setting(SETTING.feeRate, DEFAULTS.feeRate);
    return AppDataSource.transaction(async (manager) => {
      const offer = await this.lockOffer(manager, offerId);
      if (offer.vendor_id !== vendorId) throw new ForbiddenError("not_your_offer");
      if (offer.status !== ReelLicenseOfferStatus.countered) {
        throw new BadRequestError(`cannot_accept_counter_in_status:${offer.status}`);
      }
      if (offer.expires_at.getTime() <= Date.now()) throw new BadRequestError("offer_expired");
      const hold = await this.placeHold(manager, offer, Number(offer.amount_fils), paymentMethodId);
      return this.captureAndComplete(manager, offer, hold, feeRate, "vendor");
    });
  }

  /** Vendor responds to a counter with a NEW amount: place a fresh hold, back to pending_creator
   *  (the creator's turn again). Stripe funding needs a fresh payment method. */
  async reOffer(
    vendorId: string,
    offerId: string,
    amountFils: number,
    paymentMethodId?: string,
  ): Promise<ReelLicenseOffer> {
    const minFils = await this.setting(SETTING.minFils, DEFAULTS.minFils);
    if (!Number.isInteger(amountFils) || amountFils < minFils) {
      throw new BadRequestError(`offer_below_minimum:${minFils}`);
    }
    const ttlHours = await this.setting(SETTING.ttlHours, DEFAULTS.ttlHours);
    return AppDataSource.transaction(async (manager) => {
      const offer = await this.lockOffer(manager, offerId);
      if (offer.vendor_id !== vendorId) throw new ForbiddenError("not_your_offer");
      if (offer.status !== ReelLicenseOfferStatus.countered) {
        throw new BadRequestError(`cannot_reoffer_in_status:${offer.status}`);
      }
      // Defensive: a countered offer has no active hold, but guard against double-holds.
      const existing = await manager.getRepository(ReelLicenseEscrowHold).findOne({
        where: { offer_id: offer.id, status: ReelLicenseHoldStatus.held },
      });
      if (existing) throw new BadRequestError("unexpected_active_hold");

      // Update amount first so placeHold reserves the new amount.
      offer.amount_fils = String(amountFils);
      await this.placeHold(manager, offer, amountFils, paymentMethodId);
      const expiresAt = new Date(Date.now() + ttlHours * 3600_000);
      await manager.getRepository(ReelLicenseOffer).update(
        { id: offer.id },
        {
          status: ReelLicenseOfferStatus.pending_creator,
          amount_fils: String(amountFils),
          expires_at: expiresAt,
          countered_at: null,
          last_actor: "vendor",
        },
      );
      await this.recordEvent(manager, {
        offerId: offer.id,
        actor: "vendor",
        eventType: ReelLicenseEventType.re_offered,
        amountFils,
      });
      const updated = await manager
        .getRepository(ReelLicenseOffer)
        .findOne({ where: { id: offer.id } });
      if (!updated) throw new NotFoundError("offer_not_found");
      return updated;
    });
  }

  /** Release holds + mark expired for all pending offers past their TTL. Returns count. */
  async expireDueOffers(now = new Date()): Promise<number> {
    const due = await AppDataSource.getRepository(ReelLicenseOffer).find({
      where: {
        status: In([ReelLicenseOfferStatus.pending_creator, ReelLicenseOfferStatus.countered]),
        expires_at: LessThanOrEqual(now),
      },
      order: { expires_at: "ASC" },
      take: 200,
    });
    let n = 0;
    for (const row of due) {
      // Defensive re-check (the row is re-validated under lock inside the txn too).
      if (row.expires_at.getTime() > now.getTime()) continue;
      await AppDataSource.transaction(async (manager) => {
        const offer = await this.lockOffer(manager, row.id);
        if (
          offer.status !== ReelLicenseOfferStatus.pending_creator &&
          offer.status !== ReelLicenseOfferStatus.countered
        ) {
          return;
        }
        if (offer.expires_at.getTime() > now.getTime()) return;
        const released = await this.releaseActiveHold(manager, offer);
        if (released) {
          await this.recordEvent(manager, {
            offerId: offer.id,
            actor: "system",
            eventType: ReelLicenseEventType.released,
          });
        }
        await manager
          .getRepository(ReelLicenseOffer)
          .update(
            { id: offer.id },
            { status: ReelLicenseOfferStatus.expired, last_actor: "system" },
          );
        await this.recordEvent(manager, {
          offerId: offer.id,
          actor: "system",
          eventType: ReelLicenseEventType.expired,
        });
        n++;
      });
    }
    return n;
  }

  async listOffers(vendorId: string): Promise<ReelLicenseOffer[]> {
    return AppDataSource.getRepository(ReelLicenseOffer).find({
      where: { vendor_id: vendorId },
      order: { created_at: "DESC" },
      take: 100,
    });
  }

  async listIncoming(creatorId: string): Promise<ReelLicenseOffer[]> {
    return AppDataSource.getRepository(ReelLicenseOffer).find({
      where: { creator_id: creatorId },
      order: { created_at: "DESC" },
      take: 100,
    });
  }

  /** Negotiation history for an offer (oldest first). Ownership is enforced at the route. */
  async listEvents(offerId: string): Promise<ReelLicenseOfferEvent[]> {
    return AppDataSource.getRepository(ReelLicenseOfferEvent).find({
      where: { offer_id: offerId },
      order: { created_at: "ASC" },
    });
  }

  /** Fetch a single offer (for route-level ownership checks). */
  async getOffer(offerId: string): Promise<ReelLicenseOffer | null> {
    return AppDataSource.getRepository(ReelLicenseOffer).findOne({ where: { id: offerId } });
  }

  async availablePayoutBalance(vendorId: string): Promise<number> {
    const rail = this.rails[ReelLicenseFundingSource.payout_balance];
    // availableFils is specific to PayoutBalanceRail; it's safe to call here.
    return (rail as unknown as { availableFils(v: string): Promise<number> }).availableFils(
      vendorId,
    );
  }

  // --- shared helpers used by accept/decline/expire (Task 7/8) ---
  protected async lockOffer(
    manager: import("typeorm").EntityManager,
    offerId: string,
  ): Promise<ReelLicenseOffer> {
    const offer = await manager
      .getRepository(ReelLicenseOffer)
      .createQueryBuilder("o")
      .where("o.id = :id", { id: offerId })
      .setLock("pessimistic_write")
      .getOne();
    if (!offer) throw new NotFoundError("offer_not_found");
    return offer;
  }

  protected async releaseActiveHold(
    manager: import("typeorm").EntityManager,
    offer: ReelLicenseOffer,
  ): Promise<boolean> {
    return this.escrow.releaseActiveHold(manager, { offerId: offer.id });
  }

  /** Append an immutable audit-trail row. */
  protected async recordEvent(
    manager: import("typeorm").EntityManager,
    input: {
      offerId: string;
      actor: "vendor" | "creator" | "system";
      eventType: ReelLicenseEventType;
      amountFils?: number | null;
      note?: string | null;
    },
  ): Promise<void> {
    const repo = manager.getRepository(ReelLicenseOfferEvent);
    await repo.save(
      repo.create({
        offer_id: input.offerId,
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

  /**
   * Place an escrow hold for `offer` at `amountFils` via its funding rail and persist the
   * hold row (status `held`). Throws if the rail rejects (insufficient balance / card auth).
   * Used by createOffer, reOffer, and acceptCounter.
   */
  protected async placeHold(
    manager: import("typeorm").EntityManager,
    offer: ReelLicenseOffer,
    amountFils: number,
    paymentMethodId?: string,
  ): Promise<ReelLicenseEscrowHold> {
    return this.escrow.placeHold(manager, {
      vendorId: offer.vendor_id,
      fundingSource: offer.funding_source,
      amountFils,
      link: { offerId: offer.id },
      paymentMethodId,
    });
  }

  /**
   * Capture the given `held` hold, credit the creator (gross − fee), create the grant, mark the
   * offer completed, and (LAST) capture via the rail. `actor` is who completed it (creator on
   * accept, vendor on accept-counter). Returns the grant (with wallet_transaction_id).
   */
  protected async captureAndComplete(
    manager: import("typeorm").EntityManager,
    offer: ReelLicenseOffer,
    hold: ReelLicenseEscrowHold,
    feeRate: number,
    actor: "vendor" | "creator",
  ): Promise<ReelLicenseGrant> {
    const gross = Number(offer.amount_fils);
    return this.escrow.captureAndComplete(manager, {
      link: { offerId: offer.id },
      vendorId: offer.vendor_id,
      creatorId: offer.creator_id,
      reelId: offer.reel_id,
      scope: offer.rights_scope,
      amountFils: gross,
      hold,
      feeRate,
      beforeCapture: async (m, _grant) => {
        await m.getRepository(ReelLicenseOffer).update(
          { id: offer.id },
          {
            status: ReelLicenseOfferStatus.completed,
            completed_at: new Date(),
            last_actor: actor,
          },
        );
        await this.recordEvent(m, {
          offerId: offer.id,
          actor,
          eventType: ReelLicenseEventType.captured,
          amountFils: gross,
        });
        await this.recordEvent(m, {
          offerId: offer.id,
          actor,
          eventType: ReelLicenseEventType.accepted,
          amountFils: gross,
        });
      },
    });
  }
}
