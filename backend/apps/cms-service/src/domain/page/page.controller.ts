import type { CreatePageBody, PageListQuery, UpdatePageBody } from "@materialhub/dto";
import type { PageService } from "./page.service.ts";

export class PageController {
  constructor(private readonly pageService: PageService) {}

  async list(query: PageListQuery) {
    return this.pageService.list(query);
  }
  async listPublished(locale?: string) {
    return this.pageService.listPublished(locale);
  }
  async getPublishedBySlug(slug: string) {
    return this.pageService.getPublishedBySlug(slug);
  }
  async getById(id: string) {
    return this.pageService.getById(id);
  }
  async create(data: CreatePageBody, authorId: string) {
    return this.pageService.create(data, authorId);
  }
  async update(id: string, data: UpdatePageBody) {
    return this.pageService.update(id, data);
  }
  async remove(id: string) {
    return this.pageService.remove(id);
  }
}
