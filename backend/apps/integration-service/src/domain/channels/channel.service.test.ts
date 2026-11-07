import { describe, expect, it, mock } from "bun:test";
import type { ChannelDelivery, ChannelFeedRun } from "@materialhub/database";
import { ChannelService } from "./channel.service.ts";

const encryptionStub = () => ({
  encrypt: (s: string) => `enc(${s})`,
  decrypt: (s: string) => s.replace(/^enc\(/, "").replace(/\)$/, ""),
  encryptObject: (o: any) => `enc(${JSON.stringify(o)})`,
  decryptObject: (s: string) => JSON.parse(s.replace(/^enc\(/, "").replace(/\)$/, "")),
});

function repoStub(rows: any[]) {
  return {
    find: mock(async () => rows.filter((r) => !r.deleted_at)),
    findOne: mock(
      async (opts: any) => rows.find((r) => r.code === opts?.where?.code && !r.deleted_at) ?? null,
    ),
    save: mock(async (row: any) => row),
  };
}

describe("ChannelService.list", () => {
  it("returns views without credentials, with has_credentials flag", async () => {
    const repo = repoStub([
      {
        id: "c1",
        code: "google_merchant",
        display_name: "G",
        is_enabled: false,
        config: {},
        credentials_encrypted: "enc(secret)",
      },
      {
        id: "c2",
        code: "tiktok",
        display_name: "T",
        is_enabled: true,
        config: {},
        credentials_encrypted: null,
      },
    ]);
    const svc = new ChannelService(repo as any, encryptionStub() as any);
    const views = await svc.list();
    expect(views).toHaveLength(2);
    expect((views[0] as any).credentials_encrypted).toBeUndefined();
    expect(views[0]?.has_credentials).toBe(true);
    expect(views[1]?.has_credentials).toBe(false);
  });
});

describe("ChannelService.update", () => {
  it("applies only allowed fields and returns the updated view", async () => {
    const row = {
      id: "c1",
      code: "google_merchant",
      display_name: "G",
      is_enabled: false,
      config: {},
      feed_format: "xml",
      delta_enabled: true,
      credentials_encrypted: null,
    };
    const repo = repoStub([row]);
    const svc = new ChannelService(repo as any, encryptionStub() as any);
    const updated = await svc.update("google_merchant", {
      is_enabled: true,
      config: { merchant_id: "123" },
      id: "HACKED",
    } as any);
    expect(updated?.is_enabled).toBe(true);
    expect(updated?.config).toEqual({ merchant_id: "123" });
    expect(updated?.id).toBe("c1");
  });

  it("returns null for an unknown channel code", async () => {
    const svc = new ChannelService(repoStub([]) as any, encryptionStub() as any);
    expect(await svc.update("nope", { is_enabled: true })).toBeNull();
  });
});

describe("ChannelService.setCredentials", () => {
  it("encrypts the credential object onto the row", async () => {
    const row: any = { id: "c1", code: "meta_catalog", credentials_encrypted: null };
    const repo = repoStub([row]);
    const svc = new ChannelService(repo as any, encryptionStub() as any);
    const ok = await svc.setCredentials("meta_catalog", { token: "abc" });
    expect(ok).toBe(true);
    expect(row.credentials_encrypted).toBe('enc({"token":"abc"})');
  });

  it("returns false for an unknown channel code", async () => {
    const svc = new ChannelService(repoStub([]) as any, encryptionStub() as any);
    expect(await svc.setCredentials("nope", {})).toBe(false);
  });
});

function runRepoStub(rows: ChannelFeedRun[]) {
  return {
    find: mock(async (opts: any) =>
      rows
        .filter((r) => r.channel_id === opts?.where?.channel_id)
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
        .slice(0, opts?.take ?? 10),
    ),
  };
}

function deliveryRepoStub(rows: ChannelDelivery[]) {
  return {
    find: mock(async (opts: any) =>
      rows
        .filter((r) => r.channel_id === opts?.where?.channel_id)
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
        .slice(0, opts?.take ?? 20),
    ),
  };
}

describe("ChannelService.listRecentRuns", () => {
  it("returns the N most recent runs for the channel, DESC by created_at", async () => {
    const channelRepo = repoStub([
      {
        id: "c1",
        code: "google_merchant",
        display_name: "G",
        is_enabled: true,
        config: {},
        credentials_encrypted: null,
      },
    ]);
    const runs = [
      {
        id: "r1",
        channel_id: "c1",
        status: "success",
        created_at: new Date("2026-06-01T10:00:00Z"),
      },
      {
        id: "r2",
        channel_id: "c1",
        status: "failed",
        created_at: new Date("2026-06-01T12:00:00Z"),
      },
      {
        id: "r3",
        channel_id: "c1",
        status: "success",
        created_at: new Date("2026-06-01T08:00:00Z"),
      },
      {
        id: "r4",
        channel_id: "OTHER",
        status: "success",
        created_at: new Date("2026-06-01T11:00:00Z"),
      },
    ] as any[];
    const runRepo = runRepoStub(runs as any);

    const svc = new ChannelService(channelRepo as any, encryptionStub() as any);
    const result = await svc.listRecentRuns("google_merchant", 2, runRepo as any);

    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe("r2");
    expect(result[1]?.id).toBe("r1");
  });

  it("returns [] for an unknown channel code", async () => {
    const svc = new ChannelService(repoStub([]) as any, encryptionStub() as any);
    const result = await svc.listRecentRuns("nope", 10, { find: mock(async () => []) } as any);
    expect(result).toEqual([]);
  });

  it("clamps NaN/negative/over-100 limits to a sane default or bound", async () => {
    const channelRepo = repoStub([
      {
        id: "c1",
        code: "google_merchant",
        display_name: "G",
        is_enabled: true,
        config: {},
        credentials_encrypted: null,
      },
    ]);
    const calls: number[] = [];
    const runRepo = {
      find: mock(async (opts: any) => {
        calls.push(opts.take);
        return [];
      }),
    };
    const svc = new ChannelService(channelRepo as any, encryptionStub() as any);
    await svc.listRecentRuns("google_merchant", Number.NaN, runRepo as any);
    await svc.listRecentRuns("google_merchant", -5, runRepo as any);
    await svc.listRecentRuns("google_merchant", 999, runRepo as any);
    expect(calls).toEqual([10, 1, 100]);
  });
});

describe("ChannelService.listRecentDeliveries", () => {
  it("returns the N most recent deliveries for the channel, DESC", async () => {
    const channelRepo = repoStub([
      {
        id: "c1",
        code: "google_merchant",
        display_name: "G",
        is_enabled: true,
        config: {},
        credentials_encrypted: null,
      },
    ]);
    const deliveries = [
      {
        id: "d1",
        channel_id: "c1",
        status: "success",
        created_at: new Date("2026-06-01T10:00:00Z"),
      },
      {
        id: "d2",
        channel_id: "c1",
        status: "failed",
        created_at: new Date("2026-06-01T12:00:00Z"),
      },
      {
        id: "d3",
        channel_id: "OTHER",
        status: "success",
        created_at: new Date("2026-06-01T11:00:00Z"),
      },
    ] as any[];
    const deliveryRepo = deliveryRepoStub(deliveries as any);

    const svc = new ChannelService(channelRepo as any, encryptionStub() as any);
    const result = await svc.listRecentDeliveries("google_merchant", 20, deliveryRepo as any);

    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe("d2");
  });

  it("returns [] for an unknown channel", async () => {
    const svc = new ChannelService(repoStub([]) as any, encryptionStub() as any);
    expect(
      await svc.listRecentDeliveries("nope", 20, { find: mock(async () => []) } as any),
    ).toEqual([]);
  });

  it("clamps NaN/negative/over-100 limits to a sane default or bound", async () => {
    const channelRepo = repoStub([
      {
        id: "c1",
        code: "google_merchant",
        display_name: "G",
        is_enabled: true,
        config: {},
        credentials_encrypted: null,
      },
    ]);
    const calls: number[] = [];
    const deliveryRepo = {
      find: mock(async (opts: any) => {
        calls.push(opts.take);
        return [];
      }),
    };
    const svc = new ChannelService(channelRepo as any, encryptionStub() as any);
    await svc.listRecentDeliveries("google_merchant", Number.NaN, deliveryRepo as any);
    await svc.listRecentDeliveries("google_merchant", -5, deliveryRepo as any);
    await svc.listRecentDeliveries("google_merchant", 999, deliveryRepo as any);
    expect(calls).toEqual([20, 1, 100]);
  });
});

describe("ChannelService.stats24h", () => {
  function statsRepoStub(rowsByStatus: Record<string, number>) {
    return {
      createQueryBuilder: mock(() => ({
        select: () => ({
          addSelect: () => ({
            where: () => ({
              andWhere: () => ({
                groupBy: () => ({
                  getRawMany: async () =>
                    Object.entries(rowsByStatus).map(([status, count]) => ({
                      status,
                      count: String(count),
                    })),
                }),
              }),
            }),
          }),
        }),
      })),
    };
  }

  it("aggregates runs + deliveries by status; rounds delivery pct to int", async () => {
    const channelRepo = repoStub([
      {
        id: "c1",
        code: "google_merchant",
        display_name: "G",
        is_enabled: true,
        config: {},
        credentials_encrypted: null,
      },
    ]);
    const runRepo = statsRepoStub({ success: 12, failed: 1, skipped: 2 });
    const deliveryRepo = statsRepoStub({ success: 61, failed: 1 });

    const svc = new ChannelService(channelRepo as any, encryptionStub() as any);
    const stats = await svc.stats24h("google_merchant", runRepo as any, deliveryRepo as any);

    expect(stats.runs).toEqual({ ok: 12, fail: 1, skipped: 2 });
    expect(stats.deliveries.ok).toBe(61);
    expect(stats.deliveries.fail).toBe(1);
    expect(stats.deliveries.pct).toBe(98); // 61/62 = 98.39 → 98
  });

  it("returns pct: null when no deliveries in the window", async () => {
    const channelRepo = repoStub([
      {
        id: "c1",
        code: "google_merchant",
        display_name: "G",
        is_enabled: true,
        config: {},
        credentials_encrypted: null,
      },
    ]);
    const runRepo = statsRepoStub({});
    const deliveryRepo = statsRepoStub({});

    const svc = new ChannelService(channelRepo as any, encryptionStub() as any);
    const stats = await svc.stats24h("google_merchant", runRepo as any, deliveryRepo as any);
    expect(stats.deliveries.pct).toBeNull();
  });

  it("returns zero-aggregate for an unknown channel", async () => {
    const svc = new ChannelService(repoStub([]) as any, encryptionStub() as any);
    const stats = await svc.stats24h("nope", statsRepoStub({}) as any, statsRepoStub({}) as any);
    expect(stats).toEqual({
      runs: { ok: 0, fail: 0, skipped: 0 },
      deliveries: { ok: 0, fail: 0, pct: null },
    });
  });
});

describe("ChannelService.enqueueRebuild", () => {
  it("adds a manual-trigger job to the queue and returns the jobId", async () => {
    const channelRepo = repoStub([
      {
        id: "c1",
        code: "google_merchant",
        display_name: "G",
        is_enabled: true,
        config: {},
        credentials_encrypted: null,
      },
    ]);
    const queueCalls: Array<{ name: string; data: any; opts: any }> = [];
    const queue = {
      add: mock(async (name: string, data: any, opts: any) => {
        queueCalls.push({ name, data, opts });
        return { id: opts.jobId };
      }),
    };

    const svc = new ChannelService(channelRepo as any, encryptionStub() as any);
    const result = await svc.enqueueRebuild("google_merchant", queue as any);

    expect(queueCalls).toHaveLength(1);
    expect(queueCalls[0]?.data).toEqual({ channelCode: "google_merchant", trigger: "manual" });
    expect(queueCalls[0]?.opts.jobId).toMatch(/^manual_google_merchant_/);
    expect(queueCalls[0]?.opts.jobId).not.toContain(":");
    expect(result.jobId).toBe(queueCalls[0]?.opts.jobId);
  });

  it("throws NotFound when channel doesn't exist", async () => {
    const svc = new ChannelService(repoStub([]) as any, encryptionStub() as any);
    await expect(
      svc.enqueueRebuild("nope", { add: mock(async () => ({ id: "x" })) } as any),
    ).rejects.toThrow();
  });
});
