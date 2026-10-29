import { describe, expect, mock, test } from "bun:test";
import {
  __setDataSourceForTests,
  __setRedisForTests,
  bumpTokenVersion,
  getCurrentTokenVersion,
} from "./token-version.ts";

function makeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    isOpen: true,
    get: mock((k: string) => Promise.resolve(store.get(k) ?? null)),
    set: mock((k: string, v: string, _opts?: unknown) => {
      store.set(k, v);
      return Promise.resolve("OK");
    }),
  };
}

function makeDS(rows: Array<{ token_version: number }>) {
  return {
    query: mock((_sql: string, _params: unknown[]) => Promise.resolve(rows)),
  };
}

describe("token-version", () => {
  test("getCurrentTokenVersion returns Redis cached value when present", async () => {
    const redis = makeRedis();
    redis.store.set("user:abc:tv", "5");
    const ds = makeDS([{ token_version: 99 }]);
    __setRedisForTests(redis as unknown as never);
    __setDataSourceForTests(ds as unknown as never);
    const v = await getCurrentTokenVersion("abc");
    expect(v).toBe(5);
    expect(ds.query).not.toHaveBeenCalled();
  });

  test("getCurrentTokenVersion falls back to DB and populates Redis on miss", async () => {
    const redis = makeRedis();
    const ds = makeDS([{ token_version: 7 }]);
    __setRedisForTests(redis as unknown as never);
    __setDataSourceForTests(ds as unknown as never);
    const v = await getCurrentTokenVersion("xyz");
    expect(v).toBe(7);
    expect(redis.store.get("user:xyz:tv")).toBe("7");
  });

  test("getCurrentTokenVersion returns null when user missing", async () => {
    const redis = makeRedis();
    const ds = makeDS([]);
    __setRedisForTests(redis as unknown as never);
    __setDataSourceForTests(ds as unknown as never);
    const v = await getCurrentTokenVersion("nobody");
    expect(v).toBeNull();
  });

  test("bumpTokenVersion increments DB and updates Redis", async () => {
    const redis = makeRedis();
    const ds = {
      query: mock((sql: string, _params: unknown[]) => {
        if (sql.includes("UPDATE users")) return Promise.resolve([[{ token_version: 12 }]]);
        return Promise.resolve([{ token_version: 12 }]);
      }),
    };
    __setRedisForTests(redis as unknown as never);
    __setDataSourceForTests(ds as unknown as never);
    const next = await bumpTokenVersion("abc");
    expect(next).toBe(12);
    expect(redis.store.get("user:abc:tv")).toBe("12");
  });
});
