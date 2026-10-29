/**
 * Bridge between the named-variable notification templates (templates.ts's
 * `{key}` interpolation) and Meta's positional `{{1}}..{{n}}` template params.
 *
 * This registry is the single source of truth for which NotificationTypes go
 * out over WhatsApp and how their `variables` map onto the pre-approved Meta
 * template's parameters. A type absent here is silently skipped even when the
 * user enabled the whatsapp channel — mirroring getTemplate()'s
 * silent-return contract in templates.ts.
 *
 * Ops prerequisite: each templateName below must exist and be APPROVED in the
 * Meta WhatsApp Business console with a body param count equal to
 * paramOrder.length, or Meta rejects the send at request time.
 */
export interface WhatsAppTemplateMapping {
  /** Exact template name in the Meta WhatsApp Business console. */
  templateName: string;
  /** `variables` keys in {{1}}..{{n}} order. A missing key renders as "". */
  paramOrder: string[];
}

const WHATSAPP_TEMPLATES: Record<string, WhatsAppTemplateMapping> = {
  order_confirmed: { templateName: "order_confirmed", paramOrder: ["order_number"] },
  order_shipped: { templateName: "order_shipped", paramOrder: ["order_number", "tracking_url"] },
  order_delivered: { templateName: "order_delivered", paramOrder: ["order_number"] },
  payout_sent: { templateName: "payout_sent", paramOrder: ["amount"] },
  vendor_new_order: { templateName: "vendor_new_order", paramOrder: ["order_number", "amount"] },
};

export function getWhatsAppTemplate(type: string): WhatsAppTemplateMapping | undefined {
  return WHATSAPP_TEMPLATES[type];
}
