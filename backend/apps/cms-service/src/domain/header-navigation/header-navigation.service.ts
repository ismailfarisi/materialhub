import {
  AppDataSource,
  type HeaderNavConfig,
  type HeaderNavTab,
  HeaderNavigationConfig,
} from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";
import { IsNull } from "typeorm";
import { purgeHeaderNavCache } from "./cloudfront-purge.ts";

export class HeaderNavigationService {
  private get repo() {
    return AppDataSource.getRepository(HeaderNavigationConfig);
  }

  async getDraft(): Promise<HeaderNavigationConfig | null> {
    return this.repo.findOne({
      where: { status: "draft", deleted_at: IsNull() },
    });
  }

  async getPublished(): Promise<HeaderNavigationConfig | null> {
    return this.repo.findOne({
      where: { status: "published", deleted_at: IsNull() },
    });
  }

  async upsertDraft(config: HeaderNavConfig, userId: string): Promise<HeaderNavigationConfig> {
    this.validate(config);

    const existing = await this.getDraft();
    if (existing) {
      existing.config = config;
      return this.repo.save(existing);
    }

    const created = this.repo.create({
      version: 1,
      status: "draft",
      config,
      created_by: userId,
    });
    return this.repo.save(created);
  }

  async publish(userId: string): Promise<HeaderNavigationConfig> {
    const draft = await this.getDraft();
    if (!draft) {
      throw new HttpError(400, "No draft to publish", "NO_DRAFT");
    }

    const saved = await AppDataSource.transaction(async (em) => {
      const repo = em.getRepository(HeaderNavigationConfig);
      const previousPublished = await repo.findOne({
        where: { status: "published", deleted_at: IsNull() },
      });

      let nextVersion = 1;
      if (previousPublished) {
        nextVersion = previousPublished.version + 1;
        await repo.softRemove(previousPublished);
      }

      draft.status = "published";
      draft.version = nextVersion;
      draft.published_at = new Date();
      draft.created_by = userId;
      const published = await repo.save(draft);

      // Re-create the draft mirroring what was just published so the editor
      // stays populated on the next page load. Without this, every publish
      // empties the editor and the user has to add every tab from scratch
      // to make even a tiny tweak.
      const newDraft = repo.create({
        version: 1,
        status: "draft",
        config: published.config,
        created_by: userId,
      });
      await repo.save(newDraft);

      return published;
    });

    // Fire-and-forget cache invalidation. Failures are logged but don't roll back the publish.
    this.invalidateCachesAfterPublish().catch((e) =>
      console.error("[header-nav] cache invalidate failed:", e),
    );

    return saved;
  }

  private async invalidateCachesAfterPublish(): Promise<void> {
    // 1. CloudFront edge purge
    await purgeHeaderNavCache();
    // 2. Web app revalidate webhook
    const url = process.env.WEB_REVALIDATE_URL;
    const secret = process.env.REVALIDATE_SECRET;
    if (url && secret) {
      await fetch(`${url}/api/revalidate/header-navigation`, {
        method: "POST",
        headers: { "x-revalidate-secret": secret },
      });
    }
  }

  private validate(config: HeaderNavConfig): void {
    if (config.tabs.length > 11) throw new HttpError(400, "at most 11 tabs", "INVALID_CONFIG");

    const categoryCount = config.tabs.filter((t) => t.kind === "category").length;
    if (categoryCount > 7) throw new HttpError(400, "at most 7 category tabs", "INVALID_CONFIG");

    for (const tab of config.tabs) {
      this.validateTab(tab);
    }
  }

  private validateTab(tab: HeaderNavTab): void {
    if (!tab.label?.en)
      throw new HttpError(400, `tab "${tab.id}": label.en required`, "INVALID_CONFIG");

    if (tab.kind === "category" && !tab.category_id) {
      throw new HttpError(
        400,
        `tab "${tab.id}": category_id required for kind=category`,
        "INVALID_CONFIG",
      );
    }
    if (tab.kind === "custom" && !tab.href_override) {
      throw new HttpError(
        400,
        `tab "${tab.id}": href_override required for kind=custom`,
        "INVALID_CONFIG",
      );
    }

    if (tab.brand_list.brand_ids.length > 10) {
      throw new HttpError(400, `tab "${tab.id}": at most 10 brands`, "INVALID_CONFIG");
    }
    if (tab.promo_tiles.length > 3) {
      throw new HttpError(400, `tab "${tab.id}": at most 3 promo tiles`, "INVALID_CONFIG");
    }
  }
}
