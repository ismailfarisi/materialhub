import { describe, expect, it, mock } from "bun:test";
import { WhatsAppService } from "./whatsapp.service.ts";

function buildService(overrides: { status?: number; body?: unknown } = {}) {
  const fetchMock = mock(async (_url: any, _init?: any) => {
    return new Response(JSON.stringify(overrides.body ?? { messages: [{ id: "wamid.ABC" }] }), {
      status: overrides.status ?? 200,
    });
  });
  const service = new WhatsAppService({
    accessToken: "token-123",
    phoneNumberId: "555000",
    apiBaseUrl: "https://graph.facebook.com/v21.0",
    templateLanguage: "en",
    fetch: fetchMock as any,
  });
  return { service, fetchMock };
}

describe("WhatsAppService", () => {
  it("isConfigured requires both accessToken and phoneNumberId", () => {
    expect(WhatsAppService.isConfigured({ accessToken: "t", phoneNumberId: "p" })).toBe(true);
    expect(WhatsAppService.isConfigured({ accessToken: "", phoneNumberId: "p" })).toBe(false);
    expect(WhatsAppService.isConfigured({ accessToken: "t", phoneNumberId: "" })).toBe(false);
    expect(WhatsAppService.isConfigured({ accessToken: "", phoneNumberId: "" })).toBe(false);
  });

  it("POSTs the template payload to /{phoneNumberId}/messages with a Bearer token", async () => {
    const { service, fetchMock } = buildService();

    const result = await service.sendTemplate("+971501234567", "order_confirmed", [
      { type: "body", parameters: [{ type: "text", text: "ORD-1" }] },
    ]);

    expect(result.messageId).toBe("wamid.ABC");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]! as any[];
    expect(url).toBe("https://graph.facebook.com/v21.0/555000/messages");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer token-123");

    const payload = JSON.parse(init.body);
    expect(payload.messaging_product).toBe("whatsapp");
    // Meta wants E.164 without the leading "+".
    expect(payload.to).toBe("971501234567");
    expect(payload.type).toBe("template");
    expect(payload.template.name).toBe("order_confirmed");
    expect(payload.template.language.code).toBe("en");
    expect(payload.template.components).toEqual([
      { type: "body", parameters: [{ type: "text", text: "ORD-1" }] },
    ]);
  });

  it("strips trailing slashes from the base URL", async () => {
    const fetchMock = mock(async () => new Response("{}", { status: 200 }));
    const service = new WhatsAppService({
      accessToken: "t",
      phoneNumberId: "42",
      apiBaseUrl: "https://graph.facebook.com/v21.0//",
      templateLanguage: "en",
      fetch: fetchMock as any,
    });
    await service.sendTemplate("971501234567", "x", []);
    expect((fetchMock.mock.calls[0]! as any[])[0]).toBe(
      "https://graph.facebook.com/v21.0/42/messages",
    );
  });

  it("throws with status and response body on a failed send", async () => {
    const { service } = buildService({
      status: 400,
      body: { error: { code: 132000, message: "param count mismatch" } },
    });

    await expect(service.sendTemplate("971501234567", "order_confirmed", [])).rejects.toThrow(
      /WhatsApp send failed: 400.*132000/,
    );
  });

  it("sendOtpTemplate sends the code as body param AND copy-code button param", async () => {
    const { service, fetchMock } = buildService();

    await service.sendOtpTemplate("+971501234567", "otp_code", "123456");

    const payload = JSON.parse((fetchMock.mock.calls[0]! as any[])[1].body);
    expect(payload.template.name).toBe("otp_code");
    expect(payload.template.components).toEqual([
      { type: "body", parameters: [{ type: "text", text: "123456" }] },
      {
        type: "button",
        sub_type: "url",
        index: "0",
        parameters: [{ type: "text", text: "123456" }],
      },
    ]);
  });
});
