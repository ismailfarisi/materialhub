// ical-import.poll.test.ts
//
// Mocked unit tests for IcalImportService.poll — review fix cycle 1: verifies
// the fetch guard is actually wired in (a disallowed URL never reaches
// sync()/the engagement ledger), that ONLY a short classified reason ever
// lands in last_sync_error (never raw fetch/DNS error text — that column is
// echoed verbatim by GET to the vendor), and that one bad subscription's
// failure never blocks the next subscription in the same tick.
import { describe, expect, it, mock } from "bun:test";
import { IcalImportService } from "./ical-import.service.ts";

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub-1",
    staff_member_id: "staff-1",
    vendor_id: "vendor-1",
    ical_url: "https://1.1.1.1/x.ics",
    ...overrides,
  } as any;
}

function setup(subs: Array<Record<string, unknown>>) {
  const updateCalls: Array<[unknown, unknown]> = [];
  const subscriptionRepo = {
    find: mock(async () => subs),
    update: mock(async (where: unknown, patch: unknown) => {
      updateCalls.push([where, patch]);
    }),
  };
  const engagementRepo = {
    find: mock(async () => []),
  };
  const engagementService = {
    reserve: mock(async () => ({ id: "x" })),
    move: mock(async () => ({})),
    release: mock(async () => {}),
    confirm: mock(async () => {}),
  };
  const staffRepo = { findOne: mock(async () => null) };
  const notificationQueue = { add: mock(async () => {}) };

  const service = new IcalImportService(
    subscriptionRepo as any,
    engagementRepo as any,
    engagementService as any,
    staffRepo as any,
    notificationQueue as any,
  );
  return { service, subscriptionRepo, engagementRepo, updateCalls };
}

describe("IcalImportService.poll — guarded fetch + classified last_sync_error", () => {
  it("blocks an SSRF-disallowed URL before any fetch, records a classified reason, never touches the ledger", async () => {
    const sub = subscription({ ical_url: "http://169.254.169.254/latest/meta-data/" });
    const { service, engagementRepo, updateCalls } = setup([sub]);
    const fetchImpl = mock(async () => {
      throw new Error("should never be called");
    });

    await service.poll(new Date(), fetchImpl as any);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(engagementRepo.find).not.toHaveBeenCalled();
    expect(updateCalls.length).toBe(1);
    const [where, patch] = updateCalls[0] as [any, any];
    expect(where).toEqual({ id: "sub-1" });
    expect(patch.last_sync_error).toBe("invalid or disallowed URL");
    // Never the raw resolved address / probe detail.
    expect(patch.last_sync_error).not.toContain("169.254");
  });

  it("classifies a non-200 fetch as a short HTTP-status message, no raw error text", async () => {
    const sub = subscription();
    const { service, updateCalls } = setup([sub]);
    const fetchImpl = mock(
      async () =>
        ({
          status: 503,
          ok: false,
          headers: { get: () => null },
        }) as unknown as Response,
    );

    await service.poll(new Date(), fetchImpl as any);

    expect(updateCalls.length).toBe(1);
    const [, patch] = updateCalls[0] as [any, any];
    expect(patch.last_sync_error).toBe("fetch failed: HTTP 503");
  });

  it("classifies an unexpected network error as a generic reason, not the raw message", async () => {
    const sub = subscription();
    const { service, updateCalls } = setup([sub]);
    const fetchImpl = mock(async () => {
      throw new Error("connect ECONNREFUSED 10.0.4.12:443 (internal detail)");
    });

    await service.poll(new Date(), fetchImpl as any);

    expect(updateCalls.length).toBe(1);
    const [, patch] = updateCalls[0] as [any, any];
    expect(patch.last_sync_error).toBe("fetch failed");
    expect(patch.last_sync_error).not.toContain("10.0.4.12");
    expect(patch.last_sync_error).not.toContain("ECONNREFUSED");
  });

  it("one disallowed-URL subscription never blocks the next subscription in the same tick", async () => {
    const bad = subscription({ id: "sub-bad", ical_url: "http://127.0.0.1/x.ics" });
    const good = subscription({
      id: "sub-good",
      ical_url: "https://1.1.1.1/good.ics",
    });
    const { service, updateCalls } = setup([bad, good]);
    const bytes = new TextEncoder().encode("BEGIN:VCALENDAR\nEND:VCALENDAR");
    let sent = false;
    const fetchImpl = mock(async (url: string) => {
      if (url === bad.ical_url) throw new Error("must not be called for the bad subscription");
      return {
        status: 200,
        ok: true,
        headers: { get: () => null },
        body: {
          getReader: () => ({
            read: mock(async () => {
              if (sent) return { done: true, value: undefined };
              sent = true;
              return { done: false, value: bytes };
            }),
            cancel: mock(async () => {}),
          }),
        },
      } as unknown as Response;
    });

    await service.poll(new Date(), fetchImpl as any);

    expect(updateCalls.length).toBe(2);
    const badUpdate = updateCalls.find(([w]) => (w as any).id === "sub-bad") as [any, any];
    const goodUpdate = updateCalls.find(([w]) => (w as any).id === "sub-good") as [any, any];
    expect(badUpdate[1].last_sync_error).toBe("invalid or disallowed URL");
    expect(goodUpdate[1].last_sync_error).toBeNull();
    expect(goodUpdate[1].last_synced_at).toBeInstanceOf(Date);
  });
});
