import { AppDataSource, SavedSearch } from "@materialhub/database";
import { ForbiddenError, NotFoundError } from "@materialhub/plugins";

export class SavedSearchService {
  private get repo() {
    return AppDataSource.getRepository(SavedSearch);
  }

  async create(
    userId: string,
    data: {
      name?: string;
      query: string;
      filters?: Record<string, unknown>;
      notify_on_match?: boolean;
    },
  ) {
    const search = this.repo.create({
      user_id: userId,
      name: data.name ?? null,
      query: data.query,
      filters: data.filters ?? null,
      notify_on_match: data.notify_on_match ?? false,
    });
    return this.repo.save(search);
  }

  async list(userId: string, page = 1, limit = 20) {
    const [items, total] = await this.repo.findAndCount({
      where: { user_id: userId },
      order: { created_at: "DESC" },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  async update(
    id: string,
    userId: string,
    data: {
      name?: string;
      query?: string;
      filters?: Record<string, unknown>;
      notify_on_match?: boolean;
    },
  ) {
    const search = await this.repo.findOne({ where: { id } });
    if (!search) throw new NotFoundError(`Saved search ${id} not found`);
    if (search.user_id !== userId) throw new ForbiddenError("Access denied");

    if (data.name !== undefined) search.name = data.name;
    if (data.query !== undefined) search.query = data.query;
    if (data.filters !== undefined) search.filters = data.filters;
    if (data.notify_on_match !== undefined) search.notify_on_match = data.notify_on_match;

    return this.repo.save(search);
  }

  async delete(id: string, userId: string) {
    const search = await this.repo.findOne({ where: { id } });
    if (!search) throw new NotFoundError(`Saved search ${id} not found`);
    if (search.user_id !== userId) throw new ForbiddenError("Access denied");
    await this.repo.softRemove(search);
  }
}
