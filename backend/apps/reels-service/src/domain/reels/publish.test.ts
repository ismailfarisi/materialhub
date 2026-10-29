import { describe, expect, it, mock } from "bun:test";
import { ReelStatus } from "@materialhub/database";
import { ReelsService } from "./reels.service.ts";

function makeService(reelFixture: any, tagCount: number, trusted: boolean) {
  const saveMock = mock(async (x: any) => x);
  const repo = {
    findOne: async () => reelFixture,
    save: saveMock,
  };
  const service = new ReelsService({} as any, {} as any, {} as any);
  (service as any).reelRepo = repo;
  (service as any).countTagsForReel = async () => tagCount;
  (service as any).isTrustedUser = async () => trusted;
  return { service, repo, saveMock };
}

describe("ReelsService.publish", () => {
  it("requires at least one tag", async () => {
    const { service, saveMock } = makeService(
      { id: "r1", user_id: "u1", status: ReelStatus.draft },
      0,
      false,
    );
    await expect(service.publish({ reelId: "r1", userId: "u1" })).rejects.toThrow(
      /at_least_one_tag/,
    );
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("transitions to pending_review for untrusted user", async () => {
    const { service, saveMock } = makeService(
      { id: "r1", user_id: "u1", status: ReelStatus.draft },
      1,
      false,
    );
    const reel = await service.publish({ reelId: "r1", userId: "u1" });
    expect(reel.status).toBe(ReelStatus.pending_review);
    expect(saveMock).toHaveBeenCalled();
  });

  it("transitions to approved with published_at for trusted user", async () => {
    const { service } = makeService({ id: "r1", user_id: "u1", status: ReelStatus.draft }, 2, true);
    const reel = await service.publish({ reelId: "r1", userId: "u1" });
    expect(reel.status).toBe(ReelStatus.approved);
    expect(reel.published_at).toBeInstanceOf(Date);
  });

  it("rejects publishing a reel owned by someone else", async () => {
    const { service } = makeService(
      { id: "r1", user_id: "OTHER", status: ReelStatus.draft },
      1,
      false,
    );
    await expect(service.publish({ reelId: "r1", userId: "u1" })).rejects.toThrow(/not_the_owner/);
  });

  it("rejects publishing a reel not in draft state", async () => {
    const { service } = makeService(
      { id: "r1", user_id: "u1", status: ReelStatus.approved },
      1,
      true,
    );
    await expect(service.publish({ reelId: "r1", userId: "u1" })).rejects.toThrow(/draft/);
  });
});

describe("ReelsService.getById", () => {
  it("returns the reel when it's approved (visible to any viewer)", async () => {
    const reel = { id: "r1", user_id: "u1", status: ReelStatus.approved };
    const service = new ReelsService({} as any, {} as any, {} as any);
    (service as any).reelRepo = { findOne: async () => reel };
    const result = await service.getById("r1", null);
    expect(result).toEqual(reel as any);
  });

  it("returns null for anonymous viewer on non-approved reel", async () => {
    const reel = { id: "r1", user_id: "u1", status: ReelStatus.draft };
    const service = new ReelsService({} as any, {} as any, {} as any);
    (service as any).reelRepo = { findOne: async () => reel };
    const result = await service.getById("r1", null);
    expect(result).toBeNull();
  });

  it("returns the reel for its owner even if not approved", async () => {
    const reel = { id: "r1", user_id: "u1", status: ReelStatus.pending_review };
    const service = new ReelsService({} as any, {} as any, {} as any);
    (service as any).reelRepo = { findOne: async () => reel };
    const result = await service.getById("r1", "u1");
    expect(result).toEqual(reel as any);
  });
});
