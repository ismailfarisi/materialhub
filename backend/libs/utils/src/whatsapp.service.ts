type FetchLike = typeof fetch;

export interface WhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  /** e.g. https://graph.facebook.com/v21.0 */
  apiBaseUrl: string;
  /** Meta template language code sent with every template, e.g. "en". */
  templateLanguage: string;
  /** Injectable for tests, mirroring the Tamara client in order-service. */
  fetch?: FetchLike;
}

export interface WhatsAppTemplateComponent {
  type: "body" | "button";
  /** Authentication templates use a copy-code URL button. */
  sub_type?: "url";
  /** Button position, "0" for the single OTP button. */
  index?: string;
  parameters: Array<{ type: "text"; text: string }>;
}

/**
 * Meta WhatsApp Cloud API client. Shared across services (notification-service
 * channel dispatch, auth-service OTP) the same way `EmailService` wraps SES.
 *
 * Only pre-approved template messages are supported: business-initiated
 * WhatsApp messages outside the 24h customer-service window MUST be templates,
 * and every current caller is business-initiated.
 */
export class WhatsAppService {
  constructor(private readonly cfg: WhatsAppConfig) {}

  /** Blank accessToken/phoneNumberId means "not configured" — callers degrade to stubs. */
  static isConfigured(cfg: { accessToken: string; phoneNumberId: string }): boolean {
    return Boolean(cfg.accessToken && cfg.phoneNumberId);
  }

  /**
   * Send a pre-approved template message. `to` is E.164 with or without the
   * leading "+" (Meta wants it without).
   */
  async sendTemplate(
    to: string,
    templateName: string,
    components: WhatsAppTemplateComponent[],
    language = this.cfg.templateLanguage,
  ): Promise<{ messageId: string }> {
    const doFetch = this.cfg.fetch ?? fetch;
    const baseUrl = this.cfg.apiBaseUrl.replace(/\/+$/, "");
    const response = await doFetch(`${baseUrl}/${this.cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.cfg.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to.replace(/^\+/, ""),
        type: "template",
        template: {
          name: templateName,
          language: { code: language },
          components,
        },
      }),
    });

    const body = (await response.json().catch(() => ({}))) as {
      messages?: Array<{ id?: string }>;
    };
    if (!response.ok) {
      throw new Error(`WhatsApp send failed: ${response.status} ${JSON.stringify(body)}`);
    }
    return { messageId: body.messages?.[0]?.id ?? "" };
  }

  /**
   * Authentication-category template for OTP: the code goes in the body param
   * AND the copy-code button param — Meta requires both.
   */
  async sendOtpTemplate(
    to: string,
    templateName: string,
    code: string,
  ): Promise<{ messageId: string }> {
    return this.sendTemplate(to, templateName, [
      { type: "body", parameters: [{ type: "text", text: code }] },
      { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
    ]);
  }
}
