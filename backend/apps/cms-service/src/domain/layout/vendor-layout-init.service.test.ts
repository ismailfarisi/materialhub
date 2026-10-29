import { describe, expect, test } from "bun:test";
import { VendorLayoutInitService } from "./vendor-layout-init.service.ts";

const buildTemplate = (overrides: Partial<any> = {}) => ({
  id: "tpl-1",
  vendor_id: null,
  slug: "vendor-default",
  title: { en: "Vendor Storefront Template", ar: "قالب متجر البائع" },
  published_version_id: "tpl-ver-1",
  draft_version_id: null,
  ...overrides,
});

const buildSection = (
  name: string,
  scope: "platform" | "vendor" | "both",
  overrides: any = {},
) => ({
  id: `tpl-sec-${name}`,
  version_id: "tpl-ver-1",
  section_type_id: `st-${name}`,
  section_type: { id: `st-${name}`, name, scope },
  position: overrides.position ?? 0,
  enabled: true,
  visibility: { mobile: true, web: true },
  targeting: null,
  settings: {},
  source_mode: "manual",
  blocks: [],
  data_source: null,
  bid_config: null,
  ...overrides,
});

function fakeEntityManager(opts: {
  template: any | null;
  templateSections: any[];
  saved: { layouts: any[]; versions: any[]; sections: any[] };
}) {
  const { template, templateSections, saved } = opts;
  let layoutCounter = 0;
  let versionCounter = 0;

  const qb = {
    innerJoinAndSelect: () => qb,
    where: () => qb,
    orderBy: () => qb,
    getMany: async () => templateSections,
  };

  return {
    getRepository: (entity: any) => {
      const entityName = (entity?.name ?? "").toLowerCase();
      if (entityName.includes("pagelayout") || entityName.includes("page_layout")) {
        return { findOne: async () => template };
      }
      if (entityName.includes("layoutsection") || entityName.includes("layout_section")) {
        return { createQueryBuilder: () => qb };
      }
      throw new Error(`Unexpected getRepository call for ${entityName}`);
    },
    create: (entity: any, data: any) => {
      const entityName = (entity?.name ?? "").toLowerCase();
      if (entityName.includes("pagelayout") || entityName.includes("page_layout")) {
        return { id: `new-layout-${++layoutCounter}`, ...data };
      }
      if (entityName.includes("layoutversion") || entityName.includes("layout_version")) {
        return { id: `new-version-${++versionCounter}`, ...data };
      }
      // LayoutSection
      return { id: `new-section-${saved.sections.length + 1}`, ...data };
    },
    save: async (entityOrArray: any) => {
      const items = Array.isArray(entityOrArray) ? entityOrArray : [entityOrArray];
      for (const item of items) {
        if (item.section_type_id !== undefined && item.position !== undefined) {
          saved.sections.push(item);
        } else if (item.version_number !== undefined) {
          saved.versions.push(item);
        } else if (item.slug !== undefined) {
          saved.layouts.push(item);
        }
      }
      return entityOrArray;
    },
  };
}

describe("VendorLayoutInitService.init", () => {
  test("returns existing layout id when vendor already has a storefront (idempotent)", async () => {
    const service = new VendorLayoutInitService();
    (service as any)._layoutRepo = {
      findOne: async () => ({
        id: "existing-layout-1",
        draft_version_id: "existing-draft-1",
        published_version_id: null,
      }),
    };

    const r = await service.init("vendor-1", "user-1");
    expect(r.layout_id).toBe("existing-layout-1");
    expect(r.draft_version_id).toBe("existing-draft-1");
  });

  test("clones template into a new vendor-owned draft on first call", async () => {
    const saved = { layouts: [] as any[], versions: [] as any[], sections: [] as any[] };
    const service = new VendorLayoutInitService();
    (service as any)._layoutRepo = { findOne: async () => null };
    (service as any)._runInTransaction = async (cb: any) =>
      cb(
        fakeEntityManager({
          template: buildTemplate(),
          templateSections: [
            buildSection("hero_carousel", "both", { position: 0 }),
            buildSection("product_carousel", "both", { position: 1 }),
          ],
          saved,
        }),
      );

    const r = await service.init("vendor-1", "user-1");
    expect(r.layout_id).toMatch(/^new-layout-/);
    expect(r.draft_version_id).toMatch(/^new-version-/);
    expect(saved.layouts).toHaveLength(2); // initial + draft_version_id update
    expect(saved.layouts[0].vendor_id).toBe("vendor-1");
    expect(saved.layouts[0].slug).toBe("vendor-storefront");
    expect(saved.layouts[0].created_by).toBe("user-1");
    expect(saved.versions).toHaveLength(1);
    expect(saved.versions[0].version_number).toBe(1);
    expect(saved.sections).toHaveLength(2);
  });

  test("throws LAYOUT_TEMPLATE_NOT_READY when admin template missing", async () => {
    const saved = { layouts: [] as any[], versions: [] as any[], sections: [] as any[] };
    const service = new VendorLayoutInitService();
    (service as any)._layoutRepo = { findOne: async () => null };
    (service as any)._runInTransaction = async (cb: any) =>
      cb(fakeEntityManager({ template: null, templateSections: [], saved }));

    await expect(service.init("vendor-1", "user-1")).rejects.toMatchObject({
      code: "LAYOUT_TEMPLATE_NOT_READY",
    });
  });

  test("drops platform-scope sections when cloning", async () => {
    const saved = { layouts: [] as any[], versions: [] as any[], sections: [] as any[] };
    const service = new VendorLayoutInitService();
    (service as any)._layoutRepo = { findOne: async () => null };
    (service as any)._runInTransaction = async (cb: any) =>
      cb(
        fakeEntityManager({
          template: buildTemplate(),
          templateSections: [
            buildSection("hero_carousel", "both", { position: 0 }),
            buildSection("vendor_showcase", "platform", { position: 1 }),
            buildSection("testimonials", "both", { position: 2 }),
          ],
          saved,
        }),
      );

    await service.init("vendor-1", "user-1");
    const clonedTypeIds = saved.sections.map((s) => s.section_type_id);
    expect(clonedTypeIds).toContain("st-hero_carousel");
    expect(clonedTypeIds).toContain("st-testimonials");
    expect(clonedTypeIds).not.toContain("st-vendor_showcase");
    // Positions should be re-numbered after dropping
    expect(saved.sections[0].position).toBe(0);
    expect(saved.sections[1].position).toBe(1);
  });

  test("nulls bid_config on cloned sections", async () => {
    const saved = { layouts: [] as any[], versions: [] as any[], sections: [] as any[] };
    const service = new VendorLayoutInitService();
    (service as any)._layoutRepo = { findOne: async () => null };
    (service as any)._runInTransaction = async (cb: any) =>
      cb(
        fakeEntityManager({
          template: buildTemplate(),
          templateSections: [
            buildSection("product_carousel", "both", {
              position: 0,
              source_mode: "bidded",
              bid_config: { slots: 4 },
            }),
          ],
          saved,
        }),
      );

    await service.init("vendor-1", "user-1");
    expect(saved.sections[0].bid_config).toBeNull();
  });
});
