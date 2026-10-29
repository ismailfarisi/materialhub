import { describe, expect, it } from "bun:test";
import {
  ReelLicenseEscrowHold,
  ReelLicenseFundingSource,
  ReelLicenseGrant,
  ReelLicenseHoldStatus,
  ReelLicenseRightsScope,
} from "@materialhub/database";
import { type DealLink, EscrowEngine } from "./escrow-engine.ts";

/**
 * Regression cover for the two money paths that already exist in production —
 * license offers (`offer_id`) and brief bids (`bid_id`) — written before the
 * third `DealLink` arm was added for collabs.
 *
 * The point of these is narrow and deliberate: `linkColumns` and `linkWhere`
 * decide which FK column a hold and grant are written to and looked up by. Get
 * that wrong and money attaches to the wrong deal, silently. These tests pin the
 * existing behaviour so widening the union cannot quietly change it.
 */
function makeEngine(seed: { holds?: any[] } = {}) {
  const holds: any[] = seed.holds ?? [];
  const grants: any[] = [];
  const railCalls: Array<{ op: string; holdId?: string; amountFils?: number }> = [];
  const walletCredits: any[] = [];
  let idSeq = 0;

  const rail = {
    source: ReelLicenseFundingSource.payout_balance,
    hold: async (input: any) => {
      railCalls.push({ op: "hold", amountFils: input.amountFils });
      return {
        funding_source: ReelLicenseFundingSource.payout_balance,
        amount_fils: input.amountFils,
        stripe_payment_intent_id: null,
        idempotency_key: input.idempotencyKey,
      };
    },
    capture: async (ref: any) => {
      railCalls.push({ op: "capture", holdId: ref.holdId, amountFils: ref.amountFils });
    },
    release: async (ref: any) => {
      railCalls.push({ op: "release", holdId: ref.holdId });
    },
  };

  const repoFor = (entity: unknown) => {
    if (entity === ReelLicenseEscrowHold) {
      return {
        create: (x: any) => ({ id: `hold-${++idSeq}`, ...x }),
        save: async (x: any) => {
          holds.push(x);
          return x;
        },
        findOne: async ({ where }: any) =>
          holds.find((h) => Object.entries(where).every(([k, v]) => h[k] === v)) ?? null,
        update: async (where: any, patch: any) => {
          const h = holds.find((x) => x.id === where.id);
          if (h) Object.assign(h, patch);
        },
      };
    }
    if (entity === ReelLicenseGrant) {
      return {
        create: (x: any) => ({ id: `grant-${++idSeq}`, ...x }),
        save: async (x: any) => {
          grants.push(x);
          return x;
        },
        update: async (where: any, patch: any) => {
          const g = grants.find((x) => x.id === where.id);
          if (g) Object.assign(g, patch);
        },
      };
    }
    throw new Error(`unexpected repository: ${String(entity)}`);
  };

  const manager = { getRepository: repoFor } as any;
  const wallet = {
    credit: async (ctx: any) => {
      walletCredits.push(ctx);
      return { id: `wtx-${++idSeq}` };
    },
  } as any;

  const engine = new EscrowEngine(
    { [ReelLicenseFundingSource.payout_balance]: rail } as any,
    wallet,
  );
  return { engine, manager, holds, grants, railCalls, walletCredits };
}

const OFFER: DealLink = { offerId: "offer-1" };
const BID: DealLink = { bidId: "bid-1" };

describe("EscrowEngine.placeHold — existing link arms", () => {
  it("an offer hold writes offer_id and leaves bid_id null", async () => {
    const { engine, manager, holds } = makeEngine();
    await engine.placeHold(manager, {
      vendorId: "v1",
      fundingSource: ReelLicenseFundingSource.payout_balance,
      amountFils: 50_000,
      link: OFFER,
    });
    expect(holds[0].offer_id).toBe("offer-1");
    expect(holds[0].bid_id).toBeNull();
  });

  it("a bid hold writes bid_id and leaves offer_id null", async () => {
    const { engine, manager, holds } = makeEngine();
    await engine.placeHold(manager, {
      vendorId: "v1",
      fundingSource: ReelLicenseFundingSource.payout_balance,
      amountFils: 50_000,
      link: BID,
    });
    expect(holds[0].bid_id).toBe("bid-1");
    expect(holds[0].offer_id).toBeNull();
  });

  it("places the hold on the rail before persisting the row", async () => {
    const { engine, manager, railCalls } = makeEngine();
    await engine.placeHold(manager, {
      vendorId: "v1",
      fundingSource: ReelLicenseFundingSource.payout_balance,
      amountFils: 12_345,
      link: OFFER,
    });
    expect(railCalls).toEqual([{ op: "hold", amountFils: 12_345 }]);
  });
});

describe("EscrowEngine.releaseActiveHold — existing link arms", () => {
  const held = (over: any) => ({
    id: "hold-x",
    status: ReelLicenseHoldStatus.held,
    funding_source: ReelLicenseFundingSource.payout_balance,
    stripe_payment_intent_id: null,
    offer_id: null,
    bid_id: null,
    ...over,
  });

  it("finds and releases a hold by offer_id", async () => {
    const { engine, manager, holds, railCalls } = makeEngine({
      holds: [held({ offer_id: "offer-1" })],
    });
    expect(await engine.releaseActiveHold(manager, OFFER)).toBe(true);
    expect(holds[0].status).toBe(ReelLicenseHoldStatus.released);
    expect(railCalls.at(-1)).toMatchObject({ op: "release", holdId: "hold-x" });
  });

  it("finds and releases a hold by bid_id", async () => {
    const { engine, manager, holds } = makeEngine({ holds: [held({ bid_id: "bid-1" })] });
    expect(await engine.releaseActiveHold(manager, BID)).toBe(true);
    expect(holds[0].status).toBe(ReelLicenseHoldStatus.released);
  });

  it("does not release an offer hold when asked for the bid arm", async () => {
    // The lookup must key off the right column, or a release could free the
    // wrong deal's money.
    const { engine, manager, railCalls } = makeEngine({
      holds: [held({ offer_id: "offer-1" })],
    });
    expect(await engine.releaseActiveHold(manager, BID)).toBe(false);
    expect(railCalls).toHaveLength(0);
  });

  it("returns false when there is no active hold", async () => {
    const { engine, manager } = makeEngine();
    expect(await engine.releaseActiveHold(manager, OFFER)).toBe(false);
  });
});

describe("EscrowEngine.captureAndComplete — existing link arms", () => {
  const hold = {
    id: "hold-x",
    funding_source: ReelLicenseFundingSource.payout_balance,
    stripe_payment_intent_id: null,
  } as any;

  const capture = (link: DealLink) => ({
    link,
    vendorId: "v1",
    creatorId: "c1",
    reelId: "reel-1",
    scope: ReelLicenseRightsScope.in_platform,
    amountFils: 100_000,
    hold,
    feeRate: 0.2,
  });

  it("splits gross into platform fee and creator net", async () => {
    const { engine, manager, grants, walletCredits } = makeEngine();
    await engine.captureAndComplete(manager, capture(OFFER));
    expect(grants[0].gross_fils).toBe("100000");
    expect(grants[0].platform_fee_fils).toBe("20000");
    expect(grants[0].creator_net_fils).toBe("80000");
    expect(walletCredits[0].amount).toBe(80_000);
  });

  it("writes the grant against the same link arm as the hold", async () => {
    const { engine, manager, grants } = makeEngine();
    await engine.captureAndComplete(manager, capture(BID));
    expect(grants[0].bid_id).toBe("bid-1");
    expect(grants[0].offer_id).toBeNull();
  });

  it("credits the creator wallet against the grant", async () => {
    const { engine, manager, walletCredits } = makeEngine();
    await engine.captureAndComplete(manager, capture(OFFER));
    expect(walletCredits[0].referenceType).toBe("reels_license_grant");
    expect(walletCredits[0].userId).toBe("c1");
  });

  it("calls the irreversible rail capture LAST, after beforeCapture", async () => {
    // Ordering is the whole safety property here: everything reversible must be
    // written before the external call that cannot be undone.
    const order: string[] = [];
    const { engine, manager } = makeEngine();
    await engine.captureAndComplete(manager, {
      ...capture(OFFER),
      beforeCapture: async () => {
        order.push("beforeCapture");
      },
    });
    order.push("done");
    expect(order).toEqual(["beforeCapture", "done"]);
  });

  it("marks the hold captured", async () => {
    const { engine, manager, holds } = makeEngine({ holds: [{ ...hold }] });
    await engine.captureAndComplete(manager, capture(OFFER));
    expect(holds[0].status).toBe(ReelLicenseHoldStatus.captured);
  });
});
