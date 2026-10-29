import {
  AppDataSource,
  LayoutSection,
  LayoutStatus,
  LayoutVersion,
  PageLayout,
  type SectionType,
} from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";
import type { EntityManager } from "typeorm";
import { IsNull } from "typeorm";

export interface VendorLayoutInitResult {
  layout_id: string;
  draft_version_id: string;
}

export class VendorLayoutInitService {
  private _layoutRepo?: ReturnType<typeof AppDataSource.getRepository<PageLayout>>;
  private get layoutRepo() {
    return this._layoutRepo ?? AppDataSource.getRepository(PageLayout);
  }

  /**
   * Optional transaction runner for tests. Default: AppDataSource.transaction.
   * Tests substitute a mock that immediately invokes the callback with a fake EntityManager.
   */
  _runInTransaction: <T>(cb: (em: EntityManager) => Promise<T>) => Promise<T> = (cb) =>
    AppDataSource.transaction(cb);

  async init(vendorId: string, userId: string): Promise<VendorLayoutInitResult> {
    // Idempotency: return existing layout if found
    const existing = await this.layoutRepo.findOne({
      where: { vendor_id: vendorId, slug: "vendor-storefront" },
    });
    if (existing) {
      return {
        layout_id: existing.id,
        draft_version_id: existing.draft_version_id ?? existing.published_version_id ?? "",
      };
    }

    try {
      return await this._runInTransaction(async (em) => {
        const template = await em.getRepository(PageLayout).findOne({
          where: { vendor_id: IsNull(), slug: "vendor-default" },
        });
        if (!template?.published_version_id) {
          throw new HttpError(
            400,
            "Vendor storefront template is not published",
            "LAYOUT_TEMPLATE_NOT_READY",
          );
        }

        const tplSections = await em
          .getRepository(LayoutSection)
          .createQueryBuilder("ls")
          .innerJoinAndSelect("ls.section_type", "st")
          .where("ls.version_id = :v", { v: template.published_version_id })
          .orderBy("ls.position", "ASC")
          .getMany();

        const layout = em.create(PageLayout, {
          vendor_id: vendorId,
          slug: "vendor-storefront",
          title: template.title,
          status: LayoutStatus.draft,
          created_by: userId,
        });
        await em.save(layout);

        const version = em.create(LayoutVersion, {
          layout_id: layout.id,
          version_number: 1,
          created_by: userId,
        });
        await em.save(version);

        layout.draft_version_id = version.id;
        await em.save(layout);

        const cloned: LayoutSection[] = [];
        let position = 0;
        for (const ts of tplSections) {
          const scope = (ts.section_type as SectionType).scope ?? "platform";
          if (scope === "platform") continue;
          const ns = em.create(LayoutSection, {
            version_id: version.id,
            section_type_id: ts.section_type_id,
            position: position++,
            enabled: ts.enabled,
            visibility: ts.visibility,
            targeting: ts.targeting,
            settings: ts.settings,
            source_mode: ts.source_mode,
            data_source: ts.data_source,
            blocks: ts.blocks,
            bid_config: null,
          });
          cloned.push(ns);
        }
        if (cloned.length > 0) {
          await em.save(cloned);
        }

        return { layout_id: layout.id, draft_version_id: version.id };
      });
    } catch (err: any) {
      // Lost the race against another concurrent init for the same vendor.
      // The partial unique index (vendor_id, slug) WHERE vendor_id IS NOT NULL
      // surfaces as Postgres error code 23505. Re-fetch and return the existing layout.
      if (err?.code === "23505" || err?.driverError?.code === "23505") {
        const existing = await this.layoutRepo.findOne({
          where: { vendor_id: vendorId, slug: "vendor-storefront" },
        });
        if (existing) {
          return {
            layout_id: existing.id,
            draft_version_id: existing.draft_version_id ?? existing.published_version_id ?? "",
          };
        }
      }
      throw err;
    }
  }
}
