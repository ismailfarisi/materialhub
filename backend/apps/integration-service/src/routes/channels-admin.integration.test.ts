import { describe, expect, it, mock } from "bun:test";
import { errorHandler } from "@materialhub/plugins";
import { Elysia, t } from "elysia";
import { CategoryMapService } from "../domain/channels/category-map.service.ts";
import { ChannelController } from "../domain/channels/channel.controller.ts";
import { ChannelService } from "../domain/channels/channel.service.ts";

const ok = (data: unknown, status = 200) => ({
  statusCode: status,
  data,
  timestamp: new Date().toISOString(),
});

const encryptionStub = {
  encrypt: (s: string) => `enc(${s})`,
  decrypt: (s: string) => s,
  encryptObject: (o: any) => `enc(${JSON.stringify(o)})`,
  decryptObject: (s: string) => JSON.parse(s),
};

function buildApp() {
  const channelRows: any[] = [
    {
      id: "c1",
      code: "google_merchant",
      display_name: "Google Merchant Center",
      is_enabled: false,
      config: {},
      feed_url: null,
      feed_format: "xml",
      delta_enabled: true,
      last_full_feed_at: null,
      last_full_feed_status: null,
      last_delta_success_at: null,
      degraded_until: null,
      credentials_encrypted: null,
    },
  ];
  const channelRepo = {
    find: mock(async () => channelRows),
    findOne: mock(
      async (opts: any) => channelRows.find((r) => r.code === opts?.where?.code) ?? null,
    ),
    save: mock(async (row: any) => row),
  };

  const mappingRows: any[] = [];
  const mappingRepo = {
    find: mock(async (opts: any) =>
      mappingRows.filter((r) => r.channel_id === opts?.where?.channel_id && !r.deleted_at),
    ),
    findOne: mock(
      async (opts: any) =>
        mappingRows.find(
          (r) =>
            r.channel_id === opts?.where?.channel_id &&
            r.category_id === opts?.where?.category_id &&
            !r.deleted_at,
        ) ?? null,
    ),
    save: mock(async (row: any) => {
      if (!row.id) {
        row.id = `map-${mappingRows.length + 1}`;
        mappingRows.push(row);
      }
      return row;
    }),
    softDelete: mock(async (id: string) => {
      const r = mappingRows.find((x) => x.id === id);
      if (r) r.deleted_at = new Date();
      return { affected: r ? 1 : 0 };
    }),
  };

  const runRows: any[] = [
    {
      id: "run-1",
      channel_id: "c1",
      status: "success",
      item_count: 100,
      created_at: new Date("2026-06-01T10:00:00Z"),
      trigger: "cron",
    },
    {
      id: "run-2",
      channel_id: "c1",
      status: "failed",
      item_count: 0,
      created_at: new Date("2026-06-01T12:00:00Z"),
      trigger: "cron",
    },
  ];
  const runRepo = {
    find: mock(async (opts: any) => {
      const ch = opts?.where?.channel_id;
      const rows = runRows.filter((r) => r.channel_id === ch);
      rows.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
      return rows.slice(0, opts?.take ?? 10);
    }),
    createQueryBuilder: mock(() => ({
      select: () => ({
        addSelect: () => ({
          where: () => ({
            andWhere: () => ({
              groupBy: () => ({
                getRawMany: async () => [{ status: "success", count: "1" }],
              }),
            }),
          }),
        }),
      }),
    })),
  };

  const deliveryRows: any[] = [
    {
      id: "d-1",
      channel_id: "c1",
      status: "success",
      event_name: "Purchase",
      created_at: new Date("2026-06-01T10:01:00Z"),
      latency_ms: 123,
      attempt: 1,
    },
  ];
  const deliveryRepo = {
    find: mock(async (opts: any) => {
      const ch = opts?.where?.channel_id;
      const rows = deliveryRows.filter((r) => r.channel_id === ch);
      rows.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
      return rows.slice(0, opts?.take ?? 20);
    }),
    createQueryBuilder: mock(() => ({
      select: () => ({
        addSelect: () => ({
          where: () => ({
            andWhere: () => ({
              groupBy: () => ({
                getRawMany: async () => [{ status: "success", count: "1" }],
              }),
            }),
          }),
        }),
      }),
    })),
  };

  const queueCalls: Array<{ name: string; data: any; opts: any }> = [];
  const feedBuildQueue = {
    add: mock(async (name: string, data: any, opts: any) => {
      queueCalls.push({ name, data, opts });
      return { id: opts.jobId };
    }),
  };

  const channelService = new ChannelService(channelRepo as any, encryptionStub as any);
  const categoryMapService = new CategoryMapService(mappingRepo as any);
  const controller = new ChannelController(channelService, categoryMapService);

  const app = new Elysia()
    .use(errorHandler)
    .decorate("channelController", controller)
    .get("/admin/sales-channels", async ({ channelController }: any) =>
      ok(await channelController.list()),
    )
    .get(
      "/admin/sales-channels/:code",
      async ({ params, channelController }: any) => ok(await channelController.get(params.code)),
      { params: t.Object({ code: t.String() }) },
    )
    .patch(
      "/admin/sales-channels/:code",
      async ({ params, body, channelController }: any) =>
        ok(await channelController.update(params.code, body)),
      {
        params: t.Object({ code: t.String() }),
        body: t.Object({
          display_name: t.Optional(t.String()),
          is_enabled: t.Optional(t.Boolean()),
          config: t.Optional(t.Object({}, { additionalProperties: true })),
          feed_format: t.Optional(t.String()),
          delta_enabled: t.Optional(t.Boolean()),
        }),
      },
    )
    .put(
      "/admin/sales-channels/:code/credentials",
      async ({ params, body, channelController }: any) =>
        ok(await channelController.setCredentials(params.code, body.credentials)),
      {
        params: t.Object({ code: t.String() }),
        body: t.Object({ credentials: t.Object({}, { additionalProperties: true }) }),
      },
    )
    .put(
      "/admin/sales-channels/:code/category-mappings",
      async ({ params, body, channelController }: any) =>
        ok(await channelController.upsertCategoryMapping(params.code, body)),
      {
        params: t.Object({ code: t.String() }),
        body: t.Object({
          category_id: t.String({ format: "uuid" }),
          external_category_id: t.String({ minLength: 1, maxLength: 64 }),
          external_category_path: t.Optional(t.Union([t.String(), t.Null()])),
        }),
      },
    )
    .get(
      "/admin/sales-channels/:code/category-mappings",
      async ({ params, channelController }: any) =>
        ok(await channelController.listCategoryMappings(params.code)),
      { params: t.Object({ code: t.String() }) },
    )
    .delete(
      "/admin/sales-channels/category-mappings/:id",
      async ({ params, channelController }: any) =>
        ok(await channelController.deleteCategoryMapping(params.id)),
      { params: t.Object({ id: t.String() }) },
    )
    .get(
      "/admin/sales-channels/:code/runs",
      async ({ params, query, channelController }: any) => {
        const limit = Number(query.limit ?? 10);
        return ok(await channelController.listRuns(params.code, limit, runRepo));
      },
      {
        params: t.Object({ code: t.String() }),
        query: t.Object({ limit: t.Optional(t.String()) }),
      },
    )
    .get(
      "/admin/sales-channels/:code/deliveries",
      async ({ params, query, channelController }: any) => {
        const limit = Number(query.limit ?? 20);
        return ok(await channelController.listDeliveries(params.code, limit, deliveryRepo));
      },
      {
        params: t.Object({ code: t.String() }),
        query: t.Object({ limit: t.Optional(t.String()) }),
      },
    )
    .get(
      "/admin/sales-channels/:code/stats",
      async ({ params, channelController }: any) =>
        ok(await channelController.stats(params.code, runRepo, deliveryRepo)),
      { params: t.Object({ code: t.String() }) },
    )
    .post(
      "/admin/sales-channels/:code/rebuild",
      async ({ params, channelController }: any) =>
        ok(await channelController.rebuild(params.code, feedBuildQueue), 202),
      { params: t.Object({ code: t.String() }) },
    );

  return { app, channelRows, mappingRows, runRows, deliveryRows, queueCalls };
}

describe("GET /admin/sales-channels", () => {
  it("lists channels without exposing credentials", async () => {
    const { app } = buildApp();
    const res = (await app
      .handle(new Request("http://localhost/admin/sales-channels"))
      .then((r) => r.json())) as any;
    expect(res.statusCode).toBe(200);
    expect(res.data).toHaveLength(1);
    expect(res.data[0].credentials_encrypted).toBeUndefined();
    expect(res.data[0].has_credentials).toBe(false);
  });
});

describe("GET /admin/sales-channels/:code", () => {
  it("returns 404 for an unknown channel", async () => {
    const { app } = buildApp();
    const res = await app.handle(new Request("http://localhost/admin/sales-channels/nope"));
    expect(res.status).toBe(404);
  });
});

describe("PATCH /admin/sales-channels/:code", () => {
  it("enables a channel and patches config", async () => {
    const { app } = buildApp();
    const res = (await app
      .handle(
        new Request("http://localhost/admin/sales-channels/google_merchant", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ is_enabled: true, config: { merchant_id: "555" } }),
        }),
      )
      .then((r) => r.json())) as any;
    expect(res.statusCode).toBe(200);
    expect(res.data.is_enabled).toBe(true);
    expect(res.data.config).toEqual({ merchant_id: "555" });
  });
});

describe("PUT /admin/sales-channels/:code/credentials", () => {
  it("stores encrypted credentials", async () => {
    const { app, channelRows } = buildApp();
    const res = (await app
      .handle(
        new Request("http://localhost/admin/sales-channels/google_merchant/credentials", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ credentials: { service_account_key: "xyz" } }),
        }),
      )
      .then((r) => r.json())) as any;
    expect(res.statusCode).toBe(200);
    expect(res.data.credentials_set).toBe(true);
    expect(channelRows[0].credentials_encrypted).toBe('enc({"service_account_key":"xyz"})');
  });
});

describe("PUT /admin/sales-channels/:code/category-mappings", () => {
  it("creates a category mapping resolved to the channel id", async () => {
    const { app, mappingRows } = buildApp();
    const res = (await app
      .handle(
        new Request("http://localhost/admin/sales-channels/google_merchant/category-mappings", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            category_id: "11111111-1111-1111-1111-111111111111",
            external_category_id: "499676",
            external_category_path: "Beauty > Skincare",
          }),
        }),
      )
      .then((r) => r.json())) as any;
    expect(res.statusCode).toBe(200);
    expect(res.data.external_category_id).toBe("499676");
    expect(mappingRows).toHaveLength(1);
    expect(mappingRows[0].channel_id).toBe("c1");
  });
});

describe("GET /admin/sales-channels/:code/category-mappings", () => {
  it("lists the channel's category mappings", async () => {
    const { app, mappingRows } = buildApp();
    mappingRows.push({
      id: "m-seed",
      channel_id: "c1",
      category_id: "cat-x",
      external_category_id: "999",
      external_category_path: null,
      deleted_at: null,
    });
    const res = (await app
      .handle(
        new Request("http://localhost/admin/sales-channels/google_merchant/category-mappings"),
      )
      .then((r) => r.json())) as any;
    expect(res.statusCode).toBe(200);
    expect(res.data).toHaveLength(1);
    expect(res.data[0].id).toBe("m-seed");
  });
});

describe("DELETE /admin/sales-channels/category-mappings/:id", () => {
  it("soft-deletes an existing mapping", async () => {
    const { app, mappingRows } = buildApp();
    mappingRows.push({
      id: "m-seed",
      channel_id: "c1",
      category_id: "cat-x",
      external_category_id: "999",
      external_category_path: null,
      deleted_at: null,
    });
    const res = (await app
      .handle(
        new Request("http://localhost/admin/sales-channels/category-mappings/m-seed", {
          method: "DELETE",
        }),
      )
      .then((r) => r.json())) as any;
    expect(res.statusCode).toBe(200);
    expect(res.data.id).toBe("m-seed");
    expect(mappingRows[0].deleted_at).not.toBeNull();
  });

  it("returns 404 when the mapping does not exist", async () => {
    const { app } = buildApp();
    const res = await app.handle(
      new Request("http://localhost/admin/sales-channels/category-mappings/nope", {
        method: "DELETE",
      }),
    );
    expect(res.status).toBe(404);
  });
});

describe("GET /admin/sales-channels/:code/runs", () => {
  it("returns recent runs DESC", async () => {
    const { app } = buildApp();
    const res = (await app
      .handle(new Request("http://localhost/admin/sales-channels/google_merchant/runs?limit=5"))
      .then((r) => r.json())) as any;
    expect(res.statusCode).toBe(200);
    expect(res.data).toHaveLength(2);
    expect(res.data[0].id).toBe("run-2");
  });

  it("returns [] for unknown channel", async () => {
    const { app } = buildApp();
    const res = (await app
      .handle(new Request("http://localhost/admin/sales-channels/nope/runs"))
      .then((r) => r.json())) as any;
    expect(res.statusCode).toBe(200);
    expect(res.data).toEqual([]);
  });
});

describe("GET /admin/sales-channels/:code/deliveries", () => {
  it("returns recent deliveries DESC", async () => {
    const { app } = buildApp();
    const res = (await app
      .handle(new Request("http://localhost/admin/sales-channels/google_merchant/deliveries"))
      .then((r) => r.json())) as any;
    expect(res.statusCode).toBe(200);
    expect(res.data).toHaveLength(1);
    expect(res.data[0].id).toBe("d-1");
  });
});

describe("GET /admin/sales-channels/:code/stats", () => {
  it("returns the aggregated 24h shape", async () => {
    const { app } = buildApp();
    const res = (await app
      .handle(new Request("http://localhost/admin/sales-channels/google_merchant/stats"))
      .then((r) => r.json())) as any;
    expect(res.statusCode).toBe(200);
    expect(res.data.runs).toEqual({ ok: 1, fail: 0, skipped: 0 });
    expect(res.data.deliveries.ok).toBe(1);
    expect(res.data.deliveries.pct).toBe(100);
  });
});

describe("POST /admin/sales-channels/:code/rebuild", () => {
  it("enqueues a manual job and returns 202 with jobId", async () => {
    const { app, queueCalls } = buildApp();
    const res = await app.handle(
      new Request("http://localhost/admin/sales-channels/google_merchant/rebuild", {
        method: "POST",
      }),
    );
    const body = (await res.json()) as any;
    expect(body.statusCode).toBe(202);
    expect(body.data.jobId).toMatch(/^manual:google_merchant:/);
    expect(queueCalls).toHaveLength(1);
    expect(queueCalls[0]?.data).toEqual({ channelCode: "google_merchant", trigger: "manual" });
  });

  it("returns 404 for an unknown channel", async () => {
    const { app } = buildApp();
    const res = await app.handle(
      new Request("http://localhost/admin/sales-channels/nope/rebuild", { method: "POST" }),
    );
    expect(res.status).toBe(404);
  });
});
