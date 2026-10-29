import type { WhatsAppService } from "@materialhub/utils";
import { getWhatsAppTemplate } from "../domain/whatsapp-templates.ts";

export interface WhatsAppDispatcher {
  /**
   * Returns false when the type has no approved Meta template mapping (the
   * caller treats that as a silent skip, not a failure). Throws on a failed
   * send so the dispatch job's BullMQ retry/DLQ semantics apply — same
   * contract as the email dispatcher.
   */
  send(
    toPhoneE164: string,
    notificationType: string,
    variables: Record<string, string>,
  ): Promise<boolean>;
}

export class StubWhatsAppDispatcher implements WhatsAppDispatcher {
  async send(
    to: string,
    notificationType: string,
    _variables: Record<string, string>,
  ): Promise<boolean> {
    console.log(`[StubWhatsApp] To: ${to} | Type: ${notificationType}`);
    return true;
  }
}

/**
 * Real transport backed by the shared Meta Cloud API client. Business-initiated
 * messages must be pre-approved templates, so every send goes through the
 * whatsapp-templates.ts registry — never free-form text.
 */
export class MetaWhatsAppDispatcher implements WhatsAppDispatcher {
  constructor(private readonly whatsapp: WhatsAppService) {}

  async send(
    to: string,
    notificationType: string,
    variables: Record<string, string>,
  ): Promise<boolean> {
    const template = getWhatsAppTemplate(notificationType);
    if (!template) return false;

    // Meta rejects a blank body parameter, so a template whose declared params
    // aren't all populated can never be delivered — skip it the same way an
    // unmapped type is skipped rather than firing a call that is certain to
    // fail. Hit in practice by order_shipped, whose tracking_url is absent on
    // any shipped event that carries no tracking metadata.
    const missing = template.paramOrder.filter((key) => !variables[key]);
    if (missing.length > 0) {
      console.warn("[whatsapp] skipping send, template params missing", {
        template: template.templateName,
        notificationType,
        missing,
      });
      return false;
    }

    await this.whatsapp.sendTemplate(to, template.templateName, [
      {
        type: "body",
        parameters: template.paramOrder.map((key) => ({
          type: "text",
          text: variables[key] as string,
        })),
      },
    ]);
    return true;
  }
}
