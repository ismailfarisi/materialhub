import type {
  Notification,
  NotificationChannel,
  NotificationPreference,
  NotificationType,
} from "@materialhub/database";

// ─── Preference Domain Types ────────────────────────────────────────────────

export type PreferenceMatrix = Record<NotificationType, Record<NotificationChannel, boolean>>;

export interface PreferenceUpdate {
  notification_type: NotificationType;
  channel: NotificationChannel;
  enabled: boolean;
}

// ─── Repository Interfaces ──────────────────────────────────────────────────

export interface INotificationPreferenceRepository {
  findByUserId(userId: string): Promise<NotificationPreference[]>;

  findOne(
    userId: string,
    type: NotificationType,
    channel: NotificationChannel,
  ): Promise<NotificationPreference | null>;

  save(data: Partial<NotificationPreference>): Promise<NotificationPreference>;

  saveBatch(items: Partial<NotificationPreference>[]): Promise<NotificationPreference[]>;

  upsertBatch(items: Partial<NotificationPreference>[]): Promise<void>;
}

export interface INotificationRepository {
  findByUserId(
    userId: string,
    options: { page: number; limit: number; type?: string; is_read?: boolean },
  ): Promise<{ items: Notification[]; total: number }>;

  findById(id: string): Promise<Notification | null>;

  save(data: Partial<Notification>): Promise<Notification>;

  readAllForUser(userId: string): Promise<number>;
  unreadCount(userId: string): Promise<number>;
}
