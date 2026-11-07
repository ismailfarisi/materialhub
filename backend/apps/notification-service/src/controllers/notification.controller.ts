import type { AuthUser } from "@materialhub/guards";
import type { NotificationService } from "../services/notification.service.ts";

export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  async list(
    user: AuthUser,
    query: { page?: number; limit?: number; type?: string; is_read?: boolean },
  ) {
    const page = Math.max(1, Math.trunc(Number(query.page)) || 1);
    const limit = query.limit ?? 20;

    const result = await this.notificationService.list(user.id, {
      page,
      limit,
      type: query.type,
      is_read: query.is_read,
    });

    return { items: result.items, total: result.total, page, limit };
  }

  async send(body: {
    user_id: string;
    type: string;
    channel?: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
    action_url?: string;
  }) {
    const notification = await this.notificationService.send(body);
    return { notification };
  }

  async markAsRead(id: string, requestingUserId: string) {
    const notification = await this.notificationService.markAsRead(id, requestingUserId);
    return { notification };
  }

  async readAll(userId: string) {
    return this.notificationService.readAll(userId);
  }

  async unreadCount(userId: string) {
    return this.notificationService.unreadCount(userId);
  }

  get service() {
    return this.notificationService;
  }
}
