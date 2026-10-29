import type { NotificationChannel, NotificationType } from "@materialhub/database";
import type { AuthUser } from "@materialhub/guards";
import type { PreferenceUpdate } from "../domain/types.ts";
import type { NotificationPreferenceService } from "../services/notification-preference.service.ts";

export class NotificationPreferenceController {
  constructor(private readonly preferenceService: NotificationPreferenceService) {}

  async getPreferences(user: AuthUser) {
    return {
      preferences: await this.preferenceService.getPreferences(user.id),
    };
  }

  async bulkUpdate(user: AuthUser, updates: PreferenceUpdate[]) {
    const preferences = await this.preferenceService.bulkUpdatePreferences(user.id, updates);
    return { preferences };
  }

  async updateSingle(
    user: AuthUser,
    type: NotificationType,
    channel: NotificationChannel,
    enabled: boolean,
  ) {
    const preference = await this.preferenceService.updatePreference(
      user.id,
      type,
      channel,
      enabled,
    );
    return { preference };
  }

  async seedDefaults(user: AuthUser) {
    return this.seedDefaultsForUser(user.id);
  }

  async seedDefaultsForUser(userId: string) {
    const { count } = await this.preferenceService.seedDefaultPreferences(userId);

    return {
      message:
        count > 0
          ? `Successfully seeded ${count} default notification preferences`
          : "All notification preferences already exist",
      count,
    };
  }
}
