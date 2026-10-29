import { describe, expect, it } from "bun:test";
import { ServiceOfferingStatus } from "@materialhub/database";
import { ServiceOfferingService } from "./service-offering.service.ts";

function makeService(opts: {
  offering: Record<string, unknown>;
  vendorTrusted: boolean;
}) {
  const saved: Record<string, unknown>[] = [];
  const offeringRepo = {
    findOne: async () => ({ ...opts.offering }),
    save: async (o: Record<string, unknown>) => {
      saved.push(o);
      return o;
    },
    create: (o: Record<string, unknown>) => o,
  };
  const translationRepo = {};
  const vendorRepo = {
    findOne: async () => ({ id: "v1", services_trusted: opts.vendorTrusted }),
    update: async () => ({ affected: 1 }),
  };
  // Passed explicitly so update() doesn't fall through to the real
  // enqueueServiceSearchSync default, which would try to reach a live Redis.
  const onWrite = async () => {};
  const svc = new ServiceOfferingService(
    // biome-ignore lint/suspicious/noExplicitAny: mocked repositories
    offeringRepo as any,
    // biome-ignore lint/suspicious/noExplicitAny: mocked repositories
    translationRepo as any,
    // biome-ignore lint/suspicious/noExplicitAny: mocked repositories
    vendorRepo as any,
    onWrite,
  );
  return { svc, saved };
}

describe("ServiceOfferingService.update — approval gate", () => {
  it("routes an untrusted vendor's publish request to pending_review", async () => {
    const { svc } = makeService({
      offering: { id: "o1", vendor_id: "v1", status: ServiceOfferingStatus.draft },
      vendorTrusted: false,
    });
    const result = await svc.update("v1", "o1", { status: "published" });
    expect(result.status).toBe(ServiceOfferingStatus.pending_review);
  });

  it("lets a trusted vendor publish directly", async () => {
    const { svc } = makeService({
      offering: { id: "o1", vendor_id: "v1", status: ServiceOfferingStatus.draft },
      vendorTrusted: true,
    });
    const result = await svc.update("v1", "o1", { status: "published" });
    expect(result.status).toBe(ServiceOfferingStatus.published);
  });

  it("clears rejection_reason when a rejected offering is resubmitted", async () => {
    const { svc } = makeService({
      offering: {
        id: "o1",
        vendor_id: "v1",
        status: ServiceOfferingStatus.rejected,
        rejection_reason: "Photos are stock images",
      },
      vendorTrusted: false,
    });
    const result = await svc.update("v1", "o1", { status: "published" });
    expect(result.status).toBe(ServiceOfferingStatus.pending_review);
    expect(result.rejection_reason).toBeNull();
  });

  it("does not touch status when the update omits it", async () => {
    const { svc } = makeService({
      offering: { id: "o1", vendor_id: "v1", status: ServiceOfferingStatus.published },
      vendorTrusted: false,
    });
    const result = await svc.update("v1", "o1", { name: "New name" });
    expect(result.status).toBe(ServiceOfferingStatus.published);
  });

  it("leaves non-publish transitions alone for untrusted vendors", async () => {
    const { svc } = makeService({
      offering: { id: "o1", vendor_id: "v1", status: ServiceOfferingStatus.published },
      vendorTrusted: false,
    });
    const result = await svc.update("v1", "o1", { status: "paused" });
    expect(result.status).toBe(ServiceOfferingStatus.paused);
  });

  it("still persists a co-updated data field when the gate rewrites status", async () => {
    const { svc } = makeService({
      offering: {
        id: "o1",
        vendor_id: "v1",
        status: ServiceOfferingStatus.draft,
        name: "Old name",
      },
      vendorTrusted: false,
    });
    const result = await svc.update("v1", "o1", { name: "New name", status: "published" });
    expect(result.status).toBe(ServiceOfferingStatus.pending_review);
    expect(result.name).toBe("New name");
  });
});
