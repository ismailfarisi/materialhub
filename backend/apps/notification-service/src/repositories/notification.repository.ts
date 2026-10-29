import { AppDataSource, Notification } from "@materialhub/database";
import type { INotificationRepository } from "../domain/types.ts";

export class NotificationRepository implements INotificationRepository {
  private get repo() {
    return AppDataSource.getRepository(Notification);
  }

  async findByUserId(
    userId: string,
    options: { page: number; limit: number; type?: string; is_read?: boolean },
  ): Promise<{ items: Notification[]; total: number }> {
    const where: Record<string, unknown> = { user_id: userId };
    if (options.type) where.type = options.type;
    if (options.is_read !== undefined) where.is_read = options.is_read;

    const [items, total] = await this.repo.findAndCount({
      where,
      order: { created_at: "DESC" },
      skip: (options.page - 1) * options.limit,
      take: options.limit,
    });

    return { items, total };
  }

  async findById(id: string): Promise<Notification | null> {
    return this.repo.findOne({ where: { id } });
  }

  async save(data: Partial<Notification>): Promise<Notification> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async readAllForUser(userId: string): Promise<number> {
    const result = await this.repo.update(
      { user_id: userId, is_read: false },
      { is_read: true, read_at: new Date() },
    );
    return result.affected || 0;
  }

  async unreadCount(userId: string): Promise<number> {
    return this.repo.count({
      where: { user_id: userId, is_read: false },
    });
  }
}
