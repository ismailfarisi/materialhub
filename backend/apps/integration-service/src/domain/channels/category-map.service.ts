import type { ChannelCategoryMapping } from "@materialhub/database";
import type { Repository } from "typeorm";

export class CategoryMapService {
  constructor(private repo: Repository<ChannelCategoryMapping>) {}

  async list(channelId: string): Promise<ChannelCategoryMapping[]> {
    return this.repo.find({
      where: { channel_id: channelId, deleted_at: null as any },
      order: { created_at: "ASC" } as any,
    });
  }

  async upsert(
    channelId: string,
    categoryId: string,
    externalCategoryId: string,
    externalCategoryPath: string | null,
  ): Promise<ChannelCategoryMapping> {
    const existing = await this.repo.findOne({
      where: { channel_id: channelId, category_id: categoryId, deleted_at: null as any },
    });
    if (existing) {
      existing.external_category_id = externalCategoryId;
      existing.external_category_path = externalCategoryPath;
      return this.repo.save(existing);
    }
    return this.repo.save({
      channel_id: channelId,
      category_id: categoryId,
      external_category_id: externalCategoryId,
      external_category_path: externalCategoryPath,
    } as ChannelCategoryMapping);
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.repo.softDelete(id);
    return (result.affected ?? 0) > 0;
  }
}
