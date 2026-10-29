import { describe, expect, mock, test } from "bun:test";
import {
  type AccessJwtSigner,
  __setDataSourceForTests,
  loadActiveMemberships,
  signAccessToken,
} from "./token-helpers.ts";

function fakeJwt(): AccessJwtSigner & { lastPayload: unknown } {
  const j = {
    lastPayload: undefined as unknown,
    sign: mock((p: unknown) => {
      j.lastPayload = p;
      return Promise.resolve("signed-token");
    }),
  };
  return j as AccessJwtSigner & { lastPayload: unknown };
}

describe("signAccessToken", () => {
  test("emits sub/email/role/tv/vm", async () => {
    __setDataSourceForTests({
      query: mock(() => Promise.resolve([])),
    } as unknown as never);
    const j = fakeJwt();
    const tok = await signAccessToken(j, {
      id: "user-1",
      email: "a@x.com",
      role: "customer",
      token_version: 3,
      memberships: [{ vid: "vendor-1", r: "owner" }],
    });
    expect(tok).toBe("signed-token");
    expect(j.lastPayload).toEqual({
      sub: "user-1",
      email: "a@x.com",
      role: "customer",
      tv: 3,
      vm: [{ vid: "vendor-1", r: "owner" }],
    });
  });

  test("omits vm when no memberships", async () => {
    const j = fakeJwt();
    await signAccessToken(j, {
      id: "user-2",
      email: "b@x.com",
      role: "customer",
      token_version: 1,
      memberships: [],
    });
    expect(j.lastPayload).toEqual({
      sub: "user-2",
      email: "b@x.com",
      role: "customer",
      tv: 1,
    });
  });
});

describe("loadActiveMemberships", () => {
  test("returns array of {vid, r} from DB", async () => {
    const ds = {
      query: mock(() =>
        Promise.resolve([
          { vendor_id: "v-1", role: "owner" },
          { vendor_id: "v-2", role: "staff" },
        ]),
      ),
    };
    __setDataSourceForTests(ds as unknown as never);
    const out = await loadActiveMemberships("user-1");
    expect(out).toEqual([
      { vid: "v-1", r: "owner" },
      { vid: "v-2", r: "staff" },
    ]);
  });

  test("returns empty array when user has no memberships", async () => {
    __setDataSourceForTests({
      query: mock(() => Promise.resolve([])),
    } as unknown as never);
    const out = await loadActiveMemberships("nobody");
    expect(out).toEqual([]);
  });
});
