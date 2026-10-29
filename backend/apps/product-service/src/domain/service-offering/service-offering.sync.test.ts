import { describe, expect, it } from "bun:test";
import { ServiceOfferingService } from "./service-offering.service.ts";

function makeService(offering: any) {
  const enqueued: string[] = [];
  const offeringRepo = {
    create: (v: any) => v,
    save: async (v: any) => v,
    findOne: async () => offering,
  };
  const translationRepo = {};
  const vendorRepo = {
    findOne: async () => ({ id: "v1", services_trusted: true }),
    update: async () => undefined,
  };
  const svc = new ServiceOfferingService(
    offeringRepo as any,
    translationRepo as any,
    vendorRepo as any,
    async (id: string) => {
      enqueued.push(id);
    },
  );
  return { svc, enqueued };
}

const base = {
  id: "o1",
  vendor_id: "v1",
  status: "pending_review",
  name: "Balayage",
  price_fils: 1000,
  duration_minutes: 60,
};

describe("ServiceOfferingService write hooks", () => {
  it("enqueues on create", async () => {
    const { svc, enqueued } = makeService(base);
    const created = await svc.create("v1", {
      name: "Balayage",
      duration_minutes: 60,
      price_fils: 1000,
    });
    expect(enqueued).toEqual([created.id]);
  });

  it("enqueues on update", async () => {
    const { svc, enqueued } = makeService({ ...base, status: "published" });
    await svc.update("v1", "o1", { status: "paused" });
    expect(enqueued).toEqual(["o1"]);
  });

  it("enqueues on approve", async () => {
    const { svc, enqueued } = makeService({ ...base, status: "pending_review" });
    await svc.approve("o1", "admin-1");
    expect(enqueued).toEqual(["o1"]);
  });

  it("enqueues on reject", async () => {
    const { svc, enqueued } = makeService({ ...base, status: "pending_review" });
    await svc.reject("o1", "admin-1", "Photos are too blurry");
    expect(enqueued).toEqual(["o1"]);
  });

  it("does not enqueue when the write throws", async () => {
    const { svc, enqueued } = makeService({ ...base, status: "published" });
    // approve() rejects anything not in pending_review.
    await expect(svc.approve("o1", "admin-1")).rejects.toThrow();
    expect(enqueued).toEqual([]);
  });
});
