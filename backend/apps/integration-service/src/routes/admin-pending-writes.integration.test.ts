import { describe, expect, it, mock } from "bun:test";
import { Elysia, t } from "elysia";

const ok = (data: unknown, status = 200) => ({
  statusCode: status,
  data,
  timestamp: new Date().toISOString(),
});

function buildApp({
  user = { user_id: "u-admin", id: "u-admin", role: "admin" } as any,
  rows = [] as any[],
  approveDispatchStatus = 200,
} = {}) {
  const pendingWritesService = {
    list: mock(async (integrationId: string, status?: string) =>
      rows.filter((r) => r.integration_id === integrationId && (!status || r.status === status)),
    ),
    approve: mock(async (id: string, _adminId: string) => {
      const row = rows.find((r) => r.id === id);
      if (!row) throw new Error("not found");
      row.status = "approved";
      return row;
    }),
    reject: mock(async (id: string, _adminId: string) => {
      const row = rows.find((r) => r.id === id);
      if (!row) throw new Error("not found");
      row.status = "rejected";
      return row;
    }),
    markApplied: mock(async (id: string) => {
      const row = rows.find((r) => r.id === id);
      if (row) row.status = "applied";
    }),
  };
  const domainDispatch = {
    call: mock(async () => ({ status: approveDispatchStatus, body: "ok" })),
  };

  const app = new Elysia({ prefix: "/admin/integrations" })
    .decorate("pendingWritesService", pendingWritesService)
    .decorate("domainDispatch", domainDispatch)
    .derive(() => ({ user }))
    .get(
      "/:id/pending-writes",
      async ({ params, query, pendingWritesService }: any) => {
        const list = await pendingWritesService.list(params.id, query.status);
        return ok(list);
      },
      {
        params: t.Object({ id: t.String() }),
        query: t.Object({ status: t.Optional(t.String()) }),
      },
    )
    .post(
      "/pending-writes/:id/approve",
      async ({ params, user, pendingWritesService, domainDispatch, set }: any) => {
        const row = await pendingWritesService.approve(params.id, user.user_id ?? user.id);
        const r = await domainDispatch.call({
          eventType: row.kind,
          vendorId: row.payload?.vendor_id ?? "",
          payload: row.payload,
        });
        if (r.status >= 200 && r.status < 300) {
          await pendingWritesService.markApplied(params.id);
          return ok({ id: row.id, applied: true });
        }
        set.status = 502;
        return { statusCode: 502, error: "DOMAIN_FAILED", message: r.body };
      },
      { params: t.Object({ id: t.String() }) },
    )
    .post(
      "/pending-writes/:id/reject",
      async ({ params, user, pendingWritesService }: any) => {
        const row = await pendingWritesService.reject(params.id, user.user_id ?? user.id);
        return ok({ id: row.id, status: row.status });
      },
      { params: t.Object({ id: t.String() }) },
    );

  return { app, pendingWritesService, domainDispatch };
}

describe("GET /admin/integrations/:id/pending-writes", () => {
  it("returns rows for the integration", async () => {
    const { app } = buildApp({
      rows: [
        {
          id: "pw1",
          integration_id: "i1",
          status: "pending",
          kind: "inventory.adjust",
          payload: { delta: 5 },
        },
        {
          id: "pw2",
          integration_id: "other",
          status: "pending",
          kind: "inventory.adjust",
          payload: {},
        },
      ],
    });
    const res = await app.handle(
      new Request("http://localhost/admin/integrations/i1/pending-writes"),
    );
    const body = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(body.data.map((r: any) => r.id)).toEqual(["pw1"]);
  });
});

describe("POST /admin/integrations/pending-writes/:id/approve", () => {
  it("approves and dispatches successfully", async () => {
    const { app, pendingWritesService, domainDispatch } = buildApp({
      rows: [
        {
          id: "pw1",
          integration_id: "i1",
          status: "pending",
          kind: "inventory.adjust",
          payload: { vendor_id: "v1", delta: 5 },
        },
      ],
      approveDispatchStatus: 200,
    });
    const res = await app.handle(
      new Request("http://localhost/admin/integrations/pending-writes/pw1/approve", {
        method: "POST",
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.applied).toBe(true);
    expect(domainDispatch.call).toHaveBeenCalled();
    expect(pendingWritesService.markApplied).toHaveBeenCalledWith("pw1");
  });

  it("returns 502 when dispatch fails", async () => {
    const { app } = buildApp({
      rows: [
        {
          id: "pw1",
          integration_id: "i1",
          status: "pending",
          kind: "inventory.adjust",
          payload: { vendor_id: "v1", delta: 5 },
        },
      ],
      approveDispatchStatus: 500,
    });
    const res = await app.handle(
      new Request("http://localhost/admin/integrations/pending-writes/pw1/approve", {
        method: "POST",
      }),
    );
    expect(res.status).toBe(502);
  });
});

describe("POST /admin/integrations/pending-writes/:id/reject", () => {
  it("rejects without dispatching", async () => {
    const { app, domainDispatch } = buildApp({
      rows: [
        {
          id: "pw1",
          integration_id: "i1",
          status: "pending",
          kind: "inventory.adjust",
          payload: {},
        },
      ],
    });
    const res = await app.handle(
      new Request("http://localhost/admin/integrations/pending-writes/pw1/reject", {
        method: "POST",
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.status).toBe("rejected");
    expect(domainDispatch.call).not.toHaveBeenCalled();
  });
});
