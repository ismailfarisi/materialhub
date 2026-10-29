// strike.service.test.ts
//
// Mocked-repo unit tests for the DERIVED no-show strike counts + the
// pay_at_venue gate thresholds. Real COUNT-over-Postgres behaviour (per-vendor
// isolation, platform-wide roll-up) is covered by the live-DB integration suite.
import { describe, expect, it, mock } from "bun:test";
import { BookingStatus } from "@materialhub/database";
import { StrikeService } from "./strike.service.ts";

const VENDOR_THRESHOLD = 3;
const PLATFORM_THRESHOLD = 8;

// A repo whose count() reflects a caller-controlled map keyed by the WHERE
// clause: a per-vendor query (has vendor_id) hits `vendor`, the platform query
// (no vendor_id) hits `platform`.
function makeRepo(counts: { vendor: number; platform: number }) {
  return {
    count: mock(async (opts: any) => {
      const where = opts?.where ?? {};
      expect(where.status).toBe(BookingStatus.no_show);
      return where.vendor_id ? counts.vendor : counts.platform;
    }),
  };
}

describe("StrikeService.customerNoShowCount", () => {
  it("scopes by vendor_id when supplied; omits it for the platform count", async () => {
    const repo = makeRepo({ vendor: 2, platform: 5 });
    const svc = new StrikeService(repo as any, VENDOR_THRESHOLD, PLATFORM_THRESHOLD);

    expect(await svc.customerNoShowCount("user-1", "vendor-1")).toBe(2);
    expect(await svc.customerNoShowCount("user-1")).toBe(5);

    const perVendorWhere = (repo.count.mock.calls[0] as any[])[0].where;
    expect(perVendorWhere.customer_user_id).toBe("user-1");
    expect(perVendorWhere.vendor_id).toBe("vendor-1");
    const platformWhere = (repo.count.mock.calls[1] as any[])[0].where;
    expect(platformWhere.vendor_id).toBeUndefined();
  });
});

describe("StrikeService.checkPayAtVenue — thresholds", () => {
  it("allows when both counts are below threshold", async () => {
    const repo = makeRepo({ vendor: 2, platform: 5 });
    const svc = new StrikeService(repo as any, VENDOR_THRESHOLD, PLATFORM_THRESHOLD);
    const gate = await svc.checkPayAtVenue("user-1", "vendor-1");
    expect(gate.blocked).toBe(false);
    expect(gate.reason).toBeUndefined();
  });

  it("blocks at the per-vendor threshold (>=), reason names the vendor limit", async () => {
    const repo = makeRepo({ vendor: 3, platform: 5 });
    const svc = new StrikeService(repo as any, VENDOR_THRESHOLD, PLATFORM_THRESHOLD);
    const gate = await svc.checkPayAtVenue("user-1", "vendor-1");
    expect(gate.blocked).toBe(true);
    expect(gate.reason).toContain("vendor no-show limit");
  });

  it("blocks EVERYWHERE at the platform threshold even if the per-vendor count is low", async () => {
    const repo = makeRepo({ vendor: 0, platform: 8 });
    const svc = new StrikeService(repo as any, VENDOR_THRESHOLD, PLATFORM_THRESHOLD);
    const gate = await svc.checkPayAtVenue("user-1", "vendor-1");
    expect(gate.blocked).toBe(true);
    expect(gate.reason).toContain("platform no-show limit");
  });

  it("platform limit takes precedence in the reason when both are breached", async () => {
    const repo = makeRepo({ vendor: 5, platform: 9 });
    const svc = new StrikeService(repo as any, VENDOR_THRESHOLD, PLATFORM_THRESHOLD);
    const gate = await svc.checkPayAtVenue("user-1", "vendor-1");
    expect(gate.blocked).toBe(true);
    expect(gate.reason).toContain("platform no-show limit");
    expect(gate.vendorCount).toBe(5);
    expect(gate.platformCount).toBe(9);
  });
});
