import { afterEach, describe, expect, it } from "bun:test";
import {
  AppDataSource,
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
  VendorLocation,
} from "@materialhub/database";
import { CollabService } from "./collab.service.ts";

/**
 * Event appearances (spec §7.6). The distinguishing property: no reel is
 * produced, so settlement must NOT create a ReelLicenseGrant — there is nothing
 * to grant rights over. It credits the creator wallet instead.
 */
function makeHarness(
  seed: {
    opportunity?: Partial<CollabOpportunity>;
    application?: Partial<CollabApplication>;
    locationOwner?: string | null;
  } = {},
) {
  const escrowCalls: Array<{ op: string; input?: any }> = [];
  const escrow = {
    placeHold: async (_m: unknown, input: any) => {
      escrowCalls.push({ op: "placeHold", input });
      return { id: "hold-1" };
    },
    releaseActiveHold: async () => {
      escrowCalls.push({ op: "release" });
      return true;
    },
    captureAndComplete: async (m: any, input: any) => {
      escrowCalls.push({ op: "captureAndComplete", input });
      if (input.beforeCapture) await input.beforeCapture(m, { id: "grant-1" });
      return { id: "grant-1" };
    },
    captureToWallet: async (m: any, input: any) => {
      escrowCalls.push({ op: "captureToWallet", input });
      if (input.beforeCapture) await input.beforeCapture(m);
      return { net: 80_000, fee: 20_000, walletTransactionId: "wtx-1" };
    },
  };

  const opportunities: any[] = [
    {
      id: "opp-1",
      vendor_id: "v1",
      type: CollabOpportunityType.event_appearance,
      visibility: CollabVisibility.board,
      status: CollabOpportunityStatus.open,
      title: "Store opening",
      description: "d",
      slots_total: 1,
      slots_filled: 0,
      created_at: new Date("2026-08-01T00:00:00Z"),
      deliver_by: null,
      applications_close_at: new Date("2099-01-01T00:00:00Z"),
      fee_fils: "100000",
      funding_source: ReelLicenseFundingSource.payout_balance,
      location_id: "loc-1",
      starts_at: new Date("2026-09-01T10:00:00Z"),
      ends_at: new Date("2026-09-01T12:00:00Z"),
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
          const i = opportunities.findIndex((o) => o.id === x.id);
          if (i >= 0) opportunities[i] = x;
          else opportunities.push(x);
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
        findOne: async () => ({
          id: "hold-1",
          status: ReelLicenseHoldStatus.held,
          funding_source: ReelLicenseFundingSource.payout_balance,
          stripe_payment_intent_id: null,
        }),
      };
    }
    if (entity === VendorLocation) {
      return {
        findOne: async () =>
          seed.locationOwner === null
            ? null
            : { id: "loc-1", vendor_id: seed.locationOwner ?? "v1" },
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

const baseCreate = {
  vendorId: "v1",
  type: CollabOpportunityType.event_appearance,
  visibility: CollabVisibility.board,
  title: "Store opening",
  description: "Come host our launch",
  locationId: "loc-1",
  startsAt: new Date("2026-09-01T10:00:00Z"),
  endsAt: new Date("2026-09-01T12:00:00Z"),
  feeFils: 100_000,
  fundingSource: ReelLicenseFundingSource.payout_balance,
  applicationsCloseAt: new Date("2026-08-25T00:00:00Z"),
};

describe("event_appearance — creation and venue", () => {
  it("is creatable now that phase 4 has landed its settlement path", async () => {
    const { svc } = use();
    const opp = await svc.createOpportunity(baseCreate);
    expect(opp.type).toBe(CollabOpportunityType.event_appearance);
  });

  it("refuses a venue belonging to another vendor", async () => {
    const { svc } = use({ locationOwner: "v-other" });
    await expect(svc.createOpportunity(baseCreate)).rejects.toThrow("not_your_location");
  });

  it("refuses an unknown venue", async () => {
    const { svc } = use({ locationOwner: null });
    await expect(svc.createOpportunity(baseCreate)).rejects.toThrow("location_not_found");
  });

  it("refuses a slot that ends before it starts", async () => {
    const { svc } = use();
    await expect(
      svc.createOpportunity({ ...baseCreate, endsAt: new Date("2026-09-01T09:00:00Z") }),
    ).rejects.toThrow("slot_end_before_start");
  });

  it("refuses a slot with no times", async () => {
    const { svc } = use();
    await expect(
      svc.createOpportunity({ ...baseCreate, startsAt: null, endsAt: null }),
    ).rejects.toThrow("slot_required");
  });

  it("never consults staff, working hours or the capacity ledger", async () => {
    // Spec §7.6: a creator is not a staff member. Wiring an appearance into the
    // availability engine would corrupt capacity maths for real service
    // bookings. The harness throws on any repository beyond the ones listed, so
    // a stray booking-engine read would fail this test.
    const { svc } = use();
    await expect(svc.createOpportunity(baseCreate)).resolves.toBeDefined();
  });
});

describe("event_appearance — delivery without a reel", () => {
  it("accepts a delivery with no reel id", async () => {
    const { svc, applications } = use({
      application: { status: CollabApplicationStatus.accepted },
    });
    const app = await svc.submitDelivery("c1", "app-1");
    expect(app.status).toBe(CollabApplicationStatus.delivered);
    expect(app.delivered_reel_id).toBeNull();
  });

  it("still requires a reel for a reel-producing type", async () => {
    const { svc } = use({
      opportunity: { type: CollabOpportunityType.paid_campaign },
      application: { status: CollabApplicationStatus.accepted },
    });
    await expect(svc.submitDelivery("c1", "app-1")).rejects.toThrow("reel_required");
  });
});

describe("event_appearance — settlement produces NO grant", () => {
  const delivered = {
    application: {
      status: CollabApplicationStatus.delivered,
      agreed_fee_fils: "100000",
      delivered_reel_id: null,
    },
    opportunity: { status: CollabOpportunityStatus.filled, slots_filled: 1 },
  };

  it("settles through captureToWallet, not captureAndComplete", async () => {
    const { svc, escrowCalls } = use(delivered);
    await svc.approveDelivery("v1", "app-1");
    const ops = escrowCalls.map((c) => c.op);
    expect(ops).toContain("captureToWallet");
    expect(ops).not.toContain("captureAndComplete");
  });

  it("credits the creator against the collab application", async () => {
    const { svc, escrowCalls } = use(delivered);
    await svc.approveDelivery("v1", "app-1");
    const call = escrowCalls.find((c) => c.op === "captureToWallet");
    expect(call?.input).toMatchObject({
      creatorId: "c1",
      amountFils: 100_000,
      transactionType: "collab_appearance_credit",
      referenceType: "collab_application",
      referenceId: "app-1",
    });
  });

  it("completes the application and records `settled`", async () => {
    const { svc, applications, events } = use(delivered);
    await svc.approveDelivery("v1", "app-1");
    expect(applications[0].status).toBe(CollabApplicationStatus.completed);
    expect(events.map((e) => e.event_type)).toContain(CollabEventType.settled);
  });

  it("does not demand a delivered reel", async () => {
    // captureAndComplete requires reelId; the appearance path must not.
    const { svc } = use(delivered);
    await expect(svc.approveDelivery("v1", "app-1")).resolves.toBeDefined();
  });

  it("a paid_campaign still goes through captureAndComplete and produces a grant", async () => {
    const { svc, escrowCalls } = use({
      opportunity: {
        type: CollabOpportunityType.paid_campaign,
        status: CollabOpportunityStatus.filled,
        slots_filled: 1,
      },
      application: {
        status: CollabApplicationStatus.delivered,
        agreed_fee_fils: "100000",
        delivered_reel_id: "reel-1",
      },
    });
    await svc.approveDelivery("v1", "app-1");
    expect(escrowCalls.map((c) => c.op)).toContain("captureAndComplete");
  });
});

describe("event_appearance — escrow lifecycle", () => {
  it("holds funds on accept, like a paid campaign", async () => {
    const { svc, escrowCalls } = use();
    await svc.acceptApplication("v1", "app-1");
    expect(escrowCalls[0]?.op).toBe("placeHold");
    expect(escrowCalls[0]?.input.amountFils).toBe(100_000);
  });

  it("releases when the creator withdraws", async () => {
    const { svc, escrowCalls } = use({
      application: { status: CollabApplicationStatus.accepted },
      opportunity: { status: CollabOpportunityStatus.filled, slots_filled: 1 },
    });
    await svc.withdraw("c1", "app-1");
    expect(escrowCalls.map((c) => c.op)).toContain("release");
  });
});
