// manage-security.test.ts
//
// Security regression tests for review findings 6 (unbounded engagement span),
// 7 (ANY-branch authority on write paths) and 8 (raw ical_url disclosure).
// Mocked repos only — no live DB, so this runs in CI unconditionally.
import { describe, expect, it, mock } from "bun:test";
import { EngagementKind } from "@materialhub/database";
import { BadRequestError } from "@materialhub/plugins";
import { isLocationManagerOfAll } from "../../guards/location-scope.ts";
import { MAX_BLOCK_DAYS, assertSaneEngagementSpan } from "./block-time.service.ts";
import { maskIcalUrl } from "./calendar-subscription.service.ts";

const NOW = new Date("2026-07-20T12:00:00Z");
const DAY_MS = 86_400_000;

// ─────────────────────────────────────────────────────────────────────────────
// Finding 6 — span bounds
// ─────────────────────────────────────────────────────────────────────────────

describe("assertSaneEngagementSpan (review finding 6)", () => {
  const at = (offsetDays: number) => new Date(NOW.getTime() + offsetDays * DAY_MS);

  it("accepts an ordinary same-day block", () => {
    expect(() =>
      assertSaneEngagementSpan(
        new Date("2026-07-21T09:00:00Z"),
        new Date("2026-07-21T17:00:00Z"),
        NOW,
      ),
    ).not.toThrow();
  });

  it("still rejects endsAt <= startsAt", () => {
    expect(() => assertSaneEngagementSpan(at(2), at(1), NOW)).toThrow(BadRequestError);
    expect(() => assertSaneEngagementSpan(at(1), at(1), NOW)).toThrow(BadRequestError);
  });

  // THE finding: `POST /manage/blocks {starts_at:"2020-01-01", ends_at:"2400-01-01"}`
  // wrote ONE confirmed engagement whose slot_range covered the no_double_book
  // GiST predicate for centuries, after which every customer booking 409s.
  it("rejects a centuries-long span that would poison the exclusion constraint", () => {
    const err = (() => {
      try {
        assertSaneEngagementSpan(
          new Date("2020-01-01T00:00:00Z"),
          new Date("2400-01-01T00:00:00Z"),
          NOW,
        );
        return null;
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(BadRequestError);
  });

  it("rejects a span just past the max, accepts one just under", () => {
    expect(() => assertSaneEngagementSpan(at(1), at(1 + MAX_BLOCK_DAYS + 1), NOW)).toThrow(
      BadRequestError,
    );
    expect(() => assertSaneEngagementSpan(at(1), at(1 + MAX_BLOCK_DAYS - 1), NOW)).not.toThrow();
  });

  it("rejects a start far in the past but allows recent backfill", () => {
    expect(() => assertSaneEngagementSpan(at(-3650), at(-3649), NOW)).toThrow(BadRequestError);
    expect(() => assertSaneEngagementSpan(at(-1), at(-0.5), NOW)).not.toThrow();
  });

  it("rejects a start absurdly far in the future", () => {
    expect(() => assertSaneEngagementSpan(at(5000), at(5001), NOW)).toThrow(BadRequestError);
  });

  it("rejects unparseable dates rather than producing NaN bounds", () => {
    expect(() => assertSaneEngagementSpan(new Date("nope"), at(1), NOW)).toThrow(BadRequestError);
    expect(() => assertSaneEngagementSpan(at(1), new Date("nope"), NOW)).toThrow(BadRequestError);
  });

  // The span cap is also what keeps `duration_minutes` (int4) in range on the
  // manual-booking path — an unbounded span previously reached Postgres as an
  // unhandled 22003 numeric-overflow 500 instead of a 400.
  it("keeps duration_minutes inside int4 for any accepted span", () => {
    const maxMinutes = (MAX_BLOCK_DAYS * DAY_MS) / 60_000;
    expect(maxMinutes).toBeLessThan(2_147_483_647);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Finding 7 — write paths must not accept ANY-branch authority
// ─────────────────────────────────────────────────────────────────────────────

function scopeRepos(opts: {
  locations: Array<{ id: string; vendor_id: string }>;
  memberships: Array<{ vendor_location_id: string; user_id: string; role: string }>;
}) {
  return {
    locationRepo: {
      findOne: mock(
        async ({ where }: { where: { id: string } }) =>
          opts.locations.find((l) => l.id === where.id) ?? null,
      ),
    },
    membershipRepo: {
      findOne: mock(
        async ({ where }: { where: { vendor_location_id: string; user_id: string } }) =>
          opts.memberships.find(
            (m) => m.vendor_location_id === where.vendor_location_id && m.user_id === where.user_id,
          ) ?? null,
      ),
      find: mock(async ({ where }: { where: { user_id: string } }) =>
        opts.memberships.filter((m) => m.user_id === where.user_id),
      ),
    },
    // biome-ignore lint/suspicious/noExplicitAny: minimal fake repos
  } as any;
}

const BRANCH_A_ADMIN = { userId: "admin-a", vendorId: "vendor-1", role: "staff" };
const OWNER = { userId: "owner-1", vendorId: "vendor-1", role: "owner" };

const TWO_BRANCH_VENDOR = {
  locations: [
    { id: "loc-a", vendor_id: "vendor-1" },
    { id: "loc-b", vendor_id: "vendor-1" },
  ],
  memberships: [{ vendor_location_id: "loc-a", user_id: "admin-a", role: "admin" }],
};

describe("isLocationManagerOfAll (review finding 7)", () => {
  // THE finding: under the old ANY rule, a staff member linked to A and B made
  // every object hanging off them reachable from EITHER branch — a branch-A
  // admin could delete a block created at B and replace B's iCal subscription.
  it("denies a single-branch admin for a staff member shared with another branch", async () => {
    const repos = scopeRepos(TWO_BRANCH_VENDOR);
    expect(await isLocationManagerOfAll(BRANCH_A_ADMIN, ["loc-a", "loc-b"], repos)).toBe(false);
  });

  it("allows a single-branch admin for a staff member confined to their branch", async () => {
    const repos = scopeRepos(TWO_BRANCH_VENDOR);
    expect(await isLocationManagerOfAll(BRANCH_A_ADMIN, ["loc-a"], repos)).toBe(true);
  });

  it("denies on an empty candidate list for a non-owner/manager", async () => {
    const repos = scopeRepos(TWO_BRANCH_VENDOR);
    expect(await isLocationManagerOfAll(BRANCH_A_ADMIN, [], repos)).toBe(false);
  });

  // Owner/vendor-manager must always retain access, so no vendor is ever
  // locked out of a resource that legitimately spans branches.
  it("always allows owner/vendor-manager, including across branches and on empty", async () => {
    const repos = scopeRepos(TWO_BRANCH_VENDOR);
    expect(await isLocationManagerOfAll(OWNER, ["loc-a", "loc-b"], repos)).toBe(true);
    expect(await isLocationManagerOfAll(OWNER, [], repos)).toBe(true);
  });

  it("denies when one candidate belongs to a different vendor", async () => {
    const repos = scopeRepos({
      locations: [
        { id: "loc-a", vendor_id: "vendor-1" },
        { id: "loc-x", vendor_id: "vendor-2" },
      ],
      memberships: [
        { vendor_location_id: "loc-a", user_id: "admin-a", role: "admin" },
        { vendor_location_id: "loc-x", user_id: "admin-a", role: "admin" },
      ],
    });
    expect(await isLocationManagerOfAll(BRANCH_A_ADMIN, ["loc-a", "loc-x"], repos)).toBe(false);
  });

  it("denies when the membership role is not a managing one", async () => {
    const repos = scopeRepos({
      locations: [{ id: "loc-a", vendor_id: "vendor-1" }],
      memberships: [{ vendor_location_id: "loc-a", user_id: "admin-a", role: "receptionist" }],
    });
    expect(await isLocationManagerOfAll(BRANCH_A_ADMIN, ["loc-a"], repos)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Finding 8 — ical_url is a bearer secret and must never be returned
// ─────────────────────────────────────────────────────────────────────────────

describe("maskIcalUrl (review finding 8)", () => {
  // A Google/Outlook "private address" iCal URL embeds an unauthenticated
  // capability token: whoever holds the string reads that person's whole
  // personal calendar, forever, with no audit trail.
  it("reveals the origin but never the token-bearing path or query", () => {
    const secret =
      "https://calendar.google.com/calendar/ical/abc123SECRETTOKEN%40group.calendar.google.com/private-9f8e7d6c5b4a/basic.ics";
    const masked = maskIcalUrl(secret);

    expect(masked).toBe("https://calendar.google.com/…");
    expect(masked).not.toContain("SECRETTOKEN");
    expect(masked).not.toContain("private-9f8e7d6c5b4a");
    expect(masked).not.toContain("basic.ics");
  });

  it("does not leak a query-string token", () => {
    const masked = maskIcalUrl("https://outlook.office365.com/owa/calendar/feed.ics?token=SECRET");
    expect(masked).not.toContain("SECRET");
    expect(masked).not.toContain("token");
  });

  it("degrades to a bare mask on an unparseable stored value", () => {
    expect(maskIcalUrl("not a url at all")).toBe("…");
    expect(maskIcalUrl("")).toBe("…");
  });
});

describe("CalendarSubscriptionService.get — redaction (review finding 8)", () => {
  async function setup(subscription: Record<string, unknown> | null) {
    const { CalendarSubscriptionService } = await import("./calendar-subscription.service.ts");
    const staffRepo = { findOne: mock(async () => ({ id: "staff-1", vendor_id: "vendor-1" })) };
    const staffLocationRepo = { find: mock(async () => []) };
    const subscriptionRepo = { findOne: mock(async () => subscription) };
    const engagementRepo = { find: mock(async () => []) };
    const service = new CalendarSubscriptionService(
      // biome-ignore lint/suspicious/noExplicitAny: minimal fake repos
      staffRepo as any,
      staffLocationRepo as any,
      subscriptionRepo as any,
      engagementRepo as any,
      { locationRepo: {}, membershipRepo: {} } as any,
    );
    return service;
  }

  const SECRET_URL = "https://calendar.google.com/calendar/ical/TOKEN123/private-abc/basic.ics";

  it("never returns the raw ical_url", async () => {
    const service = await setup({
      id: "sub-1",
      staff_member_id: "staff-1",
      vendor_id: "vendor-1",
      is_active: true,
      ical_url: SECRET_URL,
      last_synced_at: null,
      last_sync_error: null,
    });

    const result = await service.get(OWNER, "staff-1");

    expect(JSON.stringify(result)).not.toContain("TOKEN123");
    expect(JSON.stringify(result)).not.toContain("private-abc");
    expect(Object.keys(result ?? {})).not.toContain("ical_url");
    expect(result?.ical_url_masked).toBe("https://calendar.google.com/…");
    expect(result?.is_configured).toBe(true);
  });

  it("still surfaces the operational fields the dashboard needs", async () => {
    const syncedAt = new Date("2026-07-20T11:00:00Z");
    const service = await setup({
      id: "sub-1",
      staff_member_id: "staff-1",
      vendor_id: "vendor-1",
      is_active: true,
      ical_url: SECRET_URL,
      last_synced_at: syncedAt,
      last_sync_error: "feed too large",
    });

    const result = await service.get(OWNER, "staff-1");

    expect(result?.last_synced_at).toEqual(syncedAt);
    expect(result?.last_sync_error).toBe("feed too large");
    expect(result?.is_active).toBe(true);
  });

  it("returns null when no subscription exists", async () => {
    const service = await setup(null);
    expect(await service.get(OWNER, "staff-1")).toBeNull();
  });
});

// Referenced so the import is meaningful if the kinds list ever changes shape.
describe("block kinds", () => {
  it("manual_block and break are distinct engagement kinds", () => {
    expect(EngagementKind.manual_block).not.toBe(EngagementKind.break);
  });
});
