import { AppDataSource, Page, PageStatus } from "@materialhub/database";
import type { CreatePageBody, PageListQuery, UpdatePageBody } from "@materialhub/dto";
import { HttpError } from "@materialhub/plugins";
import type { FindOptionsWhere } from "typeorm";

export class PageService {
  private get repo() {
    return AppDataSource.getRepository(Page);
  }

  async list(query: PageListQuery) {
    const { page = 1, limit = 20, status, locale } = query;
    const where: FindOptionsWhere<Page> = {};
    if (status) where.status = status as PageStatus;
    if (locale) where.locale = locale;

    const [data, total] = await this.repo.findAndCount({
      where,
      order: { sort_order: "ASC", created_at: "DESC" },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit };
  }

  async listPublished(locale?: string) {
    const where: FindOptionsWhere<Page> = { status: PageStatus.published };
    if (locale) where.locale = locale;
    return this.repo.find({
      where,
      order: { sort_order: "ASC", published_at: "DESC" },
      select: [
        "id",
        "title",
        "slug",
        "locale",
        "meta_title",
        "meta_description",
        "sort_order",
        "published_at",
      ],
    });
  }

  async getPublishedBySlug(slug: string) {
    const page = await this.repo.findOne({
      where: { slug, status: PageStatus.published },
    });
    if (!page) throw new HttpError(404, "Page not found", "PAGE_NOT_FOUND");
    return page;
  }

  async create(data: CreatePageBody, authorId: string) {
    const existing = await this.repo.findOne({ where: { slug: data.slug } });
    if (existing) throw new HttpError(409, "Slug already in use", "SLUG_CONFLICT");

    const page = this.repo.create({
      ...data,
      status: data.status as PageStatus,
      author_id: authorId,
      published_at: data.status === PageStatus.published ? new Date() : null,
    } as any);
    return this.repo.save(page);
  }

  async update(id: string, data: UpdatePageBody) {
    const page = await this.repo.findOne({ where: { id } });
    if (!page) throw new HttpError(404, "Page not found", "PAGE_NOT_FOUND");

    if (data.slug && data.slug !== page.slug) {
      const conflict = await this.repo.findOne({ where: { slug: data.slug } });
      if (conflict) throw new HttpError(409, "Slug already in use", "SLUG_CONFLICT");
    }

    const wasPublished = page.status === PageStatus.published;
    const willPublish = data.status === PageStatus.published;
    if (!wasPublished && willPublish && !page.published_at) {
      (data as any).published_at = new Date();
    }

    Object.assign(page, data);
    return this.repo.save(page);
  }

  async remove(id: string) {
    const page = await this.repo.findOne({ where: { id } });
    if (!page) throw new HttpError(404, "Page not found", "PAGE_NOT_FOUND");
    await this.repo.softRemove(page);
  }
}
