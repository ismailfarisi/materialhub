import { describe, expect, it, mock } from "bun:test";
import { PendingWritesService } from "./pending-writes.service.ts";

const PW_ID = "6f1c2e44-0b6a-4a8e-9d2f-3c5b7a9e1d01";

const repoStub = () => ({
  save: mock((v: any) => Promise.resolve({ id: "pw1", ...v })),
  find: mock(() => Promise.resolve([])),
  findOne: mock(() => Promise.resolve(null)),
  update: mock(() => Promise.resolve({ affected: 1 })),
});

describe("PendingWritesService", () => {
  it("stages a proposal", async () => {
    const repo = repoStub();
    const svc = new PendingWritesService(repo as any);
    const r = await svc.stage({
      integration_id: "i1",
      delivery_id: "d1",
      kind: "inventory.adjust",
      payload: { delta: 50 },
      thresholdBreached: true,
    });
    expect(r.id).toBe("pw1");
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "inventory.adjust",
        status: "pending",
        auto_apply_threshold_breached: true,
      }),
    );
  });

  it("approves a pending write", async () => {
    const repo = repoStub();
    repo.findOne = mock(() =>
      Promise.resolve({
        id: PW_ID,
        status: "pending",
        integration_id: "i1",
        payload: {},
      }),
    ) as any;
    const svc = new PendingWritesService(repo as any);
    const r = await svc.approve(PW_ID, "admin1");
    expect(r.status).toBe("approved");
  });

  it("approve/reject of an unknown id is a 404, not a 500", async () => {
    const repo = repoStub();
    const svc = new PendingWritesService(repo as any);
    await expect(svc.approve(PW_ID, "admin1")).rejects.toMatchObject({ statusCode: 404 });
    await expect(svc.reject(PW_ID, "admin1")).rejects.toMatchObject({ statusCode: 404 });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("a malformed id is a 404 and never reaches the uuid column", async () => {
    const repo = repoStub();
    const svc = new PendingWritesService(repo as any);
    await expect(svc.approve("does-not-exist", "admin1")).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(svc.reject("does-not-exist", "admin1")).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(repo.findOne).not.toHaveBeenCalled();
  });

  it("reviewing an already-reviewed write is a 409", async () => {
    const repo = repoStub();
    repo.findOne = mock(() => Promise.resolve({ id: PW_ID, status: "applied" })) as any;
    const svc = new PendingWritesService(repo as any);
    await expect(svc.approve(PW_ID, "admin1")).rejects.toMatchObject({ statusCode: 409 });
    await expect(svc.reject(PW_ID, "admin1")).rejects.toMatchObject({ statusCode: 409 });
  });

  it("lists nothing for a malformed integration id without querying", async () => {
    const repo = repoStub();
    const svc = new PendingWritesService(repo as any);
    expect(await svc.list("i1")).toEqual([]);
    expect(repo.find).not.toHaveBeenCalled();
  });
});

describe("PendingWritesService.list for an unknown integration", () => {
  const INTEGRATION = "7a1c2e44-0b6a-4a8e-9d2f-3c5b7a9e1d02";
  it("is a 404, not an empty list", async () => {
    const svc = new PendingWritesService(repoStub() as any, async () => false);
    await expect(svc.list(INTEGRATION)).rejects.toMatchObject({ statusCode: 404 });
    await expect(svc.list("not-a-uuid")).rejects.toMatchObject({ statusCode: 404 });
  });
  it("lists when the integration exists", async () => {
    const repo = repoStub();
    const svc = new PendingWritesService(repo as any, async () => true);
    expect(await svc.list(INTEGRATION, "pending")).toEqual([]);
    expect(repo.find).toHaveBeenCalled();
  });
});
