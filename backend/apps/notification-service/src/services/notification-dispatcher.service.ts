import { normalizePhoneE164 } from "@materialhub/utils";
import { getTemplate, renderHtmlEmail, renderTemplate } from "../domain/templates.ts";
import type { EmailDispatcher } from "./email-dispatcher.ts";
import type { NotificationPreferenceService } from "./notification-preference.service.ts";
import type { NotificationService } from "./notification.service.ts";
import type { PushDispatcher } from "./push-dispatcher.ts";
import type { WhatsAppDispatcher } from "./whatsapp-dispatcher.ts";

export interface DispatchEvent {
  type: string;
  userId: string;
  variables: Record<string, string>;
  data?: Record<string, unknown>;
}

// A template's rendered output, normalized whether it came from the plain
// bodyTemplate interpolation or a type's custom `render` hook (see
// templates.ts's NotificationTemplate doc comment).
interface RenderedTemplate {
  title: string;
  body: string;
  actionUrl?: string;
  emailHtmlExtra?: string;
}

// Types whose email is delivered as a rich, standalone transactional message by
// OrderEmailService. The generic dispatcher still sends their in-app (and push)
// copy, but must NOT also send a plain email or the customer gets two.
//
// Booking types (Phase 5 Task 8) are DELIBERATELY NOT in this set: unlike
// order_confirmed, nothing else sends their email — they get their full
// (conditional) content straight from this generic pipeline via
// templates.ts's per-type `render` hook (see that file's NotificationTemplate
// doc comment). Adding a booking type here would silence its only email path.
// vendor_new_order belongs here for the same reason as order_confirmed:
// OrderEmailService.sendForConfirmedOrder already mails every vendor member
// the rich new-order alert unconditionally, so without this entry a member
// gets that email PLUS this pipeline's plain "New order {order_number}" one.
const RICH_EMAIL_TYPES = new Set(["order_confirmed", "vendor_new_order"]);

export class NotificationDispatcherService {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly preferenceService: NotificationPreferenceService,
    private readonly emailDispatcher: EmailDispatcher,
    private readonly pushDispatcher: PushDispatcher,
    private readonly whatsAppDispatcher: WhatsAppDispatcher,
    private readonly userRepo: { findOneBy(criteria: Record<string, unknown>): Promise<any> },
    private readonly redisClient: { publish(channel: string, message: string): Promise<unknown> },
  ) {}

  async dispatch(event: DispatchEvent): Promise<void> {
    // 1. Get template — return silently if none
    const template = getTemplate(event.type);
    if (!template) return;

    // 2. Render title, body, actionUrl — plain {key} interpolation for most
    // types; booking types (Phase 5 Task 8) with conditional content (e.g.
    // booking_cancelled's void-vs-refund wording) go through the template's
    // own `render` hook instead (see templates.ts's NotificationTemplate doc
    // comment). `render`'s `actionUrl`, when present, wins over
    // actionUrlTemplate — it's for cases where the emitter already built the
    // full right-shaped link (a dispute/pay-now URL) into `variables` rather
    // than something assemblable from a static `{token}` template string.
    const rendered: RenderedTemplate = template.render
      ? template.render(event.variables, event.data ?? {})
      : {
          title: renderTemplate(template.title, event.variables),
          body: renderTemplate(template.bodyTemplate, event.variables),
        };
    const title = rendered.title;
    const body = rendered.body;
    const actionUrl =
      rendered.actionUrl ??
      (template.actionUrlTemplate
        ? renderTemplate(template.actionUrlTemplate, event.variables)
        : undefined);

    // 3. Get user preferences
    const preferences = await this.preferenceService.getPreferences(event.userId);
    const typePrefs = preferences[event.type as keyof typeof preferences];

    const emailEnabled = (typePrefs?.email ?? false) && !RICH_EMAIL_TYPES.has(event.type);
    const pushEnabled = typePrefs?.push ?? false;
    const inAppEnabled = typePrefs?.in_app ?? true; // default enabled
    const whatsappEnabled = typePrefs?.whatsapp ?? false;

    // 4. Load user once if email, push, or whatsapp is needed
    let user: any = null;
    if (emailEnabled || pushEnabled || whatsappEnabled) {
      user = await this.userRepo.findOneBy({ id: event.userId });
    }

    // 5. In-app channel
    if (inAppEnabled) {
      const notification = await this.notificationService.send({
        user_id: event.userId,
        type: event.type,
        channel: "in_app",
        title,
        body,
        data: event.data,
        action_url: actionUrl,
      });

      // Publish to Redis (non-fatal)
      try {
        await this.redisClient.publish(
          `notifications:${event.userId}`,
          JSON.stringify({ id: notification.id, title, body, data: event.data }),
        );
      } catch {
        // Redis publish failure is non-fatal
      }
    }

    // 6. Email channel — emailHtmlExtra (booking_reminder's .ics download
    // link) is appended to the EMAIL body only, never shown in-app (step 5
    // above already sent the plain `body` there).
    if (emailEnabled && user?.email) {
      const emailBody = rendered.emailHtmlExtra ? body + rendered.emailHtmlExtra : body;
      const html = renderHtmlEmail(title, emailBody, actionUrl);
      await this.emailDispatcher.send(user.email, title, html);
    }

    // 7. Push channel
    if (pushEnabled && user?.fcm_token) {
      await this.pushDispatcher.send(user.fcm_token, title, body, event.data);
    }

    // 8. WhatsApp channel — template-only (Meta requires pre-approved
    // templates outside the 24h service window), so the dispatcher maps the
    // event type through the whatsapp-templates.ts registry rather than
    // sending title/body. Gated on a VERIFIED phone: business messages must
    // never go to a number the user typed but never proved they own. A
    // malformed stored phone skips silently (parity with the missing
    // fcm_token / email guards above).
    //
    // Best-effort rather than throwing: this is the LAST step, so the in-app
    // row, the Redis publish and the email have all already happened. The
    // dispatch queue retries the whole handler 3× from the top, so letting a
    // Meta failure propagate would create a second notification row and send
    // the customer a second and third email. Meta failures are routine here —
    // every template needs separate console approval, and an unapproved
    // template, a non-WhatsApp number or a per-conversation rate limit all
    // return non-2xx. A lost WhatsApp message costs less than duplicate email.
    if (whatsappEnabled && user?.phone && user?.phone_verified_at) {
      const toPhone = normalizePhoneE164(user.phone);
      if (toPhone) {
        try {
          await this.whatsAppDispatcher.send(toPhone, event.type, event.variables);
        } catch (err) {
          console.error("[notification-dispatch] whatsapp send failed", {
            userId: event.userId,
            type: event.type,
            error: String(err),
          });
        }
      }
    }
  }
}
