// calendar-subscription.service.test.ts
//
// Mocked unit tests for CalendarSubscriptionService.upsert's PUT-time SSRF
// gate (review fix cycle 1, finding I-1) — a best-effort immediate 400 on an
// obviously private/reserved/metadata `ical_url`, on top of the pre-existing
// scheme check. Uses IP literals (not hostnames) so `assertSafeIcalUrl` never
// performs a real DNS lookup in this mocked/offline test.
import { describe, expect, it, mock } from "bun:test";
import { BadRequestError } from "@materialhub/plugins";
import { CalendarSubscriptionService } from "./calendar-subscription.service.ts";

const OWNER_ACTOR = { userId: "user-1", vendorId: "vendor-1", role: "owner" };

function setup() {
  const staffRepo = {
    findOne: mock(async () => ({ id: "staff-1", vendor_id: "vendor-1" })),
  };
  const staffLocationRepo = { find: mock(async () => []) };
  const subscriptionRepo = {
    findOne: mock(async () => null),
    save: mock(async (row: unknown) => ({ id: "sub-new", ...(row as object) })),
    create: mock((row: unknown) => row),
  };
  const engagementRepo = { find: mock(async () => []) };
  const locationScope = {
    locationRepo: {} as never,
    membershipRepo: {} as never,
  };

  const service = new CalendarSubscriptionService(
    staffRepo as any,
    staffLocationRepo as any,
    subscriptionRepo as any,
    engagementRepo as any,
    locationScope as any,
  );
  return { service, subscriptionRepo };
}

describe("CalendarSubscriptionService.upsert — PUT-time SSRF gate", () => {
  it("rejects a loopback ical_url with a 400, never touches the subscription repo", async () => {
    const { service, subscriptionRepo } = setup();

    await expect(
      service.upsert(OWNER_ACTOR, "staff-1", "http://127.0.0.1/feed.ics"),
    ).rejects.toBeInstanceOf(BadRequestError);
    expect(subscriptionRepo.findOne).not.toHaveBeenCalled();
    expect(subscriptionRepo.save).not.toHaveBeenCalled();
  });

  it("rejects an AWS/GCP metadata ical_url with a 400", async () => {
    const { service } = setup();

    await expect(
      service.upsert(OWNER_ACTOR, "staff-1", "http://169.254.169.254/latest/meta-data/"),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("rejects the literal hostname localhost", async () => {
    const { service } = setup();

    await expect(
      service.upsert(OWNER_ACTOR, "staff-1", "http://localhost/feed.ics"),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("accepts a public IP literal and proceeds to save", async () => {
    const { service, subscriptionRepo } = setup();

    const result = await service.upsert(OWNER_ACTOR, "staff-1", "https://1.1.1.1/feed.ics");

    expect(result).toBeTruthy();
    expect(subscriptionRepo.save).toHaveBeenCalledTimes(1);
  });
});
