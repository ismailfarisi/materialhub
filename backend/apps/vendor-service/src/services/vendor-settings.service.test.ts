import { describe, expect, mock, test } from "bun:test";
import { VendorSettingsService } from "./vendor-settings.service.ts";

function makeService(vendor: any) {
  const service = new VendorSettingsService();
  const repo = {
    findOne: mock(async () => vendor),
    save: mock(async (v: any) => v),
  };
  Object.defineProperty(service, "vendorRepo", { get: () => repo });
  return { service, repo };
}

describe("VendorSettingsService.updateSettings", () => {
  test("saves the store name and processing time", async () => {
    const { service } = makeService({ id: "v1", name: "Old", processing_time_days: 2 });
    const saved: any = await service.updateSettings("v1", {
      name: "  E2E fix Al Quoz Boards  ",
      processing_time_days: 4,
    });
    expect(saved.name).toBe("E2E fix Al Quoz Boards");
    expect(saved.processing_time_days).toBe(4);
  });

  test("ignores fields outside the vendor-editable set", async () => {
    const { service } = makeService({ id: "v1", status: "approved", commission_value: 10 });
    const saved: any = await service.updateSettings("v1", {
      description: "Greyboard and kraft",
      status: "suspended",
      commission_value: 0,
    } as any);
    expect(saved.description).toBe("Greyboard and kraft");
    expect(saved.status).toBe("approved");
    expect(saved.commission_value).toBe(10);
  });

  test("rejects a blank store name", async () => {
    const { service } = makeService({ id: "v1", name: "Old" });
    await expect(service.updateSettings("v1", { name: " " })).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
