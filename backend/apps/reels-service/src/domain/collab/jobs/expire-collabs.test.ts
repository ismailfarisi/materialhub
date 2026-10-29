import { afterEach, describe, expect, it } from "bun:test";
import {
  AppDataSource,
  CollabActor,
  CollabApplication,
  CollabApplicationStatus,
  CollabEvent,
  CollabOpportunity,
  CollabOpportunityStatus,
  CollabOpportunityType,
  CollabVisibility,
  SiteSetting,
} from "@materialhub/database";
import { CollabService, INVITE_TTL_DAYS } from "../collab.service.ts";
import { CollabDeadlineRemindersJob } from "./collab-deadline-reminders.job.ts";
import { ExpireCollabsJob } from "./expire-collabs.job.ts";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-09-01T00:00:00Z");
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
const ahead = (days: number) => new Date(NOW.getTime() + days * DAY);

/**
 * The sweep reads with TypeORM operators (LessThanOrEqual / In / Between) that a
 * plain object comparison cannot evaluate, so the fake repo applies each
 * `where` through a small matcher instead of pretending the operators are values.
 */
function makeHarness(seed: {
  opportunities?: Partial<CollabOpportunity>[];
  applications?: Partial<CollabApplication>[];
}) {
  const opportunities: any[] = (seed.opportunities ?? []).map((o, i) => ({
    id: `opp-${i + 1}`,
    vendor_id: "v1",
    type: CollabOpportunityType.product_seeding,
    visibility: CollabVisibility.board,
    status: CollabOpportunityStatus.open,
    title: "t",
    description: "d",
    slots_total: 1,
    slots_filled: 0,
    created_at: ago(60),
    applications_close_at: null,
    deliver_by: null,
    fee_fils: null,
    funding_source: null,
    ...o,
  }));
  const applications: any[] = (seed.applications ?? []).map((a, i) => ({
    id: `app-${i + 1}`,
    opportunity_id: "opp-1",
    creator_id: `c${i + 1}`,
    status: CollabApplicationStatus.applied,
    created_at: ago(1),
    shipped_at: null,
    received_at: null,
    deliver_by: null,
    agreed_fee_fils: null,
    revision_count: 0,
    ...a,
  }));
  const events: any[] = [];
  const escrowCalls: string[] = [];
  let idSeq = 0;

  const matchOne = (row: any, key: string, cond: any): boolean => {
    if (cond && typeof cond === "object" && "_type" in cond) {
      const v = row[key];
      switch (cond._type) {
        case "lessThanOrEqual":
          return v != null && new Date(v).getTime() <= new Date(cond._value).getTime();
        case "in":
          return cond._value.includes(v);
        case "isNull":
          return v == null;
        case "between":
          return (
            v != null &&
            new Date(v).getTime() >= new Date(cond._value[0]).getTime() &&
            new Date(v).getTime() <= new Date(cond._value[1]).getTime()
          );
        default:
          return true;
      }
    }
    return row[key] === cond;
  };
  const matches = (row: any, where: any) =>
    Object.entries(where).every(([k, v]) => matchOne(row, k, v));

  const repoFor = (entity: unknown) => {
    if (entity === CollabOpportunity) {
      return {
        find: async ({ where }: any) => opportunities.filter((o) => matches(o, where)),
        findOne: async ({ where }: any) => opportunities.find((o) => o.id === where.id) ?? null,
        save: async (x: any) => {
          opportunities[opportunities.findIndex((o) => o.id === x.id)] = x;
          return x;
        },
      };
    }
    if (entity === CollabApplication) {
      return {
        find: async ({ where }: any) => applications.filter((a) => matches(a, where)),
        findOne: async ({ where }: any) => applications.find((a) => a.id === where.id) ?? null,
        save: async (x: any) => {
          applications[applications.findIndex((a) => a.id === x.id)] = x;
          return x;
        },
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
    if (entity === SiteSetting) return { findOne: async () => null };
    throw new Error(`unexpected repository: ${String(entity)}`);
  };

  const manager = { getRepository: repoFor } as any;
  const oT = AppDataSource.transaction;
  const oG = AppDataSource.getRepository;
  (AppDataSource as any).transaction = async (cb: any) => cb(manager);
  (AppDataSource as any).getRepository = repoFor;

  const escrow = {
    releaseActiveHold: async () => {
      escrowCalls.push("release");
      return true;
    },
    placeHold: async () => ({ id: "hold-1" }),
    captureAndComplete: async () => ({ id: "grant-1" }),
    captureToWallet: async () => ({ net: 0, fee: 0, walletTransactionId: "w" }),
  };

  const svc = new CollabService(escrow as any);
  return {
    svc,
    job: new ExpireCollabsJob("redis://unused", svc),
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
const use = (seed: Parameters<typeof makeHarness>[0]) => {
  h = makeHarness(seed);
  return h;
};
afterEach(() => {
  h?.restore();
  h = null;
});

describe("ExpireCollabsJob — unanswered invitations", () => {
  it("expires an invitation older than the TTL", async () => {
    const { job, applications, events } = use({
      opportunities: [{ visibility: CollabVisibility.direct }],
      applications: [
        { status: CollabApplicationStatus.invited, created_at: ago(INVITE_TTL_DAYS + 1) },
      ],
    });
    const r = await job.handle(NOW);
    expect(r.invitesExpired).toBe(1);
    expect(applications[0].status).toBe(CollabApplicationStatus.expired);
    expect(events.at(-1).actor).toBe(CollabActor.system);
  });

  it("leaves a fresh invitation alone", async () => {
    const { job, applications } = use({
      opportunities: [{ visibility: CollabVisibility.direct }],
      applications: [{ status: CollabApplicationStatus.invited, created_at: ago(1) }],
    });
    expect((await job.handle(NOW)).invitesExpired).toBe(0);
    expect(applications[0].status).toBe(CollabApplicationStatus.invited);
  });
});

describe("ExpireCollabsJob — closed application windows", () => {
  it("expires applicants who were never picked", async () => {
    const { job, applications } = use({
      opportunities: [{ applications_close_at: ago(1) }],
      applications: [{ status: CollabApplicationStatus.applied }],
    });
    const r = await job.handle(NOW);
    expect(r.applicationsExpired).toBe(1);
    expect(applications[0].status).toBe(CollabApplicationStatus.expired);
  });

  it("expires the opportunity when nobody was accepted", async () => {
    const { job, opportunities } = use({
      opportunities: [{ applications_close_at: ago(1), slots_filled: 0 }],
    });
    expect((await job.handle(NOW)).opportunitiesExpired).toBe(1);
    expect(opportunities[0].status).toBe(CollabOpportunityStatus.expired);
  });

  it("leaves an opportunity alive while a creator is still working", async () => {
    // A vendor who filled one of three slots has real work in flight; that
    // finishes on its own and the opportunity completes with it.
    const { job, opportunities } = use({
      opportunities: [{ applications_close_at: ago(1), slots_total: 3, slots_filled: 1 }],
    });
    expect((await job.handle(NOW)).opportunitiesExpired).toBe(0);
    expect(opportunities[0].status).toBe(CollabOpportunityStatus.open);
  });

  it("does not touch an opportunity whose window is still open", async () => {
    const { job, opportunities } = use({
      opportunities: [{ applications_close_at: ahead(5) }],
    });
    const r = await job.handle(NOW);
    expect(r.opportunitiesExpired).toBe(0);
    expect(opportunities[0].status).toBe(CollabOpportunityStatus.open);
  });
});

describe("ExpireCollabsJob — missed deadlines", () => {
  const overdue = {
    opportunities: [
      {
        type: CollabOpportunityType.paid_campaign,
        status: CollabOpportunityStatus.filled,
        slots_filled: 1,
        fee_fils: "100000",
      },
    ],
    applications: [
      {
        status: CollabApplicationStatus.accepted,
        deliver_by: ago(1),
        agreed_fee_fils: "100000",
      },
    ],
  };

  it("expires the application and releases the vendor's hold", async () => {
    const { job, applications, escrowCalls } = use(overdue);
    const r = await job.handle(NOW);
    expect(r.deliveriesExpired).toBe(1);
    expect(applications[0].status).toBe(CollabApplicationStatus.expired);
    expect(escrowCalls).toEqual(["release"]);
  });

  it("frees the slot and reopens the opportunity", async () => {
    const { job, opportunities } = use(overdue);
    await job.handle(NOW);
    expect(opportunities[0].slots_filled).toBe(0);
    expect(opportunities[0].status).toBe(CollabOpportunityStatus.open);
  });

  it("releases nothing for a seeding collab, which never held money", async () => {
    const { job, escrowCalls } = use({
      opportunities: [{ status: CollabOpportunityStatus.filled, slots_filled: 1 }],
      applications: [{ status: CollabApplicationStatus.accepted, deliver_by: ago(1) }],
    });
    await job.handle(NOW);
    expect(escrowCalls).toHaveLength(0);
  });

  it("leaves work whose deadline has not arrived", async () => {
    const { job, applications } = use({
      opportunities: [{ status: CollabOpportunityStatus.filled, slots_filled: 1 }],
      applications: [{ status: CollabApplicationStatus.accepted, deliver_by: ahead(2) }],
    });
    expect((await job.handle(NOW)).deliveriesExpired).toBe(0);
    expect(applications[0].status).toBe(CollabApplicationStatus.accepted);
  });

  it("never expires work with no deadline set", async () => {
    const { job, applications } = use({
      opportunities: [{ status: CollabOpportunityStatus.filled, slots_filled: 1 }],
      applications: [{ status: CollabApplicationStatus.accepted, deliver_by: null }],
    });
    expect((await job.handle(NOW)).deliveriesExpired).toBe(0);
    expect(applications[0].status).toBe(CollabApplicationStatus.accepted);
  });
});

describe("ExpireCollabsJob — seeding receipts", () => {
  it("runs the receipt sweep alongside the deadline sweep", async () => {
    const { job, applications } = use({
      opportunities: [{ status: CollabOpportunityStatus.filled, slots_filled: 1 }],
      applications: [
        {
          status: CollabApplicationStatus.in_progress,
          shipped_at: ago(30),
          received_at: null,
        },
      ],
    });
    const r = await job.handle(NOW);
    expect(r.seedingReceiptsExpired).toBe(1);
    expect(applications[0].status).toBe(CollabApplicationStatus.expired);
  });
});

describe("CollabDeadlineRemindersJob", () => {
  function remindersHarness(apps: Partial<CollabApplication>[]) {
    const h = use({
      opportunities: [{ status: CollabOpportunityStatus.filled, slots_filled: 1 }],
      applications: apps,
    });
    const sent: Array<{ userId: string; type: string; data: Record<string, unknown> }> = [];
    const notifier = {
      send: async (p: any) => {
        if (p.userId === "boom") throw new Error("bad address");
        sent.push(p);
      },
    };
    return {
      ...h,
      sent,
      job: new CollabDeadlineRemindersJob("redis://unused", h.svc, notifier),
    };
  }

  it("nudges at 3 days and 1 day out", async () => {
    const { job, sent } = remindersHarness([
      { creator_id: "c1", status: CollabApplicationStatus.accepted, deliver_by: ahead(3) },
      { creator_id: "c2", status: CollabApplicationStatus.accepted, deliver_by: ahead(1) },
    ]);
    const r = await job.handle(NOW);
    expect(r.sent).toBe(2);
    expect(sent.map((s) => s.data.days_remaining).sort()).toEqual([1, 3]);
  });

  it("does not nudge a deadline further out than the reminder windows", async () => {
    const { job, sent } = remindersHarness([
      { creator_id: "c1", status: CollabApplicationStatus.accepted, deliver_by: ahead(10) },
    ]);
    await job.handle(NOW);
    expect(sent).toHaveLength(0);
  });

  it("one broken recipient does not stop the rest", async () => {
    const { job, sent } = remindersHarness([
      { creator_id: "boom", status: CollabApplicationStatus.accepted, deliver_by: ahead(1) },
      { creator_id: "c2", status: CollabApplicationStatus.accepted, deliver_by: ahead(1) },
    ]);
    const r = await job.handle(NOW);
    expect(r.failed).toBe(1);
    expect(r.sent).toBe(1);
    expect(sent).toHaveLength(1);
  });

  it("sends nothing for work that is already delivered", async () => {
    const { job, sent } = remindersHarness([
      { creator_id: "c1", status: CollabApplicationStatus.delivered, deliver_by: ahead(1) },
    ]);
    await job.handle(NOW);
    expect(sent).toHaveLength(0);
  });
});
