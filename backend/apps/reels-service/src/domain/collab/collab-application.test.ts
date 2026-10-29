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
  Product,
  ProductImage,
  SiteSetting,
  User,
  Vendor,
} from "@materialhub/database";
import { CollabService } from "./collab.service.ts";

/** Phase 1/2 collab types move no money; any escrow call here is a bug. */
const fakeEscrow = {
  placeHold: async () => {
    throw new Error("escrow must not be touched by a non-paid collab");
  },
  releaseActiveHold: async () => false,
  captureAndComplete: async () => {
    throw new Error("escrow must not be touched by a non-paid collab");
  },
};

/**
 * Application-lifecycle harness. Same shape as collab.service.test.ts, plus
 * in-memory application rows and the User / CreatorApplication lookups that
 * eligibility reads.
 */
function makeHarness(
  seed: {
    opportunity?: Partial<CollabOpportunity>;
    applications?: Partial<CollabApplication>[];
    reach?: number;
    category?: string | null;
    /** Injected only by the invite-notification tests; absent everywhere else,
     *  which is what makes the emit path inert for the rest of the suite. */
    notificationEvents?: { add: (name: string, data: any, opts?: any) => Promise<unknown> };
  } = {},
) {
  const opportunities: any[] = [
    {
      id: "opp-1",
      vendor_id: "v1",
      type: CollabOpportunityType.product_seeding,
      visibility: CollabVisibility.board,
      status: CollabOpportunityStatus.open,
      title: "t",
      description: "d",
      slots_total: 1,
      slots_filled: 0,
      applications_close_at: new Date("2099-01-01T00:00:00Z"),
      deliver_by: null,
      min_follower_count: null,
      required_platforms: null,
      required_categories: null,
      seeded_product_id: "p1",
      seeded_qty: 1,
      fee_fils: null,
      ...seed.opportunity,
    },
  ];

  let idSeq = 0;
  const applications: any[] = (seed.applications ?? []).map((a, i) => ({
    id: `app-${i + 1}`,
    opportunity_id: "opp-1",
    creator_id: "c1",
    status: CollabApplicationStatus.applied,
    pitch: null,
    proposed_fee_fils: null,
    agreed_fee_fils: null,
    delivered_reel_id: null,
    revision_count: 0,
    ...a,
  }));
  const events: any[] = [];

  const matches = (row: any, where: any) => Object.entries(where).every(([k, v]) => row[k] === v);

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
        find: async () => opportunities.filter((o) => o.status === CollabOpportunityStatus.open),
      };
    }
    if (entity === CollabApplication) {
      return {
        findOne: async ({ where }: any) => applications.find((a) => matches(a, where)) ?? null,
        create: (x: any) => ({ id: `app-new-${++idSeq}`, ...x }),
        save: async (x: any) => {
          const i = applications.findIndex((a) => a.id === x.id);
          if (i >= 0) applications[i] = x;
          else applications.push(x);
          return x;
        },
        find: async () => applications,
        count: async ({ where }: any) => {
          const clauses = Array.isArray(where) ? where : [where];
          return applications.filter((a) => clauses.some((w) => matches(a, w))).length;
        },
      };
    }
    if (entity === CollabEvent) {
      return {
        create: (x: any) => ({ id: `ev-${++idSeq}`, ...x }),
        save: async (x: any) => {
          events.push(x);
          return x;
        },
        find: async () => events,
      };
    }
    if (entity === User) {
      return { findOne: async () => ({ id: "c1", follower_count: seed.reach ?? 50_000 }) };
    }
    if (entity === CreatorApplication) {
      return {
        findOne: async () =>
          seed.category === null ? null : { primary_category: seed.category ?? "Beauty" },
      };
    }
    if (entity === Vendor) {
      return {
        find: async () => [{ id: "v1", business_name: "Test Vendor", logo_url: null }],
        // invite()'s notification looks the vendor's display name up by id.
        findOne: async () => ({ id: "v1", business_name: "Test Vendor", logo_url: null }),
      };
    }
    if (entity === Product) {
      return {
        find: async () => [{ id: "p1", name: "Test Product" }],
      };
    }
    if (entity === ProductImage) {
      return {
        find: async () => [],
      };
    }
    // approveDelivery reads the shared platform fee rate; null falls back to the default.

    if (entity === SiteSetting) return { findOne: async () => null };

    throw new Error(`unexpected repository request: ${String(entity)}`);
  };

  const manager = { getRepository: repoFor } as any;
  const originalTransaction = AppDataSource.transaction;
  const originalGetRepository = AppDataSource.getRepository;
  (AppDataSource as any).transaction = async (cb: any) => cb(manager);
  (AppDataSource as any).getRepository = repoFor;

  return {
    svc: new CollabService(fakeEscrow as any, seed.notificationEvents),
    opportunities,
    applications,
    events,
    restore: () => {
      (AppDataSource as any).transaction = originalTransaction;
      (AppDataSource as any).getRepository = originalGetRepository;
    },
  };
}

let harness: ReturnType<typeof makeHarness> | null = null;
const use = (seed?: Parameters<typeof makeHarness>[0]) => {
  harness = makeHarness(seed);
  return harness;
};
afterEach(() => {
  harness?.restore();
  harness = null;
});

describe("CollabService.apply", () => {
  it("creates an `applied` row and records the event", async () => {
    const { svc, events } = use();
    const app = await svc.apply("c1", "opp-1", { pitch: "I love this brand" });
    expect(app.status).toBe(CollabApplicationStatus.applied);
    expect(app.pitch).toBe("I love this brand");
    expect(events.at(-1).event_type).toBe(CollabEventType.applied);
  });

  it("refuses when the creator is ineligible, and names why", async () => {
    const { svc } = use({ opportunity: { min_follower_count: 100_000 }, reach: 500 });
    await expect(svc.apply("c1", "opp-1")).rejects.toThrow("not_eligible:below_min_followers");
  });

  it("refuses a second application from the same creator", async () => {
    const { svc } = use({ applications: [{ creator_id: "c1" }] });
    await expect(svc.apply("c1", "opp-1")).rejects.toThrow("already_applied");
  });

  it("reuses the row and re-applies after the creator withdrew", async () => {
    // The unique index keeps a withdrawn row around, so re-applying must update
    // it in place rather than hit "already_applied" forever.
    const { svc, applications } = use({
      applications: [
        {
          creator_id: "c1",
          status: CollabApplicationStatus.withdrawn,
          pitch: "old pitch",
          revision_count: 2,
          accepted_at: new Date("2026-01-01T00:00:00Z"),
        },
      ],
    });
    const app = await svc.apply("c1", "opp-1", { pitch: "new pitch" });
    expect(app.id).toBe("app-1");
    expect(app.status).toBe(CollabApplicationStatus.applied);
    expect(app.pitch).toBe("new pitch");
    expect(app.revision_count).toBe(0);
    expect(app.accepted_at).toBeNull();
    expect(applications).toHaveLength(1);
  });

  it("still refuses re-applying after a decline (not a self-withdrawal)", async () => {
    const { svc } = use({
      applications: [{ creator_id: "c1", status: CollabApplicationStatus.declined }],
    });
    await expect(svc.apply("c1", "opp-1")).rejects.toThrow("already_applied");
  });

  it("refuses after applications_close_at", async () => {
    const { svc } = use({
      opportunity: { applications_close_at: new Date("2020-01-01T00:00:00Z") },
    });
    await expect(svc.apply("c1", "opp-1")).rejects.toThrow("applications_closed");
  });

  it("refuses on a direct (invite-only) opportunity", async () => {
    const { svc } = use({ opportunity: { visibility: CollabVisibility.direct } });
    await expect(svc.apply("c1", "opp-1")).rejects.toThrow("opportunity_is_invite_only");
  });

  it("refuses on a draft opportunity", async () => {
    const { svc } = use({ opportunity: { status: CollabOpportunityStatus.draft } });
    await expect(svc.apply("c1", "opp-1")).rejects.toThrow("opportunity_not_open");
  });

  it("refuses when no slots remain", async () => {
    const { svc } = use({ opportunity: { slots_total: 1, slots_filled: 1 } });
    await expect(svc.apply("c1", "opp-1")).rejects.toThrow("no_slots_remaining");
  });
});

describe("CollabService.invite", () => {
  it("seeds `invited` rows for named creators", async () => {
    const { svc, applications } = use({ opportunity: { visibility: CollabVisibility.direct } });
    const created = await svc.invite("v1", "opp-1", ["c1", "c2"]);
    expect(created).toHaveLength(2);
    expect(applications.every((a) => a.status === CollabApplicationStatus.invited)).toBe(true);
  });

  it("de-duplicates a repeated creator id in one call", async () => {
    const { svc } = use({ opportunity: { visibility: CollabVisibility.direct } });
    const created = await svc.invite("v1", "opp-1", ["c1", "c1"]);
    expect(created).toHaveLength(1);
  });

  it("skips a creator who already has a row rather than erroring", async () => {
    // The vendor should not have to diff the list they already sent.
    const { svc } = use({
      opportunity: { visibility: CollabVisibility.direct },
      applications: [{ creator_id: "c1" }],
    });
    const created = await svc.invite("v1", "opp-1", ["c1", "c2"]);
    expect(created).toHaveLength(1);
    expect(created[0]?.creator_id).toBe("c2");
  });

  it("refuses another vendor's opportunity", async () => {
    const { svc } = use({ opportunity: { visibility: CollabVisibility.direct } });
    await expect(svc.invite("v-other", "opp-1", ["c1"])).rejects.toThrow("not_your_opportunity");
  });

  it("refuses an empty creator list", async () => {
    const { svc } = use();
    await expect(svc.invite("v1", "opp-1", [])).rejects.toThrow("no_creators");
  });

  it("stores the vendor's note on every row it creates", async () => {
    const { svc, applications } = use({ opportunity: { visibility: CollabVisibility.direct } });
    await svc.invite("v1", "opp-1", ["c1", "c2"], "  Loved your last reel  ");
    expect(applications.map((a) => a.invite_note)).toEqual([
      "Loved your last reel",
      "Loved your last reel",
    ]);
  });

  it("stores a whitespace-only note as null, not an empty string", async () => {
    const { svc, applications } = use({ opportunity: { visibility: CollabVisibility.direct } });
    await svc.invite("v1", "opp-1", ["c1"], "   ");
    expect(applications[0].invite_note).toBeNull();
  });
});

describe("CollabService.invite — notification", () => {
  function withQueue(seed: Parameters<typeof use>[0] = {}) {
    const sent: Array<{ name: string; data: any }> = [];
    const harness = use({
      ...seed,
      opportunity: { visibility: CollabVisibility.direct, ...(seed.opportunity ?? {}) },
      notificationEvents: {
        add: async (name: string, data: any) => {
          sent.push({ name, data });
          return undefined;
        },
      },
    });
    return { ...harness, sent };
  }

  it("emits one collab_invited event per newly invited creator", async () => {
    const { svc, sent } = withQueue();
    await svc.invite("v1", "opp-1", ["c1", "c2"]);
    expect(sent).toHaveLength(2);
    expect(sent.map((s) => s.data.userId)).toEqual(["c1", "c2"]);
    expect(sent[0]!.data.notificationType).toBe("collab_invited");
  });

  it("carries the vendor name, opportunity title and note as template variables", async () => {
    const { svc, sent } = withQueue({ opportunity: { title: "Summer glow" } });
    await svc.invite("v1", "opp-1", ["c1"], "Loved your last reel");
    expect(sent[0]!.data.variables).toEqual({
      vendor_name: "Test Vendor",
      opportunity_title: "Summer glow",
      invite_note: "Loved your last reel",
    });
  });

  it("stamps a per-application eventId so a retried invite cannot notify twice", async () => {
    const { svc, sent, applications } = withQueue();
    await svc.invite("v1", "opp-1", ["c1"]);
    expect(sent[0]!.data.eventId).toBe(`collab_invited_${applications[0].id}`);
  });

  it("notifies nobody when every named creator already had a row", async () => {
    const { svc, sent } = withQueue({ applications: [{ creator_id: "c1" }] });
    await svc.invite("v1", "opp-1", ["c1"]);
    expect(sent).toHaveLength(0);
  });

  it("still returns the invites when the queue is down", async () => {
    // The rows are already committed — a Redis blip must not fail the vendor's
    // call or roll anything back.
    const harness = use({
      opportunity: { visibility: CollabVisibility.direct },
      notificationEvents: {
        add: async () => {
          throw new Error("redis is down");
        },
      },
    });
    const created = await harness.svc.invite("v1", "opp-1", ["c1"]);
    expect(created).toHaveLength(1);
  });
});

describe("CollabService.acceptApplication", () => {
  it("fills a slot and flips the opportunity to `filled` on the last one", async () => {
    const { svc, opportunities } = use({ applications: [{}] });
    const app = await svc.acceptApplication("v1", "app-1");
    expect(app.status).toBe(CollabApplicationStatus.accepted);
    expect(opportunities[0].slots_filled).toBe(1);
    expect(opportunities[0].status).toBe(CollabOpportunityStatus.filled);
  });

  it("leaves a multi-slot opportunity open until the last slot fills", async () => {
    const { svc, opportunities } = use({
      opportunity: { slots_total: 3 },
      applications: [{}],
    });
    await svc.acceptApplication("v1", "app-1");
    expect(opportunities[0].slots_filled).toBe(1);
    expect(opportunities[0].status).toBe(CollabOpportunityStatus.open);
  });

  it("refuses when slots are already full", async () => {
    const { svc } = use({
      opportunity: { slots_total: 1, slots_filled: 1, status: CollabOpportunityStatus.filled },
      applications: [{}],
    });
    await expect(svc.acceptApplication("v1", "app-1")).rejects.toThrow("opportunity_not_open");
  });

  it("leaves the other applicants pending rather than auto-declining them", async () => {
    // Silently declining people is worse than leaving them for the vendor or the
    // sweep job to resolve.
    const { svc, applications } = use({
      applications: [{ creator_id: "c1" }, { creator_id: "c2" }],
    });
    await svc.acceptApplication("v1", "app-1");
    expect(applications[1].status).toBe(CollabApplicationStatus.applied);
  });

  it("snapshots the creator's proposed fee as the agreed fee", async () => {
    const { svc } = use({ applications: [{ proposed_fee_fils: "75000" }] });
    const app = await svc.acceptApplication("v1", "app-1");
    expect(app.agreed_fee_fils).toBe("75000");
  });

  it("refuses an application that is already accepted", async () => {
    const { svc } = use({ applications: [{ status: CollabApplicationStatus.accepted }] });
    await expect(svc.acceptApplication("v1", "app-1")).rejects.toThrow(
      "application_not_acceptable",
    );
  });
});

describe("CollabService.respondToInvite", () => {
  it("accepting an invite moves it to `applied`, not straight to accepted", async () => {
    // The vendor still has to place them in a slot; that is where slot accounting
    // happens, so an invite acceptance must not bypass it.
    const { svc } = use({ applications: [{ status: CollabApplicationStatus.invited }] });
    const app = await svc.respondToInvite("c1", "app-1", true);
    expect(app.status).toBe(CollabApplicationStatus.applied);
  });

  it("declining an invite records `declined`", async () => {
    const { svc, events } = use({ applications: [{ status: CollabApplicationStatus.invited }] });
    const app = await svc.respondToInvite("c1", "app-1", false);
    expect(app.status).toBe(CollabApplicationStatus.declined);
    expect(events.at(-1).event_type).toBe(CollabEventType.declined);
  });

  it("refuses another creator's invite", async () => {
    const { svc } = use({ applications: [{ status: CollabApplicationStatus.invited }] });
    await expect(svc.respondToInvite("c-other", "app-1", true)).rejects.toThrow(
      "not_your_application",
    );
  });
});

describe("CollabService.withdraw", () => {
  it("frees the slot and reopens the opportunity when the creator had a slot", async () => {
    const { svc, opportunities } = use({
      opportunity: { slots_total: 1, slots_filled: 1, status: CollabOpportunityStatus.filled },
      applications: [{ status: CollabApplicationStatus.accepted }],
    });
    await svc.withdraw("c1", "app-1");
    expect(opportunities[0].slots_filled).toBe(0);
    expect(opportunities[0].status).toBe(CollabOpportunityStatus.open);
  });

  it("does not touch slots when the creator had not been accepted", async () => {
    const { svc, opportunities } = use({ applications: [{}] });
    await svc.withdraw("c1", "app-1");
    expect(opportunities[0].slots_filled).toBe(0);
  });

  it("refuses to withdraw an already-completed application", async () => {
    const { svc } = use({ applications: [{ status: CollabApplicationStatus.completed }] });
    await expect(svc.withdraw("c1", "app-1")).rejects.toThrow("application_not_withdrawable");
  });
});

describe("CollabService delivery cycle", () => {
  it("submitDelivery requires an accepted-ish status", async () => {
    const { svc } = use({ applications: [{ status: CollabApplicationStatus.applied }] });
    await expect(svc.submitDelivery("c1", "app-1", "reel-1")).rejects.toThrow(
      "application_not_deliverable",
    );
  });

  it("submitDelivery links the reel and moves to `delivered`", async () => {
    const { svc } = use({ applications: [{ status: CollabApplicationStatus.accepted }] });
    const app = await svc.submitDelivery("c1", "app-1", "reel-1");
    expect(app.status).toBe(CollabApplicationStatus.delivered);
    expect(app.delivered_reel_id).toBe("reel-1");
  });

  it("requestRevision increments revision_count and returns it to the creator", async () => {
    const { svc } = use({ applications: [{ status: CollabApplicationStatus.delivered }] });
    const app = await svc.requestRevision("v1", "app-1", "brighter lighting please");
    expect(app.status).toBe(CollabApplicationStatus.revision_requested);
    expect(app.revision_count).toBe(1);
  });

  it("a revision can be re-delivered", async () => {
    const { svc } = use({
      applications: [{ status: CollabApplicationStatus.revision_requested }],
    });
    const app = await svc.submitDelivery("c1", "app-1", "reel-2");
    expect(app.status).toBe(CollabApplicationStatus.delivered);
  });

  it("approveDelivery completes the application and the opportunity", async () => {
    const { svc, opportunities } = use({
      opportunity: { slots_total: 1, slots_filled: 1, status: CollabOpportunityStatus.filled },
      applications: [{ status: CollabApplicationStatus.delivered }],
    });
    const app = await svc.approveDelivery("v1", "app-1");
    expect(app.status).toBe(CollabApplicationStatus.completed);
    expect(opportunities[0].status).toBe(CollabOpportunityStatus.completed);
  });

  it("approveDelivery leaves the opportunity open while another creator is outstanding", async () => {
    const { svc, opportunities } = use({
      opportunity: { slots_total: 2, slots_filled: 2, status: CollabOpportunityStatus.filled },
      applications: [
        { status: CollabApplicationStatus.delivered },
        { creator_id: "c2", status: CollabApplicationStatus.accepted },
      ],
    });
    await svc.approveDelivery("v1", "app-1");
    expect(opportunities[0].status).toBe(CollabOpportunityStatus.filled);
  });

  it("approveDelivery refuses anything not delivered", async () => {
    const { svc } = use({ applications: [{ status: CollabApplicationStatus.accepted }] });
    await expect(svc.approveDelivery("v1", "app-1")).rejects.toThrow("application_not_delivered");
  });

  it("rejectDelivery frees the slot back to the vendor", async () => {
    const { svc, opportunities } = use({
      opportunity: { slots_total: 1, slots_filled: 1, status: CollabOpportunityStatus.filled },
      applications: [{ status: CollabApplicationStatus.delivered }],
    });
    await svc.rejectDelivery("v1", "app-1", "off brief");
    expect(opportunities[0].slots_filled).toBe(0);
    expect(opportunities[0].status).toBe(CollabOpportunityStatus.open);
  });
});

describe("CollabService.listBoard", () => {
  it("omits eligibility for an anonymous viewer", async () => {
    const { svc } = use();
    const rows = await svc.listBoard();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.eligibility).toBeUndefined();
  });

  it("attaches eligibility for a signed-in creator", async () => {
    const { svc } = use({ opportunity: { min_follower_count: 100_000 }, reach: 1_000 });
    const rows = await svc.listBoard("c1");
    expect(rows[0]?.eligibility).toEqual({
      eligible: false,
      reasons: ["below_min_followers"],
    });
  });

  it("still lists an opportunity the viewer is ineligible for", async () => {
    // The board shows everything and explains why Apply is disabled, rather than
    // hiding work a creator narrowly misses.
    const { svc } = use({ opportunity: { min_follower_count: 100_000 }, reach: 1_000 });
    expect(await svc.listBoard("c1")).toHaveLength(1);
  });
});

describe("CollabService.resolveCreatorReach", () => {
  it("falls back to on-platform followers while spec §1-6 is unbuilt", async () => {
    const { svc } = use({ reach: 4_200 });
    expect(await svc.resolveCreatorReach("c1")).toBe(4_200);
  });

  it("reports zero reach for a creator with no approved application", async () => {
    const { svc } = use({ category: null });
    expect(await svc.resolveCreatorCategories("c1")).toEqual([]);
  });
});
