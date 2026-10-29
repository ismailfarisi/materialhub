import {
  AppDataSource,
  LayoutSection,
  LayoutStatus,
  LayoutVersion,
  PageLayout,
  SectionType,
} from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";
import { type EntityManager, IsNull } from "typeorm";
import type { BidService } from "../bid/bid.service.ts";

export class LayoutService {
  constructor(private readonly bidService: BidService) {}

  private get layoutRepo() {
    return AppDataSource.getRepository(PageLayout);
  }
  private get versionRepo() {
    return AppDataSource.getRepository(LayoutVersion);
  }
  private get sectionRepo() {
    return AppDataSource.getRepository(LayoutSection);
  }

  /**
   * Resolve the draft version id for a layout, auto-creating one from the
   * published version if the layout has only `published_version_id` set.
   * This makes seeded / freshly-published layouts editable without an explicit
   * "Create Draft" step (see issue #64).
   *
   * Auto-created drafts use `layout.created_by` as the version's `created_by`
   * since the original write-time actor isn't tracked at this depth — close
   * enough for audit purposes.
   */
  private async ensureDraft(em: EntityManager, layoutId: string): Promise<string> {
    const layoutRepo = em.getRepository(PageLayout);
    const layout = await layoutRepo.findOne({ where: { id: layoutId } });
    if (!layout) throw new HttpError(404, "Layout not found", "LAYOUT_NOT_FOUND");
    if (layout.draft_version_id) return layout.draft_version_id;
    if (!layout.published_version_id) {
      throw new HttpError(400, "Layout has no draft or published version to edit", "NO_VERSION");
    }

    const lastVersion = await em.findOne(LayoutVersion, {
      where: { layout_id: layoutId },
      order: { version_number: "DESC" },
    });
    const newVersion = em.create(LayoutVersion, {
      layout_id: layoutId,
      version_number: (lastVersion?.version_number ?? 0) + 1,
      created_by: layout.created_by,
    });
    await em.save(newVersion);

    const publishedSections = await em.find(LayoutSection, {
      where: { version_id: layout.published_version_id },
    });
    if (publishedSections.length > 0) {
      const clones = publishedSections.map((s) =>
        em.create(LayoutSection, {
          version_id: newVersion.id,
          section_type_id: s.section_type_id,
          position: s.position,
          enabled: s.enabled,
          visibility: s.visibility,
          targeting: s.targeting,
          settings: s.settings,
          source_mode: s.source_mode,
          data_source: s.data_source,
          blocks: s.blocks,
          bid_config: s.bid_config,
        }),
      );
      await em.save(clones);
    }

    layout.draft_version_id = newVersion.id;
    await em.save(layout);
    return newVersion.id;
  }

  private async assertVendorAllowedSection(
    sectionTypeId: string | undefined,
    sourceMode: string | undefined,
  ): Promise<void> {
    if (sourceMode === "bidded") {
      throw new HttpError(
        400,
        "Bidded source mode is not allowed on vendor layouts",
        "SOURCE_MODE_FORBIDDEN",
      );
    }
    if (!sectionTypeId) return;
    const st = await AppDataSource.getRepository(SectionType).findOne({
      where: { id: sectionTypeId },
    });
    if (!st) throw new HttpError(404, "Section type not found", "SECTION_TYPE_NOT_FOUND");
    const scope = (st as any).scope ?? "platform";
    if (scope === "platform") {
      throw new HttpError(
        400,
        "Section type is not vendor-scoped",
        "SECTION_TYPE_NOT_VENDOR_SCOPED",
      );
    }
  }

  // ─── Layout CRUD ─────────────────────────────────────────────────────────

  async list(query: {
    status?: string;
    page?: number;
    limit?: number;
    vendor_id?: string | "null";
  }) {
    const { page = 1, limit = 20, status, vendor_id } = query;
    const where: any = {};
    if (status) where.status = status;
    if (vendor_id === "null") where.vendor_id = IsNull();
    else if (vendor_id) where.vendor_id = vendor_id;

    // Project vendor name/slug so the admin list can show "Acme Store" instead
    // of a UUID slice. Only the join columns we render — not the full vendor.
    const qb = this.layoutRepo
      .createQueryBuilder("l")
      .leftJoin("l.vendor", "v")
      .addSelect(["v.id", "v.name", "v.slug"])
      .orderBy("l.updated_at", "DESC")
      .skip((page - 1) * limit)
      .take(limit);
    if (status) qb.andWhere("l.status = :status", { status });
    if (vendor_id === "null") qb.andWhere("l.vendor_id IS NULL");
    else if (vendor_id) qb.andWhere("l.vendor_id = :vid", { vid: vendor_id });

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async getById(id: string) {
    // First fetch — used both to verify existence and to decide whether to
    // ensureDraft. We re-fetch after ensureDraft to pick up the new
    // draft_version_id with relations populated.
    const initial = await this.layoutRepo.findOne({ where: { id } });
    if (!initial) throw new HttpError(404, "Layout not found", "LAYOUT_NOT_FOUND");

    // If the layout has only a published version (no draft), auto-create a
    // draft cloned from it. getById is only called by editor surfaces (admin
    // panel, vendor dashboard) — the public resolver bypasses this method —
    // so creating a draft here is acceptable and matches editor intent.
    if (!initial.draft_version_id && initial.published_version_id) {
      await AppDataSource.transaction((em) => this.ensureDraft(em, id));
    }

    const layout = await this.layoutRepo.findOne({
      where: { id },
      relations: ["draft_version", "published_version"],
    });
    if (!layout) throw new HttpError(404, "Layout not found", "LAYOUT_NOT_FOUND");

    let sections: LayoutSection[] = [];
    if (layout.draft_version_id) {
      sections = await this.sectionRepo.find({
        where: { version_id: layout.draft_version_id },
        relations: ["section_type"],
        order: { position: "ASC" },
      });
    }

    return { ...layout, sections };
  }

  async create(data: { slug: string; title: Record<string, string> }, userId: string) {
    const existing = await this.layoutRepo.findOne({
      where: { slug: data.slug },
    });
    if (existing) throw new HttpError(409, "Layout slug already exists", "DUPLICATE_LAYOUT_SLUG");

    return AppDataSource.transaction(async (em) => {
      const layout = em.create(PageLayout, {
        slug: data.slug,
        title: data.title,
        created_by: userId,
        status: LayoutStatus.draft,
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

      return layout;
    });
  }

  async update(
    id: string,
    data: { slug?: string; title?: Record<string, string>; suspend?: boolean },
  ) {
    const layout = await this.layoutRepo.findOne({ where: { id } });
    if (!layout) throw new HttpError(404, "Layout not found", "LAYOUT_NOT_FOUND");

    if (data.slug && data.slug !== layout.slug) {
      const dup = await this.layoutRepo.findOne({ where: { slug: data.slug } });
      if (dup) throw new HttpError(409, "Layout slug already exists", "DUPLICATE_LAYOUT_SLUG");
    }

    if (data.suspend === true) {
      layout.status = LayoutStatus.archived;
      layout.published_version_id = null;
    }

    if (data.slug !== undefined) layout.slug = data.slug;
    if (data.title !== undefined) layout.title = data.title;

    return this.layoutRepo.save(layout);
  }

  async remove(id: string) {
    const layout = await this.layoutRepo.findOne({ where: { id } });
    if (!layout) throw new HttpError(404, "Layout not found", "LAYOUT_NOT_FOUND");

    await AppDataSource.transaction(async (em) => {
      await this.bidService.cancelBidsForLayout(em, id);
      await em.softRemove(layout);
    });
  }

  // ─── Versioning ──────────────────────────────────────────────────────────

  async listVersions(layoutId: string) {
    return this.versionRepo.find({
      where: { layout_id: layoutId },
      order: { version_number: "DESC" },
    });
  }

  async createVersion(layoutId: string, userId: string) {
    const layout = await this.layoutRepo.findOne({ where: { id: layoutId } });
    if (!layout) throw new HttpError(404, "Layout not found", "LAYOUT_NOT_FOUND");

    return AppDataSource.transaction(async (em) => {
      const lastVersion = await em.findOne(LayoutVersion, {
        where: { layout_id: layoutId },
        order: { version_number: "DESC" },
      });

      const newVersionNumber = (lastVersion?.version_number ?? 0) + 1;

      const newVersion = em.create(LayoutVersion, {
        layout_id: layoutId,
        version_number: newVersionNumber,
        created_by: userId,
      });
      await em.save(newVersion);

      // Clone sections from current draft
      if (layout.draft_version_id) {
        const sections = await em.find(LayoutSection, {
          where: { version_id: layout.draft_version_id },
        });
        for (const s of sections) {
          const clone = em.create(LayoutSection, {
            version_id: newVersion.id,
            section_type_id: s.section_type_id,
            position: s.position,
            enabled: s.enabled,
            visibility: s.visibility,
            targeting: s.targeting,
            settings: s.settings,
            source_mode: s.source_mode,
            data_source: s.data_source,
            blocks: s.blocks,
            bid_config: s.bid_config,
          });
          await em.save(clone);
        }
      }

      layout.draft_version_id = newVersion.id;
      await em.save(layout);

      return newVersion;
    });
  }

  async publish(layoutId: string) {
    const layout = await this.layoutRepo.findOne({ where: { id: layoutId } });
    if (!layout) throw new HttpError(404, "Layout not found", "LAYOUT_NOT_FOUND");
    if (!layout.draft_version_id)
      throw new HttpError(400, "No draft version to publish", "NO_DRAFT");

    const version = await this.versionRepo.findOne({
      where: { id: layout.draft_version_id },
    });
    if (!version) throw new HttpError(404, "Draft version not found", "VERSION_NOT_FOUND");

    version.published_at = new Date();
    await this.versionRepo.save(version);

    layout.published_version_id = version.id;
    layout.status = LayoutStatus.published;
    return this.layoutRepo.save(layout);
  }

  async schedule(layoutId: string, publishAt: string) {
    const layout = await this.layoutRepo.findOne({ where: { id: layoutId } });
    if (!layout) throw new HttpError(404, "Layout not found", "LAYOUT_NOT_FOUND");
    if (!layout.draft_version_id)
      throw new HttpError(400, "No draft version to schedule", "NO_DRAFT");

    const version = await this.versionRepo.findOne({
      where: { id: layout.draft_version_id },
    });
    if (!version) throw new HttpError(404, "Draft version not found", "VERSION_NOT_FOUND");

    version.publish_at = new Date(publishAt);
    await this.versionRepo.save(version);

    layout.status = LayoutStatus.scheduled;
    return this.layoutRepo.save(layout);
  }

  async rollback(layoutId: string, versionId: string) {
    const layout = await this.layoutRepo.findOne({ where: { id: layoutId } });
    if (!layout) throw new HttpError(404, "Layout not found", "LAYOUT_NOT_FOUND");

    const version = await this.versionRepo.findOne({
      where: { id: versionId, layout_id: layoutId },
    });
    if (!version) throw new HttpError(404, "Version not found", "VERSION_NOT_FOUND");

    layout.published_version_id = versionId;
    layout.status = LayoutStatus.published;
    version.published_at = new Date();
    await this.versionRepo.save(version);
    return this.layoutRepo.save(layout);
  }

  // ─── Sections CRUD (on draft version) ────────────────────────────────────

  async listSections(layoutId: string) {
    const layout = await this.layoutRepo.findOne({ where: { id: layoutId } });
    if (!layout) throw new HttpError(404, "Layout not found", "LAYOUT_NOT_FOUND");
    // Mirror getById behavior: ensure a draft exists when only published is set.
    if (!layout.draft_version_id && layout.published_version_id) {
      const draftId = await AppDataSource.transaction((em) => this.ensureDraft(em, layoutId));
      return this.sectionRepo.find({
        where: { version_id: draftId },
        relations: ["section_type"],
        order: { position: "ASC" },
      });
    }
    if (!layout.draft_version_id) return [];

    return this.sectionRepo.find({
      where: { version_id: layout.draft_version_id },
      relations: ["section_type"],
      order: { position: "ASC" },
    });
  }

  async addSection(
    layoutId: string,
    data: {
      section_type_id: string;
      position: number;
      source_mode?: string;
      enabled?: boolean;
      visibility?: { mobile: boolean; web: boolean };
      targeting?: Record<string, unknown>;
      settings?: Record<string, unknown>;
      data_source?: Record<string, unknown>;
      blocks?: Record<string, unknown>[];
      bid_config?: Record<string, unknown>;
    },
    opts?: { enforceVendorScope?: boolean },
  ) {
    if (opts?.enforceVendorScope) {
      await this.assertVendorAllowedSection(data.section_type_id, data.source_mode);
    }

    return AppDataSource.transaction(async (em) => {
      const draftVersionId = await this.ensureDraft(em, layoutId);
      const section = em.create(LayoutSection, {
        version_id: draftVersionId,
        ...data,
      } as any);
      return em.save(section);
    });
  }

  async updateSection(
    _layoutId: string,
    sectionId: string,
    data: Partial<{
      section_type_id: string;
      position: number;
      enabled: boolean;
      visibility: { mobile: boolean; web: boolean };
      targeting: Record<string, unknown>;
      settings: Record<string, unknown>;
      source_mode: string;
      data_source: Record<string, unknown>;
      blocks: Record<string, unknown>[];
      bid_config: Record<string, unknown>;
    }>,
    opts?: { enforceVendorScope?: boolean },
  ) {
    if (opts?.enforceVendorScope) {
      let sectionTypeId = data.section_type_id;
      if (!sectionTypeId) {
        const current = await this.sectionRepo.findOne({
          where: { id: sectionId },
        });
        if (!current) throw new HttpError(404, "Section not found", "SECTION_NOT_FOUND");
        sectionTypeId = current.section_type_id;
      }
      await this.assertVendorAllowedSection(sectionTypeId, data.source_mode);
    }
    const section = await this.sectionRepo.findOne({
      where: { id: sectionId },
    });
    if (!section) throw new HttpError(404, "Section not found", "SECTION_NOT_FOUND");

    Object.assign(section, data);
    return this.sectionRepo.save(section);
  }

  async removeSection(_layoutId: string, sectionId: string) {
    const section = await this.sectionRepo.findOne({
      where: { id: sectionId },
    });
    if (!section) throw new HttpError(404, "Section not found", "SECTION_NOT_FOUND");

    await AppDataSource.transaction(async (em) => {
      await this.bidService.cancelBidsForSection(em, sectionId);
      await em.remove(section);
    });
  }

  async reorderSections(layoutId: string, sections: { id: string; position: number }[]) {
    return AppDataSource.transaction(async (em) => {
      const draftVersionId = await this.ensureDraft(em, layoutId);
      const sectionRepo = em.getRepository(LayoutSection);
      for (const s of sections) {
        const result = await sectionRepo.update(
          { id: s.id, version_id: draftVersionId },
          { position: s.position },
        );
        if (result.affected === 0) {
          throw new HttpError(
            404,
            `Section ${s.id} not found in this layout's draft`,
            "SECTION_NOT_FOUND",
          );
        }
      }
      return em.find(LayoutSection, {
        where: { version_id: draftVersionId },
        relations: ["section_type"],
        order: { position: "ASC" },
      });
    });
  }

  async findByVendorAndSlug(vendorId: string, slug: string) {
    const layout = await this.layoutRepo.findOne({
      where: { vendor_id: vendorId, slug },
    });
    if (!layout) throw new HttpError(404, "Layout not found", "LAYOUT_NOT_FOUND");
    return this.getById(layout.id);
  }
}
