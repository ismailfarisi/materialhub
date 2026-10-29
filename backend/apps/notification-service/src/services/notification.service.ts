import type { Notification } from "@materialhub/database";
import { ForbiddenError, NotFoundError } from "@materialhub/plugins";
import type { INotificationRepository } from "../domain/types.ts";

export class NotificationService {
  constructor(private readonly notificationRepo: INotificationRepository) {}

  async list(
    userId: string,
    query: { page: number; limit: number; type?: string; is_read?: boolean },
  ): Promise<{ items: Notification[]; total: number }> {
    return this.notificationRepo.findByUserId(userId, query);
  }

  async send(data: {
    user_id: string;
    type: string;
    channel?: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
    action_url?: string;
  }): Promise<Notification> {
    return this.notificationRepo.save({
      ...data,
      channel: (data.channel ?? "in_app") as never,
      type: data.type as never,
      is_read: false,
    });
  }

  async readAll(userId: string): Promise<{ count: number }> {
    const count = await this.notificationRepo.readAllForUser(userId);
    return { count };
  }

  async unreadCount(userId: string): Promise<number> {
    return this.notificationRepo.unreadCount(userId);
  }

  async markAsRead(id: string, requestingUserId: string): Promise<Notification> {
    const notification = await this.notificationRepo.findById(id);
    if (!notification) {
      throw new NotFoundError("Notification not found");
    }

    if (notification.user_id !== requestingUserId) {
      throw new ForbiddenError("Cannot modify another user's notification");
    }

    notification.is_read = true;
    notification.read_at = new Date();
    return this.notificationRepo.save(notification);
  }
}
