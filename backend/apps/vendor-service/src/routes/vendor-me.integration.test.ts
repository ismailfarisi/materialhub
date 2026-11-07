/**
 * Route wiring for GET /vendors/me and PATCH /vendors/me/settings.
 * GET /vendors/me is a read: any member role may load its own store profile
 * (it used to require vendor.profile.write). Settings writes still need
 * vendor.profile.write and now accept the store name and processing time.
 */
import { beforeAll, describe, expect, mock, test } from "bun:test";
import { createHmac } from "node:crypto";
import { config } from "@materialhub/config";
import { permissionMatrix } from "@materialhub/guards";
import { Elysia } from "elysia";

const calls: { getById: string[]; updateSettings: unknown[] } = { getById: [], updateSettings: [] };
const vendorControllerStub = {
  async getById(id: string) {
    calls.getById.push(id);
    return { id, name: "E2E fix Al Quoz Boards" };
  },
  async updateSettings(id: string, body: unknown) {
    calls.updateSettings.push({ id, body });
    return { id, ...(body as object) };
  },
};

mock.module(`${import.meta.dir}/../container.ts`, () => ({
  container: new Elysia({ name: "vendor-service-container" }).decorate(
    "vendorController",
    vendorControllerStub,
  ),
}));

const { vendorRoutes } = await import("./vendor.routes.ts");

const b64url = (b: Buffer | string) =>
  (typeof b === "string" ? Buffer.from(b) : b)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

function token(role: "owner" | "manager" | "staff" | "viewer"): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(
    JSON.stringify({
      sub: `u-${role}`,
      email: `${role}@e2efix.example`,
      role: "customer",
      vm: [{ vid: "v-1", r: role }],
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  );
  const sig = b64url(
    createHmac("sha256", config.jwt.accessSecret).update(`${header}.${body}`).digest(),
  );
  return `${header}.${body}.${sig}`;
}

// biome-ignore lint/suspicious/noExplicitAny: Elysia generic chain in tests
const app: any = new Elysia().use(vendorRoutes as any);

beforeAll(() => {
  // The seeded matrix: viewer has no vendor.profile.write but has read permissions.
  permissionMatrix.__setMapForTests([
    { role: "owner", permission: "vendor.profile.write" },
    { role: "owner", permission: "team.read" },
    { role: "viewer", permission: "team.read" },
    { role: "viewer", permission: "orders.read" },
  ]);
});

describe("GET /vendors/me", () => {
  test("a viewer can read the store profile", async () => {
    calls.getById.length = 0;
    const res = await app.handle(
      new Request("http://localhost/vendors/me", {
        headers: { authorization: `Bearer ${token("viewer")}` },
      }),
    );
    expect(res.status).toBe(200);
    expect(calls.getById).toEqual(["v-1"]);
  });
});

describe("PATCH /vendors/me/settings", () => {
  test("owner can save name and processing time", async () => {
    calls.updateSettings.length = 0;
    const res = await app.handle(
      new Request("http://localhost/vendors/me/settings", {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${token("owner")}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ name: "E2E fix Al Quoz Board & Paper", processing_time_days: 4 }),
      }),
    );
    expect(res.status).toBe(200);
    expect(calls.updateSettings).toEqual([
      { id: "v-1", body: { name: "E2E fix Al Quoz Board & Paper", processing_time_days: 4 } },
    ]);
  });

  test("viewer cannot change settings", async () => {
    const res = await app.handle(
      new Request("http://localhost/vendors/me/settings", {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${token("viewer")}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ name: "Nope" }),
      }),
    );
    expect(res.status).toBe(403);
  });
});
