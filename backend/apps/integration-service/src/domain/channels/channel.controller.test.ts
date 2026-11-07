import { describe, expect, it, mock } from "bun:test";
import { ChannelController } from "./channel.controller.ts";
import { ChannelService, isSalesChannelCode } from "./channel.service.ts";

const encryptionStub = { encryptObject: (o: unknown) => JSON.stringify(o) };

function build() {
  const repo = {
    find: mock(async () => []),
    findOne: mock(async () => null),
    save: mock(async (row: unknown) => row),
  };
  const svc = new ChannelService(repo as any, encryptionStub as any);
  const categoryMaps = { list: mock(async () => []), upsert: mock(async () => ({})) };
  return { repo, controller: new ChannelController(svc, categoryMaps as any), categoryMaps };
}

const notFound = { statusCode: 404 };

describe("isSalesChannelCode", () => {
  it("accepts exactly the sales_channels_code_enum values", () => {
    expect(isSalesChannelCode("google_merchant")).toBe(true);
    expect(isSalesChannelCode("meta_catalog")).toBe(true);
    expect(isSalesChannelCode("tiktok")).toBe(true);
    expect(isSalesChannelCode("google")).toBe(false);
    expect(isSalesChannelCode("")).toBe(false);
    expect(isSalesChannelCode(undefined)).toBe(false);
  });
});

describe("ChannelController with a code outside the enum", () => {
  // Querying the enum column with "google" raised Postgres 22P02 (a 500).
  it("404s every :code endpoint without touching the repository", async () => {
    const { controller, repo, categoryMaps } = build();
    const runRepo = { find: mock(async () => []) } as any;
    const deliveryRepo = { find: mock(async () => []) } as any;
    const queue = { add: mock(async () => ({})) } as any;

    await expect(controller.get("google")).rejects.toMatchObject(notFound);
    await expect(controller.update("google", { is_enabled: true })).rejects.toMatchObject(notFound);
    await expect(controller.setCredentials("google", { k: "v" })).rejects.toMatchObject(notFound);
    await expect(controller.listCategoryMappings("google")).rejects.toMatchObject(notFound);
    await expect(
      controller.upsertCategoryMapping("google", {
        category_id: "c",
        external_category_id: "1",
      }),
    ).rejects.toMatchObject(notFound);
    await expect(controller.listRuns("google", 10, runRepo)).rejects.toMatchObject(notFound);
    await expect(controller.listDeliveries("google", 10, deliveryRepo)).rejects.toMatchObject(
      notFound,
    );
    await expect(controller.stats("google", runRepo, deliveryRepo)).rejects.toMatchObject(notFound);
    await expect(controller.rebuild("google", queue)).rejects.toMatchObject(notFound);

    expect(repo.findOne).not.toHaveBeenCalled();
    expect(runRepo.find).not.toHaveBeenCalled();
    expect(deliveryRepo.find).not.toHaveBeenCalled();
    expect(categoryMaps.list).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("still queries for a valid code", async () => {
    const { controller, repo } = build();
    await expect(controller.get("tiktok")).rejects.toMatchObject(notFound);
    expect(repo.findOne).toHaveBeenCalledTimes(1);
  });
});
