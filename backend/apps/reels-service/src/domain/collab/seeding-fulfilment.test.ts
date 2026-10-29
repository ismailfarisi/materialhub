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
  SiteSetting,
  User,
  UserAddress,
} from "@materialhub/database";
import { CollabService, SEEDING_RECEIPT_TIMEOUT_DAYS } from "./collab.service.ts";
import { toVendorFacingApplication, toVendorFacingApplications } from "./serializers.ts";

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

const DAY = 24 * 60 * 60 * 1000;

function makeHarness(
  seed: {
    opportunity?: Partial<CollabOpportunity>;
    application?: Partial<CollabApplication>;
    addressOwner?: string | null;
  } = {},
) {
  const opportunities: any[] = [
    {
      id: "opp-1",
      vendor_id: "v1",
      type: CollabOpportunityType.product_seeding,
      visibility: CollabVisibility.board,
      status: CollabOpportunityStatus.filled,
      title: "t",
      description: "d",
      slots_total: 1,
      slots_filled: 1,
      created_at: new Date("2026-08-01T00:00:00Z"),
      deliver_by: new Date("2026-08-15T00:00:00Z"), // 14-day window
      seeded_product_id: "p1",
      seeded_qty: 1,
      ...seed.opportunity,
    },
  ];
  const applications: any[] = [
    {
      id: "app-1",
      opportunity_id: "opp-1",
      creator_id: "c1",
      status: CollabApplicationStatus.accepted,
      shipping_address_id: null,
      carrier: null,
      tracking_number: null,
      shipped_at: null,
      received_at: null,
      deliver_by: null,
      revision_count: 0,
      ...seed.application,
    },
  ];
  const events: any[] = [];
  let idSeq = 0;
  const matches = (row: any, where: any) =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === "object" && "_type" in (v as any)) return true; // IsNull/LessThan
      return row[k] === v;
    });

  const repoFor = (entity: unknown) => {
    if (entity === CollabOpportunity) {
      return {
        findOne: async ({ where }: any) => opportunities.find((o) => o.id === where.id) ?? null,
        save: async (x: any) => {
          opportunities[opportunities.findIndex((o) => o.id === x.id)] = x;
          return x;
        },
        find: async () => opportunities,
      };
    }
    if (entity === CollabApplication) {
      return {
        findOne: async ({ where }: any) => applications.find((a) => matches(a, where)) ?? null,
        save: async (x: any) => {
          applications[applications.findIndex((a) => a.id === x.id)] = x;
          return x;
        },
        // The sweep filters IsNull/LessThanOrEqual in SQL; approximate it here.
        find: async () =>
          applications.filter(
            (a) => a.status === CollabApplicationStatus.in_progress && !a.received_at,
          ),
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
    if (entity === UserAddress) {
      return {
        findOne: async () =>
          seed.addressOwner === null ? null : { id: "addr-1", user_id: seed.addressOwner ?? "c1" },
      };
    }
    if (entity === User) return { findOne: async () => ({ id: "c1", follower_count: 10_000 }) };
    if (entity === CreatorApplication) {
      return { findOne: async () => ({ primary_category: "Beauty" }) };
    }
    // approveDelivery reads the shared platform fee rate; null falls back to the default.

    if (entity === SiteSetting) return { findOne: async () => null };

    throw new Error(`unexpected repository: ${String(entity)}`);
  };

  const manager = { getRepository: repoFor } as any;
  const oT = AppDataSource.transaction;
  const oG = AppDataSource.getRepository;
  (AppDataSource as any).transaction = async (cb: any) => cb(manager);
  (AppDataSource as any).getRepository = repoFor;

  return {
    svc: new CollabService(fakeEscrow as any),
    opportunities,
    applications,
    events,
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

describe("vendor-facing serializer — address privacy", () => {
  const full = {
    id: "a",
    opportunity_id: "o",
    creator_id: "c",
    status: "accepted",
    pitch: null,
    proposed_fee_fils: null,
    agreed_fee_fils: null,
    delivered_reel_id: null,
    shipping_address_id: "addr-secret",
    carrier: "Aramex",
    tracking_number: "TRK1",
    shipped_at: null,
    received_at: null,
    deliver_by: null,
    revision_count: 0,
    responded_at: null,
    accepted_at: null,
    delivered_at: null,
    completed_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  } as any;

  it("never emits shipping_address_id", () => {
    const out = toVendorFacingApplication(full);
    expect(Object.keys(out)).not.toContain("shipping_address_id");
    expect(JSON.stringify(out)).not.toContain("addr-secret");
  });

  it("reports only whether an address exists", () => {
    expect(toVendorFacingApplication(full).has_address).toBe(true);
    expect(toVendorFacingApplication({ ...full, shipping_address_id: null }).has_address).toBe(
      false,
    );
  });

  it("holds for the list shape too, not just the detail shape", () => {
    // The detail route is where this normally leaks, but both go through here.
    const out = toVendorFacingApplications([full, full]);
    expect(JSON.stringify(out)).not.toContain("addr-secret");
    expect(out).toHaveLength(2);
  });

  it("still exposes tracking, which the vendor legitimately needs", () => {
    const out = toVendorFacingApplication(full);
    expect(out.carrier).toBe("Aramex");
    expect(out.tracking_number).toBe("TRK1");
  });
});

describe("CollabService.setShippingAddress", () => {
  it("stores the creator's chosen address", async () => {
    const { svc, applications } = use();
    await svc.setShippingAddress("c1", "app-1", "addr-1");
    expect(applications[0].shipping_address_id).toBe("addr-1");
  });

  it("refuses an address belonging to someone else", async () => {
    const { svc } = use({ addressOwner: "someone-else" });
    await expect(svc.setShippingAddress("c1", "app-1", "addr-1")).rejects.toThrow(
      "not_your_address",
    );
  });

  it("refuses an unknown address", async () => {
    const { svc } = use({ addressOwner: null });
    await expect(svc.setShippingAddress("c1", "app-1", "addr-1")).rejects.toThrow(
      "address_not_found",
    );
  });

  it("refuses on a non-seeding collab", async () => {
    const { svc } = use({ opportunity: { type: CollabOpportunityType.paid_campaign } });
    await expect(svc.setShippingAddress("c1", "app-1", "addr-1")).rejects.toThrow(
      "not_a_seeding_collab",
    );
  });
});

describe("CollabService.markShipped", () => {
  it("refuses until the creator has nominated an address", async () => {
    const { svc } = use();
    await expect(svc.markShipped("v1", "app-1")).rejects.toThrow("awaiting_creator_address");
  });

  it("moves to in_progress and records carrier + tracking", async () => {
    const { svc, applications, events } = use({ application: { shipping_address_id: "addr-1" } });
    await svc.markShipped("v1", "app-1", { carrier: "Aramex", trackingNumber: "TRK9" });
    expect(applications[0].status).toBe(CollabApplicationStatus.in_progress);
    expect(applications[0].shipped_at).toBeInstanceOf(Date);
    expect(events.at(-1).event_type).toBe(CollabEventType.shipped);
    expect(events.at(-1).metadata.tracking_number).toBe("TRK9");
  });

  it("refuses another vendor's application", async () => {
    const { svc } = use({ application: { shipping_address_id: "addr-1" } });
    await expect(svc.markShipped("v-other", "app-1")).rejects.toThrow("not_your_opportunity");
  });
});

describe("CollabService.confirmReceipt", () => {
  const shipped = {
    application: {
      status: CollabApplicationStatus.in_progress,
      shipping_address_id: "addr-1",
      shipped_at: new Date("2026-08-10T00:00:00Z"),
    },
  };

  it("starts the delivery clock at receipt, not at acceptance", async () => {
    // The opportunity gave a 14-day window (created 08-01, deliver_by 08-15).
    // A creator receiving on 08-20 still gets 14 days, not a deadline in the past.
    const { svc, applications } = use(shipped);
    const receivedAt = new Date("2026-08-20T00:00:00Z");
    const originalNow = Date.now;
    Date.now = () => receivedAt.getTime();
    try {
      await svc.confirmReceipt("app-1", { kind: CollabActor.creator, creatorId: "c1" });
    } finally {
      Date.now = originalNow;
    }
    const deadline = applications[0].deliver_by as Date;
    expect(deadline.getTime()).toBeGreaterThan(new Date("2026-08-15T00:00:00Z").getTime());
    expect(applications[0].received_at).toBeInstanceOf(Date);
  });

  it("never shortens the deadline below the vendor's original date", async () => {
    const { svc, applications } = use(shipped);
    await svc.confirmReceipt("app-1", { kind: CollabActor.creator, creatorId: "c1" });
    const deadline = applications[0].deliver_by as Date;
    expect(deadline.getTime()).toBeGreaterThanOrEqual(new Date("2026-08-15T00:00:00Z").getTime());
  });

  it("is idempotent — a creator tap and a carrier webhook can race", async () => {
    const { svc, applications } = use(shipped);
    const first = await svc.confirmReceipt("app-1", {
      kind: CollabActor.creator,
      creatorId: "c1",
    });
    const second = await svc.confirmReceipt("app-1", { kind: CollabActor.system });
    expect(second.received_at).toEqual(first.received_at);
    expect(applications[0].received_at).toEqual(first.received_at);
  });

  it("accepts a system actor (carrier delivery event) with no creator id", async () => {
    const { svc, events } = use(shipped);
    await svc.confirmReceipt("app-1", { kind: CollabActor.system });
    expect(events.at(-1).actor).toBe(CollabActor.system);
    expect(events.at(-1).actor_user_id).toBeNull();
  });

  it("refuses a different creator", async () => {
    const { svc } = use(shipped);
    await expect(
      svc.confirmReceipt("app-1", { kind: CollabActor.creator, creatorId: "c-other" }),
    ).rejects.toThrow("not_your_application");
  });

  it("refuses before the vendor has shipped", async () => {
    const { svc } = use();
    await expect(
      svc.confirmReceipt("app-1", { kind: CollabActor.creator, creatorId: "c1" }),
    ).rejects.toThrow("application_not_in_transit");
  });

  it("leaves deliver_by null when the opportunity set no deadline", async () => {
    const { svc, applications } = use({
      opportunity: { deliver_by: null },
      ...shipped,
    });
    await svc.confirmReceipt("app-1", { kind: CollabActor.creator, creatorId: "c1" });
    expect(applications[0].deliver_by).toBeNull();
  });
});

describe("CollabService.expireStaleSeedingReceipts", () => {
  const shippedAt = (daysAgo: number, now: Date) => new Date(now.getTime() - daysAgo * DAY);
  const now = new Date("2026-09-01T00:00:00Z");

  it("expires an application shipped longer ago than the timeout", async () => {
    const { svc, applications, events } = use({
      application: {
        status: CollabApplicationStatus.in_progress,
        shipped_at: shippedAt(SEEDING_RECEIPT_TIMEOUT_DAYS + 1, now),
      },
    });
    expect(await svc.expireStaleSeedingReceipts(now)).toBe(1);
    expect(applications[0].status).toBe(CollabApplicationStatus.expired);
    expect(events.at(-1).event_type).toBe(CollabEventType.expired);
    expect(events.at(-1).actor).toBe(CollabActor.system);
  });

  it("frees the slot and reopens the opportunity", async () => {
    const { svc, opportunities } = use({
      application: {
        status: CollabApplicationStatus.in_progress,
        shipped_at: shippedAt(SEEDING_RECEIPT_TIMEOUT_DAYS + 1, now),
      },
    });
    await svc.expireStaleSeedingReceipts(now);
    expect(opportunities[0].slots_filled).toBe(0);
    expect(opportunities[0].status).toBe(CollabOpportunityStatus.open);
  });

  it("leaves an application confirmed received alone", async () => {
    const { svc, applications } = use({
      application: {
        status: CollabApplicationStatus.in_progress,
        shipped_at: shippedAt(SEEDING_RECEIPT_TIMEOUT_DAYS + 5, now),
        received_at: new Date("2026-08-15T00:00:00Z"),
      },
    });
    expect(await svc.expireStaleSeedingReceipts(now)).toBe(0);
    expect(applications[0].status).toBe(CollabApplicationStatus.in_progress);
  });

  it("captures nothing — seeding never held money", async () => {
    // Asserted by construction: the sweep touches no escrow or wallet repo, so
    // the harness would throw "unexpected repository" if it tried.
    const { svc } = use({
      application: {
        status: CollabApplicationStatus.in_progress,
        shipped_at: shippedAt(SEEDING_RECEIPT_TIMEOUT_DAYS + 1, now),
      },
    });
    await expect(svc.expireStaleSeedingReceipts(now)).resolves.toBe(1);
  });
});
