import { describe, expect, test } from "bun:test";
import type { EntityManager } from "typeorm";
import { type GroupLink, linkProductGroups } from "../catalog-import.group-link.ts";

interface GroupRow {
  id?: string;
  vendor_id: string;
  name: string;
  grouping_attribute_id: string;
  listing_mode: string;
}

interface MemberRow {
  id?: string;
  group_id: string;
  product_id: string;
  attribute_value_id: string;
  is_primary: boolean;
  sort_order: number;
}

interface FindOneOptions {
  where: Partial<GroupRow & MemberRow>;
}

interface TestState {
  groups: GroupRow[];
  members: MemberRow[];
}

function mkManager(state: TestState): EntityManager {
  return {
    getRepository: (entity: unknown) => {
      const name =
        typeof entity === "string"
          ? entity
          : typeof entity === "function"
            ? entity.name
            : undefined;
      if (name === "ProductGroup") {
        return {
          findOne: async (opts: FindOneOptions) =>
            state.groups.find(
              (g) => g.vendor_id === opts.where.vendor_id && g.name === opts.where.name,
            ) ?? null,
          create: (row: GroupRow) => row,
          save: async (row: GroupRow) => {
            row.id = row.id ?? `grp-${state.groups.length + 1}`;
            state.groups.push(row);
            return row;
          },
        };
      }

      return {
        findOne: async (opts: FindOneOptions) =>
          state.members.find(
            (m) => m.group_id === opts.where.group_id && m.product_id === opts.where.product_id,
          ) ?? null,
        find: async (opts: FindOneOptions) =>
          state.members.filter((m) => m.group_id === opts.where.group_id),
        create: (row: MemberRow) => row,
        save: async (row: MemberRow) => {
          const existing = state.members.find((m) => row.id && m.id === row.id);
          if (existing) Object.assign(existing, row);
          else {
            row.id = row.id ?? `mem-${state.members.length + 1}`;
            state.members.push(row);
          }
          return row;
        },
      };
    },
  } as EntityManager;
}

const links: GroupLink[] = [
  {
    productId: "p-red",
    groupName: "Velvet",
    groupingAttributeId: "a-color",
    attributeValueId: "av-red",
    rowNumber: 1,
  },
  {
    productId: "p-pink",
    groupName: "Velvet",
    groupingAttributeId: "a-color",
    attributeValueId: "av-pink",
    rowNumber: 2,
  },
];

describe("linkProductGroups", () => {
  test("creates one group, two members, first is primary, returns affected product ids", async () => {
    const state: TestState = { groups: [], members: [] };
    const affected = await linkProductGroups(mkManager(state), "v-1", links);

    expect(state.groups).toHaveLength(1);
    expect(state.groups[0]).toMatchObject({
      vendor_id: "v-1",
      name: "Velvet",
      grouping_attribute_id: "a-color",
      listing_mode: "collapsed",
    });
    expect(state.members).toHaveLength(2);
    expect(state.members.filter((m) => m.is_primary)).toHaveLength(1);
    expect(state.members.find((m) => m.is_primary)?.product_id).toBe("p-red");
    expect(affected.sort()).toEqual(["p-pink", "p-red"]);
  });

  test("idempotent: re-run reuses the group, no duplicate members, keeps primary", async () => {
    const state: TestState = { groups: [], members: [] };

    await linkProductGroups(mkManager(state), "v-1", links);
    await linkProductGroups(mkManager(state), "v-1", links);

    expect(state.groups).toHaveLength(1);
    expect(state.members).toHaveLength(2);
    expect(state.members.filter((m) => m.is_primary)).toHaveLength(1);
  });
});
