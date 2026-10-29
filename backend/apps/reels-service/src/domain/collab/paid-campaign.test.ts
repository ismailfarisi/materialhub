import { afterEach, describe, expect, it } from "bun:test";
import {
  AppDataSource,
  CollabActor,
  CollabApplication,
  CollabApplicationStatus,
  CollabEvent,
  CollabEventType,
  CollabOpportunity,
  CollabOpportunityStatus,
  CollabOpportunityType,
  CollabVisibility,
  CreatorApplication,
  ReelLicenseEscrowHold,
  ReelLicenseFundingSource,
  ReelLicenseHoldStatus,
  SiteSetting,
  User,
} from "@materialhub/database";
import { CollabService } from "./collab.service.ts";

/**
 * The paid_campaign money path. Every escrow interaction is recorded so the
 * tests can assert not just the outcome but that money moved exactly once, in
 * the right direction, against the right application.
 */
function makeHarness(
  seed: {
    opportunity?: Partial<CollabOpportunity>;
    application?: Partial<CollabApplication>;
    holdThrows?: boolean;
    activeHold?: boolean;
  } = {},
) {
  const escrowCalls: Array<{ op: string; link?: unknown; amountFils?: number }> = [];
  const escrow = {
    placeHold: async (_m: unknown, input: any) => {
      if (seed.holdThrows) throw new Error("insufficient_balance");
      escrowCalls.push({ op: "placeHold", link: input.link, amountFils: input.amountFils });
      return { id: "hold-1" };
    },
    releaseActiveHold: async (_m: unknown, link: any) => {
      escrowCalls.push({ op: "release", link });
      return true;
    },
    captureAndComplete: async (m: any, input: any) => {
      escrowCalls.push({ op: "capture", link: input.link, amountFils: input.amountFils });
      if (input.beforeCapture) await input.beforeCapture(m, { id: "grant-1" });
      return { id: "grant-1" };
    },
  };

  const opportunities: any[] = [
    {
      id: "opp-1",
      vendor_id: "v1",
      type: CollabOpportunityType.paid_campaign,
      visibility: CollabVisibility.board,
      status: CollabOpportunityStatus.open,
      title: "t",
      description: "d",
      slots_total: 1,
      slots_filled: 0,
      created_at: new Date("2026-08-01T00:00:00Z"),
      deliver_by: null,
      applications_close_at: new Date("2099-01-01T00:00:00Z"),
      fee_fils: "100000",
      funding_source: ReelLicenseFundingSource.payout_balance,
      rights_scope: null,
      min_follower_count: null,
      required_platforms: null,
      required_categories: null,
      ...seed.opportunity,
    },
  ];
  const applications: any[] = [
    {
      id: "app-1",
      opportunity_id: "opp-1",
      creator_id: "c1",
      status: CollabApplicationStatus.applied,
      proposed_fee_fils: null,
      agreed_fee_fils: null,
      delivered_reel_id: null,
      revision_count: 0,
      ...seed.application,
    },
  ];
  const events: any[] = [];
  let idSeq = 0;

  const repoFor = (entity: unknown) => {
    if (entity === CollabOpportunity) {
      return {
        findOne: async ({ where }: any) => opportunities.find((o) => o.id === where.id) ?? null,
        create: (x: any) => ({ id: `opp-${++idSeq}`, ...x }),
        save: async (x: any) => {
          opportunities[opportunities.findIndex((o) => o.id === x.id)] = x;
          return x;
        },
        find: async () => opportunities,
      };
    }
    if (entity === CollabApplication) {
      return {
        findOne: async ({ where }: any) =>
          applications.find((a) => Object.entries(where).every(([k, v]) => a[k] === v)) ?? null,
        create: (x: any) => ({ id: `app-${++idSeq}`, ...x }),
        save: async (x: any) => {
          const i = applications.findIndex((a) => a.id === x.id);
          if (i >= 0) applications[i] = x;
          else applications.push(x);
          return x;
        },
        find: async () => applications,
        count: async () => 0,
      };
    }
    if (entity === CollabEvent) {
      return {
        create: (x: any) => ({ id: `ev-${++idSeq}`, ...x }),
        save: async (x: any) => {
          events.push(x);
          return x;
        },
      };
    }
    if (entity === ReelLicenseEscrowHold) {
      return {
        findOne: async () =>
          seed.activeHold === false
            ? null
            : {
                id: "hold-1",
                status: ReelLicenseHoldStatus.held,
                funding_source: ReelLicenseFundingSource.payout_balance,
                stripe_payment_intent_id: null,
              },
      };
    }
    if (entity === SiteSetting) return { findOne: async () => null };
    if (entity === User) return { findOne: async () => ({ id: "c1", follower_count: 50_000 }) };
    if (entity === CreatorApplication) {
      return { findOne: async () => ({ primary_category: "Beauty" }) };
    }
    throw new Error(`unexpected repository: ${String(entity)}`);
  };

  const manager = { getRepository: repoFor } as any;
  const oT = AppDataSource.transaction;
  const oG = AppDataSource.getRepository;
  (AppDataSource as any).transaction = async (cb: any) => cb(manager);
  (AppDataSource as any).getRepository = repoFor;

  return {
    svc: new CollabService(escrow as any),
    opportunities,
    applications,
    events,
    escrowCalls,
    restore: () => {
      (AppDataSource as any).transaction = oT;
      (AppDataSource as any).getRepository = oG;
    },
  };
}

let h: ReturnType<typeof makeHarness> | null = null;
const use = (seed?: Parameters<typeof makeHarness>[0]) => {
  h = makeHarness(seed);
  return h;
};
afterEach(() => {
  h?.restore();
  h = null;
});

describe("paid_campaign — hold on accept", () => {
  it("places a hold for the opportunity fee against the application", async () => {
    const { svc, escrowCalls } = use();
    await svc.acceptApplication("v1", "app-1");
    expect(escrowCalls).toEqual([
      { op: "placeHold", link: { collabApplicationId: "app-1" }, amountFils: 100_000 },
    ]);
  });

  it("holds the creator's counter-offer when one was agreed", async () => {
    const { svc, escrowCalls } = use({ application: { proposed_fee_fils: "75000" } });
    await svc.acceptApplication("v1", "app-1");
    expect(escrowCalls[0]?.amountFils).toBe(75_000);
  });

  it("rolls the whole accept back when the hold fails", async () => {
    // A filled slot with no held funds is the failure mode this ordering exists
    // to prevent, so the throw must propagate rather than be swallowed.
    const { svc } = use({ holdThrows: true });
    await expect(svc.acceptApplication("v1", "app-1")).rejects.toThrow("insufficient_balance");
  });

  it("refuses to accept when the opportunity has no funding source", async () => {
    const { svc } = use({ opportunity: { funding_source: null } });
    await expect(svc.acceptApplication("v1", "app-1")).rejects.toThrow("funding_source_not_set");
  });

  it("places NO hold for a seeding collab", async () => {
    const { svc, escrowCalls } = use({
      opportunity: {
        type: CollabOpportunityType.product_seeding,
        fee_fils: null,
        funding_source: null,
      },
    });
    await svc.acceptApplication("v1", "app-1");
    expect(escrowCalls).toHaveLength(0);
  });
});

describe("paid_campaign — capture on approve", () => {
  const delivered = {
    application: {
      status: CollabApplicationStatus.delivered,
      agreed_fee_fils: "100000",
      delivered_reel_id: "reel-1",
    },
    opportunity: { status: CollabOpportunityStatus.filled, slots_filled: 1 },
  };

  it("captures the agreed fee against the application", async () => {
    const { svc, escrowCalls } = use(delivered);
    await svc.approveDelivery("v1", "app-1");
    expect(escrowCalls).toEqual([
      { op: "capture", link: { collabApplicationId: "app-1" }, amountFils: 100_000 },
    ]);
  });

  it("completes the application inside beforeCapture, so it is persisted first", async () => {
    // Everything reversible must be written before the irreversible rail call.
    const { svc, applications, events } = use(delivered);
    await svc.approveDelivery("v1", "app-1");
    expect(applications[0].status).toBe(CollabApplicationStatus.completed);
    expect(events.map((e) => e.event_type)).toContain(CollabEventType.settled);
  });

  it("refuses to capture with no delivered reel", async () => {
    const { svc } = use({
      ...delivered,
      application: { ...delivered.application, delivered_reel_id: null },
    });
    await expect(svc.approveDelivery("v1", "app-1")).rejects.toThrow("no_delivered_reel");
  });

  it("refuses to capture when the hold has vanished", async () => {
    const { svc } = use({ ...delivered, activeHold: false });
    await expect(svc.approveDelivery("v1", "app-1")).rejects.toThrow("no_active_hold");
  });

  it("captures NOTHING for a seeding collab", async () => {
    const { svc, escrowCalls, applications } = use({
      opportunity: {
        type: CollabOpportunityType.product_seeding,
        status: CollabOpportunityStatus.filled,
        slots_filled: 1,
        fee_fils: null,
      },
      application: { status: CollabApplicationStatus.delivered, delivered_reel_id: "reel-1" },
    });
    await svc.approveDelivery("v1", "app-1");
    expect(escrowCalls).toHaveLength(0);
    expect(applications[0].status).toBe(CollabApplicationStatus.completed);
  });
});

describe("paid_campaign — release on the unhappy paths", () => {
  it("releases when the creator withdraws after acceptance", async () => {
    const { svc, escrowCalls } = use({
      application: { status: CollabApplicationStatus.accepted },
      opportunity: { status: CollabOpportunityStatus.filled, slots_filled: 1 },
    });
    await svc.withdraw("c1", "app-1");
    expect(escrowCalls).toEqual([{ op: "release", link: { collabApplicationId: "app-1" } }]);
  });

  it("releases when the creator withdraws mid-delivery", async () => {
    const { svc, escrowCalls } = use({
      application: { status: CollabApplicationStatus.in_progress },
      opportunity: { status: CollabOpportunityStatus.filled, slots_filled: 1 },
    });
    await svc.withdraw("c1", "app-1");
    expect(escrowCalls.some((c) => c.op === "release")).toBe(true);
  });

  it("releases when the vendor rejects the delivery", async () => {
    const { svc, escrowCalls } = use({
      application: { status: CollabApplicationStatus.delivered, delivered_reel_id: "reel-1" },
      opportunity: { status: CollabOpportunityStatus.filled, slots_filled: 1 },
    });
    await svc.rejectDelivery("v1", "app-1", "off brief");
    expect(escrowCalls).toEqual([{ op: "release", link: { collabApplicationId: "app-1" } }]);
  });

  it("does NOT release when the creator withdraws before being accepted", async () => {
    // No slot was held, so no money was ever held either.
    const { svc, escrowCalls } = use({ application: { status: CollabApplicationStatus.applied } });
    await svc.withdraw("c1", "app-1");
    expect(escrowCalls).toHaveLength(0);
  });

  it("does not release on a seeding collab, which never held money", async () => {
    const { svc, escrowCalls } = use({
      opportunity: {
        type: CollabOpportunityType.product_seeding,
        status: CollabOpportunityStatus.filled,
        slots_filled: 1,
        fee_fils: null,
      },
      application: { status: CollabApplicationStatus.accepted },
    });
    await svc.withdraw("c1", "app-1");
    expect(escrowCalls).toHaveLength(0);
  });

  it("frees the slot as well as the money", async () => {
    const { svc, opportunities } = use({
      application: { status: CollabApplicationStatus.accepted },
      opportunity: { status: CollabOpportunityStatus.filled, slots_filled: 1 },
    });
    await svc.withdraw("c1", "app-1");
    expect(opportunities[0].slots_filled).toBe(0);
    expect(opportunities[0].status).toBe(CollabOpportunityStatus.open);
  });
});

describe("paid_campaign — audit trail", () => {
  it("snapshots the held amount on the accepted event", async () => {
    const { svc, events } = use();
    await svc.acceptApplication("v1", "app-1");
    const accepted = events.find((e) => e.event_type === CollabEventType.accepted);
    expect(accepted.amount_fils_snapshot).toBe("100000");
    expect(accepted.actor).toBe(CollabActor.vendor);
  });
});
