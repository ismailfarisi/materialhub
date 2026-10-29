import { describe, expect, test } from "bun:test";
import { BrandStatus } from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";
import { BrandService } from "./brand.service.ts";

/**
 * Vendor brand submission and admin moderation.
 *
 * `BrandService` reaches the database through a `repo` getter, so each test
 * swaps that getter for a stub — the same shape the spotlight tests use for
 * `runQuery`. Nothing here touches Postgres.
 */

const VENDOR = "00000000-0000-0000-0000-0000000000a1";
const OTHER_VENDOR = "00000000-0000-0000-0000-0000000000b1";
const ADMIN = "00000000-0000-0000-0000-0000000000c1";
const BRAND = "00000000-0000-0000-0000-0000000000d1";

/** Minimal stand-in for the TypeORM repository methods the service calls. */
function withRepo(service: BrandService, repo: Record<string, unknown>) {
  Object.defineProperty(service, "repo", { get: () => repo, configurable: true });
  return service;
}

describe("BrandService.submitForVendor", () => {
  test("creates a pending brand stamped with the submitting vendor", async () => {
    const saved: Record<string, unknown>[] = [];
    const service = withRepo(new BrandService(), {
      findOne: async () => null,
      create: (data: Record<string, unknown>) => data,
      save: async (data: Record<string, unknown>) => {
        saved.push(data);
        return { id: BRAND, ...data };
      },
    });

    const result = await service.submitForVendor(VENDOR, { name: "The Ordinary" });

    expect(result.id).toBe(BRAND);
    expect(saved[0]?.status).toBe(BrandStatus.pending);
    expect(saved[0]?.submitted_by_vendor_id).toBe(VENDOR);
    expect(saved[0]?.slug).toBe("the-ordinary");
    // Submission time is what the review queue sorts on.
    expect(saved[0]?.submitted_at).toBeInstanceOf(Date);
  });

  test("returns the existing brand instead of creating a duplicate", async () => {
    let created = false;
    const existing = { id: BRAND, name: "The Ordinary", status: BrandStatus.approved };
    const service = withRepo(new BrandService(), {
      findOne: async () => existing,
      create: () => {
        created = true;
        return {};
      },
      save: async (d: unknown) => d,
    });

    const result = await service.submitForVendor(VENDOR, { name: "The Ordinary" });

    expect(result).toBe(existing as never);
    expect(created).toBe(false);
  });

  test("refuses to resurrect a brand an admin already rejected", async () => {
    const service = withRepo(new BrandService(), {
      findOne: async () => ({ id: BRAND, status: BrandStatus.rejected }),
      create: () => ({}),
      save: async (d: unknown) => d,
    });

    await expect(service.submitForVendor(VENDOR, { name: "Fake Co" })).rejects.toThrow(HttpError);
  });
});

describe("BrandService.approveSubmission / rejectSubmission", () => {
  function pendingRepo(saved: Record<string, unknown>[]) {
    return {
      findOne: async () => ({
        id: BRAND,
        status: BrandStatus.pending,
        submitted_by_vendor_id: OTHER_VENDOR,
        rejection_reason: null,
      }),
      save: async (d: Record<string, unknown>) => {
        saved.push(d);
        return d;
      },
    };
  }

  test("approving stamps the reviewer and clears any prior reason", async () => {
    const saved: Record<string, unknown>[] = [];
    const service = withRepo(new BrandService(), pendingRepo(saved));

    await service.approveSubmission(BRAND, ADMIN);

    expect(saved[0]?.status).toBe(BrandStatus.approved);
    expect(saved[0]?.reviewed_by_user_id).toBe(ADMIN);
    expect(saved[0]?.rejection_reason).toBeNull();
  });

  test("rejecting records the reason the vendor will read", async () => {
    const saved: Record<string, unknown>[] = [];
    const service = withRepo(new BrandService(), pendingRepo(saved));

    await service.rejectSubmission(BRAND, ADMIN, "  Duplicate of Cerave  ");

    expect(saved[0]?.status).toBe(BrandStatus.rejected);
    expect(saved[0]?.rejection_reason).toBe("Duplicate of Cerave");
  });

  test("a blank rejection reason is refused before the row is read", async () => {
    let read = false;
    const service = withRepo(new BrandService(), {
      findOne: async () => {
        read = true;
        return null;
      },
      save: async (d: unknown) => d,
    });

    await expect(service.rejectSubmission(BRAND, ADMIN, "   ")).rejects.toThrow(HttpError);
    expect(read).toBe(false);
  });

  test("a brand that is already decided cannot be re-reviewed", async () => {
    const service = withRepo(new BrandService(), {
      findOne: async () => ({ id: BRAND, status: BrandStatus.approved }),
      save: async (d: unknown) => d,
    });

    await expect(service.approveSubmission(BRAND, ADMIN)).rejects.toThrow(HttpError);
    await expect(service.rejectSubmission(BRAND, ADMIN, "no")).rejects.toThrow(HttpError);
  });
});
