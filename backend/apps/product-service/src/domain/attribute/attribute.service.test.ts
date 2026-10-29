import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import {
  AppDataSource,
  Attribute,
  AttributeFilterInputType,
  AttributeTranslation,
  AttributeType,
  AttributeValue,
} from "@materialhub/database";
import { AttributeService } from "./attribute.service.ts";

function makeRepo<T extends object>(initialRows: T[] = []) {
  const rows = [...initialRows];
  return {
    rows,
    create: (data: Partial<T>) => data as T,
    save: async (row: T) => {
      rows.push(row);
      return row;
    },
    findOne: async ({ where }: { where: Partial<T> }) =>
      rows.find((row) =>
        Object.entries(where).every(
          ([key, value]) => (row as Record<string, unknown>)[key] === value,
        ),
      ) ?? null,
    find: async ({ where }: { where: Partial<T> }) =>
      rows.filter((row) =>
        Object.entries(where).every(([key, value]) => {
          const rowValue = (row as Record<string, unknown>)[key];
          if (value && typeof value === "object" && "_value" in value) {
            return (value._value as unknown[]).includes(rowValue);
          }
          return rowValue === value;
        }),
      ),
    remove: async (row: T) => {
      const index = rows.indexOf(row);
      if (index >= 0) rows.splice(index, 1);
      return row;
    },
  };
}

describe("AttributeService Arabic labels", () => {
  test("create() upserts ar_label into attribute translations", async () => {
    const service = new AttributeService();
    const attributeRepo = makeRepo<Partial<Attribute>>();
    const translationRepo = makeRepo<Partial<AttributeTranslation>>();
    const originalGetRepository = AppDataSource.getRepository.bind(AppDataSource);
    AppDataSource.getRepository = ((entity: unknown) => {
      if (entity === Attribute) {
        return {
          ...attributeRepo,
          save: async (row: Partial<Attribute>) => {
            const saved = { id: "attr-1", ...row };
            attributeRepo.rows.push(saved);
            return saved;
          },
        };
      }
      if (entity === AttributeTranslation) return translationRepo;
      return originalGetRepository(entity as never);
    }) as typeof AppDataSource.getRepository;

    try {
      await service.create({
        name: "Skin type",
        ar_label: "نوع البشرة",
        type: AttributeType.select,
      });

      expect(translationRepo.rows).toContainEqual({
        attribute_id: "attr-1",
        locale: "ar",
        name: "نوع البشرة",
      });
    } finally {
      AppDataSource.getRepository = originalGetRepository;
    }
  });

  test("update() replaces ar_label translation", async () => {
    const service = new AttributeService();
    const attributeRepo = makeRepo<Partial<Attribute>>([{ id: "attr-1", name: "Skin type" }]);
    const translationRepo = makeRepo<Partial<AttributeTranslation>>([
      { attribute_id: "attr-1", locale: "ar", name: "قديم" },
    ]);
    const originalGetRepository = AppDataSource.getRepository.bind(AppDataSource);
    AppDataSource.getRepository = ((entity: unknown) => {
      if (entity === Attribute) return attributeRepo;
      if (entity === AttributeTranslation) return translationRepo;
      return originalGetRepository(entity as never);
    }) as typeof AppDataSource.getRepository;

    try {
      await service.update("attr-1", { ar_label: "نوع البشرة" });

      expect(translationRepo.rows).toContainEqual({
        attribute_id: "attr-1",
        locale: "ar",
        name: "نوع البشرة",
        deleted_at: null,
      });
    } finally {
      AppDataSource.getRepository = originalGetRepository;
    }
  });

  test("list() returns ar_label from attribute translations", async () => {
    const service = new AttributeService();
    const attribute = { id: "attr-1", name: "Skin type" };
    const translationRepo = makeRepo<Partial<AttributeTranslation>>([
      { attribute_id: "attr-1", locale: "ar", name: "نوع البشرة" },
    ]);
    const originalGetRepository = AppDataSource.getRepository.bind(AppDataSource);
    AppDataSource.getRepository = ((entity: unknown) => {
      if (entity === Attribute) {
        const qb = {
          where: () => qb,
          orderBy: () => qb,
          addOrderBy: () => qb,
          skip: () => qb,
          take: () => qb,
          getManyAndCount: async () => [[attribute], 1],
        };
        return {
          createQueryBuilder: () => qb,
        };
      }
      if (entity === AttributeTranslation) return translationRepo;
      if (entity === AttributeValue) {
        const qb = {
          select: () => qb,
          addSelect: () => qb,
          where: () => qb,
          andWhere: () => qb,
          groupBy: () => qb,
          getRawMany: async () => [],
        };
        return {
          createQueryBuilder: () => qb,
        };
      }
      return originalGetRepository(entity as never);
    }) as typeof AppDataSource.getRepository;

    try {
      const result = await service.list();

      expect(result.data[0]).toMatchObject({
        ...attribute,
        ar_label: "نوع البشرة",
        value_count: 0,
      });
    } finally {
      AppDataSource.getRepository = originalGetRepository;
    }
  });
});

// These tests need a live Postgres. Skip in CI / environments without DB.
const hasDb = !!process.env.DATABASE_URL;
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb("AttributeService.filter_input_type", () => {
  const service = new AttributeService();

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
  });
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  });
  beforeEach(async () => {
    await AppDataSource.getRepository(Attribute)
      .createQueryBuilder()
      .delete()
      .where("slug LIKE :slug", { slug: "color-test%" })
      .execute();
  });

  test("create() persists filter_input_type when provided", async () => {
    const attr = await service.create({
      name: "Color Test",
      type: AttributeType.color,
      is_filterable: true,
      filter_input_type: AttributeFilterInputType.color_swatch,
    });
    expect(attr.filter_input_type).toBe(AttributeFilterInputType.color_swatch);
  });

  test("create() with is_filterable=false forces filter_input_type to null", async () => {
    const attr = await service.create({
      name: "Color Test",
      type: AttributeType.color,
      is_filterable: false,
      filter_input_type: AttributeFilterInputType.color_swatch,
    });
    expect(attr.filter_input_type).toBeNull();
  });

  test("update() can change filter_input_type independently", async () => {
    const attr = await service.create({
      name: "Color Test",
      type: AttributeType.color,
      is_filterable: true,
      filter_input_type: AttributeFilterInputType.color_swatch,
    });
    const updated = await service.update(attr.id, {
      filter_input_type: AttributeFilterInputType.checkbox,
    });
    expect(updated.filter_input_type).toBe(AttributeFilterInputType.checkbox);
  });

  test("update() setting is_filterable=false clears filter_input_type", async () => {
    const attr = await service.create({
      name: "Color Test",
      type: AttributeType.color,
      is_filterable: true,
      filter_input_type: AttributeFilterInputType.color_swatch,
    });
    const updated = await service.update(attr.id, { is_filterable: false });
    expect(updated.filter_input_type).toBeNull();
  });
});
