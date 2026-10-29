import { describe, expect, it, mock } from "bun:test";
import { VendorService } from "./vendor.service.ts";

/**
 * Unit tests for the reels-program opt-in/out/status methods on VendorService.
 *
 * The service looks up its repository via `this.vendorRepo`, which is a private
 * getter that delegates to `AppDataSource.getRepository(Vendor)`. We override
 * that getter per-instance with `Object.defineProperty` to inject a fake repo.
 */

function makeService(fakeRepo: { findOne: any; save: any }): VendorService {
  const service = new VendorService(null as any);
  Object.defineProperty(service, "vendorRepo", {
    get: () => fakeRepo,
    configurable: true,
  });
  return service;
}

describe("VendorService.optIntoReelsProgram", () => {
  it("sets joined_at and subsidy_ends_at (~180 days out) on a not-yet-enrolled vendor", async () => {
    const vendor: any = {
      id: "v-1",
      reels_program_joined_at: null,
      reels_commission_rate: "0.0500",
      reels_subsidy_ends_at: null,
    };
    const findOne = mock(async () => vendor);
    const save = mock(async (v: any) => v);
    const service = makeService({ findOne, save });

    const before = Date.now();
    const result = await service.optIntoReelsProgram("v-1");
    const after = Date.now();

    expect(findOne).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.reels_program_joined_at).toBeInstanceOf(Date);
    expect(result.reels_subsidy_ends_at).toBeInstanceOf(Date);

    const joinedAtMs = (result.reels_program_joined_at as Date).getTime();
    expect(joinedAtMs).toBeGreaterThanOrEqual(before);
    expect(joinedAtMs).toBeLessThanOrEqual(after);

    // Subsidy window is 6 * 30 days (180 days). Allow a small tolerance for
    // timing jitter between constructing the two dates.
    const subsidyMs = (result.reels_subsidy_ends_at as Date).getTime();
    const expectedDelta = 180 * 24 * 60 * 60 * 1000;
    const actualDelta = subsidyMs - joinedAtMs;
    expect(Math.abs(actualDelta - expectedDelta)).toBeLessThan(5_000);
  });

  it("is idempotent — second call returns the same joined_at", async () => {
    const originalJoinedAt = new Date("2026-01-01T00:00:00Z");
    const originalSubsidyEnd = new Date("2026-07-01T00:00:00Z");
    const vendor: any = {
      id: "v-1",
      reels_program_joined_at: originalJoinedAt,
      reels_commission_rate: "0.0500",
      reels_subsidy_ends_at: originalSubsidyEnd,
    };
    const findOne = mock(async () => vendor);
    const save = mock(async (v: any) => v);
    const service = makeService({ findOne, save });

    const result = await service.optIntoReelsProgram("v-1");

    expect(result.reels_program_joined_at).toBe(originalJoinedAt);
    expect(result.reels_subsidy_ends_at).toBe(originalSubsidyEnd);
    // Idempotent path returns early without saving.
    expect(save).not.toHaveBeenCalled();
  });

  it("throws vendor_not_found when the vendor doesn't exist", async () => {
    const findOne = mock(async () => null);
    const save = mock(async (v: any) => v);
    const service = makeService({ findOne, save });

    await expect(service.optIntoReelsProgram("missing")).rejects.toThrow("vendor_not_found");
    expect(save).not.toHaveBeenCalled();
  });
});

describe("VendorService.optOutOfReelsProgram", () => {
  it("clears both reels_program_joined_at and reels_subsidy_ends_at", async () => {
    const vendor: any = {
      id: "v-1",
      reels_program_joined_at: new Date("2026-01-01T00:00:00Z"),
      reels_commission_rate: "0.0500",
      reels_subsidy_ends_at: new Date("2026-07-01T00:00:00Z"),
    };
    const findOne = mock(async () => vendor);
    const save = mock(async (v: any) => v);
    const service = makeService({ findOne, save });

    const result = await service.optOutOfReelsProgram("v-1");

    expect(result.reels_program_joined_at).toBeNull();
    expect(result.reels_subsidy_ends_at).toBeNull();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("throws vendor_not_found when the vendor doesn't exist", async () => {
    const findOne = mock(async () => null);
    const save = mock(async (v: any) => v);
    const service = makeService({ findOne, save });

    await expect(service.optOutOfReelsProgram("missing")).rejects.toThrow("vendor_not_found");
    expect(save).not.toHaveBeenCalled();
  });
});

describe("VendorService.getReelsProgramStatus", () => {
  it("returns isActive: true for an enrolled vendor", async () => {
    const joinedAt = new Date("2026-01-01T00:00:00Z");
    const subsidyEnd = new Date("2026-07-01T00:00:00Z");
    const vendor: any = {
      id: "v-1",
      reels_program_joined_at: joinedAt,
      reels_commission_rate: "0.0500",
      reels_subsidy_ends_at: subsidyEnd,
    };
    const findOne = mock(async () => vendor);
    const save = mock(async (v: any) => v);
    const service = makeService({ findOne, save });

    const status = await service.getReelsProgramStatus("v-1");

    expect(status).toEqual({
      joinedAt,
      commissionRate: "0.0500",
      subsidyEndsAt: subsidyEnd,
      isActive: true,
    });
  });

  it("returns isActive: false for a not-enrolled vendor", async () => {
    const vendor: any = {
      id: "v-2",
      reels_program_joined_at: null,
      reels_commission_rate: "0.0500",
      reels_subsidy_ends_at: null,
    };
    const findOne = mock(async () => vendor);
    const save = mock(async (v: any) => v);
    const service = makeService({ findOne, save });

    const status = await service.getReelsProgramStatus("v-2");

    expect(status.isActive).toBe(false);
    expect(status.joinedAt).toBeNull();
    expect(status.subsidyEndsAt).toBeNull();
    expect(status.commissionRate).toBe("0.0500");
  });

  it("throws vendor_not_found when the vendor doesn't exist", async () => {
    const findOne = mock(async () => null);
    const save = mock(async (v: any) => v);
    const service = makeService({ findOne, save });

    await expect(service.getReelsProgramStatus("missing")).rejects.toThrow("vendor_not_found");
  });
});
