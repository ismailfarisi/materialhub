import { describe, expect, it } from "bun:test";
import { ServiceOfferingStatus } from "@materialhub/database";
import { ServiceOfferingService } from "./service-offering.service.ts";

// listForVendor is the only offerings read the vendor dashboard makes, so it is
// where the client learns what publishing will actually do. Without this the
// dashboard has to re-derive the trust rule itself and drifts out of sync with
// ServiceOfferingService.update — the copy said "bookable immediately" while an
// untrusted vendor's publish was being rewritten to pending_review.

function makeService(opts: { vendorTrusted: boolean; offerings?: Record<string, unknown>[] }) {
  const offeringRepo = {
    find: async () =>
      opts.offerings ?? [
        { id: "o1", vendor_id: "v1", status: ServiceOfferingStatus.draft },
        { id: "o2", vendor_id: "v1", status: ServiceOfferingStatus.paused },
      ],
  };
  const vendorRepo = {
    findOne: async () => ({ id: "v1", services_trusted: opts.vendorTrusted }),
  };
  return new ServiceOfferingService(
    // biome-ignore lint/suspicious/noExplicitAny: mocked repositories
    offeringRepo as any,
    // biome-ignore lint/suspicious/noExplicitAny: mocked repositories
    {} as any,
    // biome-ignore lint/suspicious/noExplicitAny: mocked repositories
    vendorRepo as any,
  );
}

describe("ServiceOfferingService.listForVendor — publish_requires_review signal", () => {
  it("flags every offering when the vendor is untrusted", async () => {
    const svc = makeService({ vendorTrusted: false });
    const result = await svc.listForVendor("v1");
    expect(result.map((o) => o.publish_requires_review)).toEqual([true, true]);
  });

  it("clears the flag once the vendor is trusted", async () => {
    const svc = makeService({ vendorTrusted: true });
    const result = await svc.listForVendor("v1");
    expect(result.map((o) => o.publish_requires_review)).toEqual([false, false]);
  });

  it("treats a missing vendor row as untrusted", async () => {
    const offeringRepo = {
      find: async () => [{ id: "o1", vendor_id: "v1", status: ServiceOfferingStatus.draft }],
    };
    const svc = new ServiceOfferingService(
      // biome-ignore lint/suspicious/noExplicitAny: mocked repositories
      offeringRepo as any,
      // biome-ignore lint/suspicious/noExplicitAny: mocked repositories
      {} as any,
      // biome-ignore lint/suspicious/noExplicitAny: mocked repositories
      { findOne: async () => null } as any,
    );
    const result = await svc.listForVendor("v1");
    expect(result[0]?.publish_requires_review).toBe(true);
  });

  it("preserves the existing offering fields alongside the flag", async () => {
    const svc = makeService({
      vendorTrusted: false,
      offerings: [{ id: "o1", vendor_id: "v1", name: "Balayage", price_fils: 25000 }],
    });
    const result = await svc.listForVendor("v1");
    expect(result[0]).toMatchObject({ id: "o1", name: "Balayage", price_fils: 25000 });
  });
});
