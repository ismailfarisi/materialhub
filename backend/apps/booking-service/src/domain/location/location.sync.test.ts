import { describe, expect, it } from "bun:test";
import { LocationService } from "./location.service.ts";

function makeService(existing: any = { id: "l1", vendor_id: "v1" }) {
  const notified: string[] = [];
  const locationRepo = {
    create: (v: any) => v,
    save: async (v: any) => ({ id: "l1", ...v }),
    findOne: async () => existing,
    find: async () => [],
  };
  const serviceAreaRepo = {
    create: (v: any) => v,
    save: async (v: any) => ({ id: "sa1", ...v }),
    findOne: async () => ({ id: "sa1", vendor_id: "v1" }),
    softRemove: async () => undefined,
    find: async () => [],
  };
  const svc = new LocationService(
    locationRepo as any,
    serviceAreaRepo as any,
    async (vendorId: string) => {
      notified.push(vendorId);
    },
  );
  return { svc, notified };
}

describe("LocationService — service-search fan-out", () => {
  it("notifies on branch create", async () => {
    const { svc, notified } = makeService();
    await svc.create("v1", { name: "Marina Branch" });
    expect(notified).toEqual(["v1"]);
  });

  it("notifies on branch update (covers the is_active toggle)", async () => {
    const { svc, notified } = makeService();
    await svc.update("v1", "l1", { is_active: false });
    expect(notified).toEqual(["v1"]);
  });

  it("notifies on service-area add", async () => {
    const { svc, notified } = makeService();
    await svc.addServiceArea("v1", { area_id: "a1" });
    expect(notified).toEqual(["v1"]);
  });

  it("notifies on service-area remove", async () => {
    const { svc, notified } = makeService();
    await svc.removeServiceArea("v1", "sa1");
    expect(notified).toEqual(["v1"]);
  });

  it("does not notify on reads", async () => {
    const { svc, notified } = makeService();
    await svc.list("v1");
    await svc.listServiceAreas("v1");
    await svc.listActiveForVendor("v1");
    expect(notified).toEqual([]);
  });

  it("does not notify when the write fails", async () => {
    const { svc, notified } = makeService(null);
    await expect(svc.update("v1", "missing", { name: "x" })).rejects.toThrow();
    expect(notified).toEqual([]);
  });
});
