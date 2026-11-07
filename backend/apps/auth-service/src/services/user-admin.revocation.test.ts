import { describe, expect, mock, test } from "bun:test";

const bumped: string[] = [];
mock.module("@materialhub/guards", () => ({
  bumpTokenVersion: mock(async (id: string) => {
    bumped.push(id);
    return 2;
  }),
}));

const { UserAdminService } = await import("./user-admin.service.ts");

function build(user: any) {
  const sessionUpdates: any[] = [];
  const repo: any = {
    findOne: mock(async () => user),
    save: mock(async (u: any) => u),
    manager: {
      getRepository: () => ({
        update: mock(async (where: any, set: any) => {
          sessionUpdates.push({ where, set });
        }),
      }),
    },
  };
  return { svc: new UserAdminService(repo), sessionUpdates };
}

describe("UserAdminService revokes live sessions", () => {
  test("suspending revokes refresh sessions and bumps the token version", async () => {
    bumped.length = 0;
    const { svc, sessionUpdates } = build({ id: "u1", status: "active", role: "customer" });
    await svc.updateStatus("u1", "suspended");
    expect(bumped).toEqual(["u1"]);
    expect(sessionUpdates[0]?.set).toEqual({ is_revoked: true });
  });

  test("demoting an admin bumps the token version", async () => {
    bumped.length = 0;
    const { svc } = build({ id: "u2", status: "active", role: "admin" });
    await svc.updateRole("u2", "customer");
    expect(bumped).toEqual(["u2"]);
  });

  test("a no-op change revokes nothing", async () => {
    bumped.length = 0;
    const { svc, sessionUpdates } = build({ id: "u3", status: "active", role: "admin" });
    await svc.updateStatus("u3", "active");
    await svc.updateRole("u3", "admin");
    expect(bumped).toEqual([]);
    expect(sessionUpdates).toEqual([]);
  });
});
