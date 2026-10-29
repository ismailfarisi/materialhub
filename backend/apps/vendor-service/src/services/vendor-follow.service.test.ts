import { describe, expect, test } from "bun:test";
import { VendorFollowService } from "./vendor-follow.service.ts";

const VENDOR_ID = "00000000-0000-0000-0000-0000000000a1";
const USER_ID = "00000000-0000-0000-0000-0000000000b1";

type RepoFindArgs = {
  where?: any;
  relations?: any;
  order?: any;
  take?: any;
};

type IncrementCall = {
  criteria: any;
  property: string;
  value: number;
};

function buildService(opts: {
  findOne?: (args: RepoFindArgs) => any | null;
  find?: (args: RepoFindArgs) => any[];
}) {
  const service = new VendorFollowService();
  const findOneCalls: RepoFindArgs[] = [];
  const findCalls: RepoFindArgs[] = [];
  const insertCalls: any[] = [];
  const deleteCalls: any[] = [];
  const incrementCalls: IncrementCall[] = [];
  const decrementCalls: IncrementCall[] = [];

  Object.defineProperty(service, "repo", {
    get: () => ({
      findOne: async (args: RepoFindArgs) => {
        findOneCalls.push(args);
        return opts.findOne ? opts.findOne(args) : null;
      },
      find: async (args: RepoFindArgs) => {
        findCalls.push(args);
        return opts.find ? opts.find(args) : [];
      },
      insert: async (row: any) => {
        insertCalls.push(row);
        return { identifiers: [{ id: "new-id" }] };
      },
      delete: async (criteria: any) => {
        deleteCalls.push(criteria);
        return { affected: 1 };
      },
    }),
  });

  Object.defineProperty(service, "vendorRepo", {
    get: () => ({
      increment: async (criteria: any, property: string, value: number) => {
        incrementCalls.push({ criteria, property, value });
        return { affected: 1 };
      },
      decrement: async (criteria: any, property: string, value: number) => {
        decrementCalls.push({ criteria, property, value });
        return { affected: 1 };
      },
    }),
  });

  return {
    service,
    findOneCalls,
    findCalls,
    insertCalls,
    deleteCalls,
    incrementCalls,
    decrementCalls,
  };
}

describe("VendorFollowService.follow", () => {
  test("inserts a row and atomically increments follower_count when no existing row", async () => {
    const { service, insertCalls, incrementCalls } = buildService({
      findOne: () => null,
    });

    const result = await service.follow(VENDOR_ID, USER_ID);

    expect(result).toEqual({ followed: true });
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]).toEqual({ vendor_id: VENDOR_ID, user_id: USER_ID });
    expect(incrementCalls).toHaveLength(1);
    expect(incrementCalls[0]).toEqual({
      criteria: { id: VENDOR_ID },
      property: "follower_count",
      value: 1,
    });
  });

  test("is a no-op (no insert, no increment) when an existing row is present", async () => {
    const { service, insertCalls, incrementCalls } = buildService({
      findOne: () => ({ id: "existing", vendor_id: VENDOR_ID, user_id: USER_ID }),
    });

    const result = await service.follow(VENDOR_ID, USER_ID);

    expect(result).toEqual({ followed: true });
    expect(insertCalls).toHaveLength(0);
    expect(incrementCalls).toHaveLength(0);
  });
});

describe("VendorFollowService.unfollow", () => {
  test("deletes the row and atomically decrements follower_count when row exists", async () => {
    const { service, deleteCalls, decrementCalls } = buildService({
      findOne: () => ({ id: "existing", vendor_id: VENDOR_ID, user_id: USER_ID }),
    });

    const result = await service.unfollow(VENDOR_ID, USER_ID);

    expect(result).toEqual({ followed: false });
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0]).toEqual({ vendor_id: VENDOR_ID, user_id: USER_ID });
    expect(decrementCalls).toHaveLength(1);
    expect(decrementCalls[0]).toEqual({
      criteria: { id: VENDOR_ID },
      property: "follower_count",
      value: 1,
    });
  });

  test("is a no-op (no delete, no decrement) when no row exists", async () => {
    const { service, deleteCalls, decrementCalls } = buildService({
      findOne: () => null,
    });

    const result = await service.unfollow(VENDOR_ID, USER_ID);

    expect(result).toEqual({ followed: false });
    expect(deleteCalls).toHaveLength(0);
    expect(decrementCalls).toHaveLength(0);
  });
});

describe("VendorFollowService.isFollowing", () => {
  test("returns true when a row exists", async () => {
    const { service } = buildService({
      findOne: () => ({ id: "existing" }),
    });
    expect(await service.isFollowing(VENDOR_ID, USER_ID)).toBe(true);
  });

  test("returns false when no row exists", async () => {
    const { service } = buildService({
      findOne: () => null,
    });
    expect(await service.isFollowing(VENDOR_ID, USER_ID)).toBe(false);
  });
});

describe("VendorFollowService.recentFollowed", () => {
  test("calls repo with relations:[vendor], order:{followed_at:DESC}, take:limit", async () => {
    const { service, findCalls } = buildService({
      find: () => [],
    });

    await service.recentFollowed(USER_ID, 7);

    expect(findCalls).toHaveLength(1);
    const call = findCalls[0]!;
    expect(call.where).toEqual({ user_id: USER_ID });
    expect(call.relations).toEqual(["vendor"]);
    expect(call.order).toEqual({ followed_at: "DESC" });
    expect(call.take).toBe(7);
  });

  test("uses default limit of 4 when not specified", async () => {
    const { service, findCalls } = buildService({
      find: () => [],
    });
    await service.recentFollowed(USER_ID);
    expect(findCalls[0]!.take).toBe(4);
  });

  test("maps vendor rows to flat shape with parsed rating_avg and city location", async () => {
    const { service } = buildService({
      find: () => [
        {
          followed_at: new Date("2026-05-01"),
          vendor: {
            id: "v1",
            name: "Brand One",
            slug: "brand-one",
            logo_url: "https://cdn/x.jpg",
            rating_avg: "4.7",
            follower_count: 1234,
            address: { city: "Dubai", country: "AE" },
          },
        },
        {
          followed_at: new Date("2026-04-30"),
          vendor: {
            id: "v2",
            name: "Brand Two",
            slug: "brand-two",
            logo_url: null,
            rating_avg: 4.2,
            follower_count: 56,
            address: null,
          },
        },
      ],
    });

    const result = await service.recentFollowed(USER_ID, 4);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: "v1",
      name: "Brand One",
      slug: "brand-one",
      logo_url: "https://cdn/x.jpg",
      rating_avg: 4.7,
      follower_count: 1234,
      location: "Dubai",
      product_count: null,
    });
    expect(result[1]).toEqual({
      id: "v2",
      name: "Brand Two",
      slug: "brand-two",
      logo_url: null,
      rating_avg: 4.2,
      follower_count: 56,
      location: null,
      product_count: null,
    });
  });

  test("filters out rows with missing vendor relation", async () => {
    const { service } = buildService({
      find: () => [
        { followed_at: new Date(), vendor: null },
        {
          followed_at: new Date(),
          vendor: {
            id: "v1",
            name: "Brand One",
            slug: "brand-one",
            logo_url: null,
            rating_avg: 4.5,
            follower_count: 0,
            address: null,
          },
        },
      ],
    });

    const result = await service.recentFollowed(USER_ID, 4);
    expect(result).toHaveLength(1);
    expect((result[0] as any).id).toBe("v1");
  });
});
