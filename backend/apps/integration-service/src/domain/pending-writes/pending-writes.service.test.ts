import { describe, expect, it, mock } from "bun:test";
import { PendingWritesService } from "./pending-writes.service.ts";

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
        id: "pw1",
        status: "pending",
        integration_id: "i1",
        payload: {},
      }),
    ) as any;
    const svc = new PendingWritesService(repo as any);
    const r = await svc.approve("pw1", "admin1");
    expect(r.status).toBe("approved");
  });
});
