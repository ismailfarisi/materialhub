import { describe, expect, it } from "bun:test";
import { NotificationType } from "@materialhub/database";
import { getTemplate, renderTemplate } from "./templates.ts";

const QUOTE_TYPES = [
  NotificationType.quote_request_received,
  NotificationType.quote_response_received,
  NotificationType.quote_message_received,
  NotificationType.quote_accepted,
];

describe("RFQ notification templates", () => {
  it("has a template for every quote notification type", () => {
    for (const type of QUOTE_TYPES) {
      expect(getTemplate(type)).not.toBeNull();
    }
  });

  it("links to the audience's own page via action_path", () => {
    const tpl = getTemplate(NotificationType.quote_response_received)!;
    const vars = {
      request_number: "RFQ-2026-000042",
      vendor_name: "Alpha Board Trading",
      action_path: "/account/quotes/abc",
    };
    expect(renderTemplate(tpl.bodyTemplate, vars)).toBe(
      "Alpha Board Trading sent a quote for RFQ-2026-000042",
    );
    expect(renderTemplate(tpl.actionUrlTemplate!, vars)).toBe("/account/quotes/abc");
  });
});
