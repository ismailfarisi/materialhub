import {
  AppDataSource,
  type NotificationChannel,
  NotificationPreference,
  type NotificationType,
} from "@materialhub/database";
import type { INotificationPreferenceRepository } from "../domain/types.ts";

export class NotificationPreferenceRepository implements INotificationPreferenceRepository {
  private get repo() {
    return AppDataSource.getRepository(NotificationPreference);
  }

  async findByUserId(userId: string): Promise<NotificationPreference[]> {
    return this.repo.find({ where: { user_id: userId } });
  }

  async findOne(
    userId: string,
    type: NotificationType,
    channel: NotificationChannel,
  ): Promise<NotificationPreference | null> {
    return this.repo.findOne({
      where: {
        user_id: userId,
        notification_type: type,
        channel,
      },
    });
  }

  async save(data: Partial<NotificationPreference>): Promise<NotificationPreference> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async saveBatch(items: Partial<NotificationPreference>[]): Promise<NotificationPreference[]> {
    const entities = items.map((data) => this.repo.create(data));
    return this.repo.save(entities);
  }

  async upsertBatch(items: Partial<NotificationPreference>[]): Promise<void> {
    if (items.length === 0) return;
    await this.repo
      .createQueryBuilder()
      .insert()
      .values(items as any)
      .orUpdate(["enabled"], ["user_id", "notification_type", "channel"])
      .execute();
  }
}
