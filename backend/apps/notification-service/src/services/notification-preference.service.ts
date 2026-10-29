import { NotificationChannel, NotificationType } from "@materialhub/database";
import type {
  INotificationPreferenceRepository,
  PreferenceMatrix,
  PreferenceUpdate,
} from "../domain/types.ts";

// What an ABSENT preference row means, per channel (Phase 5 Task 8 fix,
// RE-SCOPED in Phase 7 review — see POST_SEED_DEFAULT_IN_APP_TYPES below).
//
// The dispatcher's own `??` fallbacks (notification-dispatcher.service.ts:
// `typePrefs?.email ?? false`, `typePrefs?.push ?? false`,
// `typePrefs?.in_app ?? true`) express the intent "never expressed a
// preference -> in-app yes, email/push no". But getPreferences() pre-fills
// EVERY missing {type, channel} cell, and a pre-filled real `false` means the
// dispatcher's `?? true` in-app default can never fire: any NotificationType
// added to the enum AFTER a user's preference rows were seeded (the 11
// booking types, for every pre-existing user) had its in-app notifications
// silently disabled.
//
// Phase 7 review: the original fix applied `in_app: true` to EVERY
// NotificationType, which silently changed behaviour for pre-existing types
// too — a user with no explicit rows would suddenly start receiving in-app
// notifications for `order_shipped`, `dispute_*`, etc. There is no migration
// and no flag behind that, so it is scoped back: the `in_app: true` default
// applies ONLY to the booking types that post-date the seeding, and every
// pre-existing type keeps its historical blanket `false`.
const BASE_ABSENT_ROW_CHANNEL_DEFAULTS: Record<NotificationChannel, boolean> = {
  [NotificationChannel.in_app]: false,
  [NotificationChannel.email]: false,
  [NotificationChannel.push]: false,
  [NotificationChannel.sms]: false,
  // WhatsApp is strictly opt-in: business-initiated template messages cost
  // per-conversation and land on a personal number, so no absent-row default
  // may ever turn it on.
  [NotificationChannel.whatsapp]: false,
};

// NotificationTypes added to the enum AFTER existing users' preference rows
// were seeded: the 11 booking types (Phase 5 Task 2) plus vendor_new_order.
// These are exactly the set for which an absent row means "never asked", not
// "opted out". Everything else in NotificationType predates that seeding and
// keeps the pre-fix `false`.
//
// Any future type added to NotificationType belongs here too — otherwise every
// pre-existing user gets no in-app notification for it and the new dispatch
// path is silently dead on arrival.
const POST_SEED_DEFAULT_IN_APP_TYPES: ReadonlySet<NotificationType> = new Set([
  NotificationType.booking_confirmed,
  NotificationType.booking_reminder,
  NotificationType.booking_rescheduled,
  NotificationType.booking_cancelled,
  NotificationType.booking_no_show,
  NotificationType.booking_completed,
  NotificationType.booking_review_request,
  NotificationType.booking_payment_failed,
  NotificationType.vendor_new_booking,
  NotificationType.vendor_booking_cancelled,
  NotificationType.vendor_booking_conflict,
  NotificationType.vendor_new_order,
]);

/** Default for an absent {type, channel} preference row. */
function absentRowDefault(type: NotificationType, channel: NotificationChannel): boolean {
  if (channel === NotificationChannel.in_app) {
    return POST_SEED_DEFAULT_IN_APP_TYPES.has(type);
  }
  return BASE_ABSENT_ROW_CHANNEL_DEFAULTS[channel] ?? false;
}

export class NotificationPreferenceService {
  constructor(private readonly preferenceRepo: INotificationPreferenceRepository) {}

  async seedDefaultPreferences(userId: string): Promise<{ count: number }> {
    const notificationTypes = Object.values(NotificationType);
    const channels = Object.values(NotificationChannel);

    const existing = await this.preferenceRepo.findByUserId(userId);
    const existingKeys = new Set(existing.map((p) => `${p.notification_type}:${p.channel}`));

    const toCreate = [];
    for (const type of notificationTypes) {
      for (const channel of channels) {
        // Never seed whatsapp rows: absent row = "never asked" (see
        // absentRowDefault), and this endpoint's blanket `enabled: true`
        // would silently opt every seeded user into paid WhatsApp messages.
        // Users enable it explicitly via updatePreference.
        if (channel === NotificationChannel.whatsapp) continue;
        if (!existingKeys.has(`${type}:${channel}`)) {
          toCreate.push({
            user_id: userId,
            notification_type: type,
            channel,
            enabled: true,
          });
        }
      }
    }

    if (toCreate.length > 0) {
      await this.preferenceRepo.saveBatch(toCreate);
    }

    return { count: toCreate.length };
  }

  async getPreferences(userId: string): Promise<PreferenceMatrix> {
    const preferences = await this.preferenceRepo.findByUserId(userId);

    const notificationTypes = Object.values(NotificationType);
    const channels = Object.values(NotificationChannel);

    const matrix = {} as PreferenceMatrix;
    for (const type of notificationTypes) {
      matrix[type] = {} as Record<NotificationChannel, boolean>;
      for (const channel of channels) {
        // Absent row -> the per-(type, channel) default (see
        // absentRowDefault): `in_app: true` for the booking types only, the
        // historical `false` for everything else. Overlaid by any real DB row
        // below, so explicit opt-ins/opt-outs keep working.
        matrix[type][channel] = absentRowDefault(type, channel);
      }
    }

    for (const pref of preferences) {
      if (matrix[pref.notification_type]) {
        matrix[pref.notification_type][pref.channel] = pref.enabled;
      }
    }

    return matrix;
  }

  async updatePreference(
    userId: string,
    notificationType: NotificationType,
    channel: NotificationChannel,
    enabled: boolean,
  ) {
    const existing = await this.preferenceRepo.findOne(userId, notificationType, channel);

    if (existing) {
      existing.enabled = enabled;
      return this.preferenceRepo.save(existing);
    }

    return this.preferenceRepo.save({
      user_id: userId,
      notification_type: notificationType,
      channel,
      enabled,
    });
  }

  async bulkUpdatePreferences(
    userId: string,
    updates: PreferenceUpdate[],
  ): Promise<PreferenceMatrix> {
    if (updates.length > 0) {
      const entities = updates.map((u) => ({
        user_id: userId,
        notification_type: u.notification_type,
        channel: u.channel,
        enabled: u.enabled,
      }));
      await this.preferenceRepo.upsertBatch(entities);
    }

    return this.getPreferences(userId);
  }
}
