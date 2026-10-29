import type { SavedSearchService } from "./saved-search.service.ts";

export class SavedSearchController {
  constructor(private readonly service: SavedSearchService) {}

  async create(userId: string, data: any) {
    return this.service.create(userId, data);
  }
  async list(userId: string, page?: number, limit?: number) {
    return this.service.list(userId, page, limit);
  }
  async update(id: string, userId: string, data: any) {
    return this.service.update(id, userId, data);
  }
  async delete(id: string, userId: string) {
    return this.service.delete(id, userId);
  }
}
