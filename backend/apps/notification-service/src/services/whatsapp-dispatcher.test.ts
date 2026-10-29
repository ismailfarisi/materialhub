import { describe, expect, it, mock } from "bun:test";
import { MetaWhatsAppDispatcher, StubWhatsAppDispatcher } from "./whatsapp-dispatcher.ts";

function buildDispatcher() {
  const whatsapp = {
    sendTemplate: mock((_to: any, _name?: any, _components?: any) =>
      Promise.resolve({ messageId: "wamid.X" }),
    ),
  };
  return { dispatcher: new MetaWhatsAppDispatcher(whatsapp as any), whatsapp };
}

describe("MetaWhatsAppDispatcher", () => {
  it("maps variables through the registry's paramOrder into positional body params", async () => {
    const { dispatcher, whatsapp } = buildDispatcher();

    const sent = await dispatcher.send("+971501234567", "order_shipped", {
      order_number: "ORD-9",
      tracking_url: "https://track/xyz",
      unrelated: "ignored",
    });

    expect(sent).toBe(true);
    expect(whatsapp.sendTemplate).toHaveBeenCalledTimes(1);
    const [to, name, components] = whatsapp.sendTemplate.mock.calls[0]! as any[];
    expect(to).toBe("+971501234567");
    expect(name).toBe("order_shipped");
    // paramOrder pins {{1}} = order_number, {{2}} = tracking_url.
    expect(components).toEqual([
      {
        type: "body",
        parameters: [
          { type: "text", text: "ORD-9" },
          { type: "text", text: "https://track/xyz" },
        ],
      },
    ]);
  });

  it("skips the send when a declared template param is missing", async () => {
    const { dispatcher, whatsapp } = buildDispatcher();

    // order_shipped declares tracking_url, but a shipped event carrying no
    // tracking metadata leaves it blank — and Meta rejects a blank body
    // parameter, so calling out is guaranteed to fail. Skip like an unmapped
    // type instead of firing a doomed request.
    const sent = await dispatcher.send("+971501234567", "order_shipped", {
      order_number: "ORD-9",
    });

    expect(sent).toBe(false);
    expect(whatsapp.sendTemplate).not.toHaveBeenCalled();
  });

  it("returns false without calling Meta for a type with no template mapping", async () => {
    const { dispatcher, whatsapp } = buildDispatcher();

    const sent = await dispatcher.send("+971501234567", "booking_confirmed", {});

    expect(sent).toBe(false);
    expect(whatsapp.sendTemplate).not.toHaveBeenCalled();
  });

  it("propagates send failures (BullMQ retry/DLQ semantics)", async () => {
    const { dispatcher, whatsapp } = buildDispatcher();
    whatsapp.sendTemplate.mockImplementation(() =>
      Promise.reject(new Error("WhatsApp send failed: 500")),
    );

    await expect(
      dispatcher.send("+971501234567", "order_confirmed", { order_number: "1" }),
    ).rejects.toThrow("WhatsApp send failed");
  });
});

describe("StubWhatsAppDispatcher", () => {
  it("logs and reports success", async () => {
    const stub = new StubWhatsAppDispatcher();
    await expect(stub.send("+971501234567", "order_confirmed", {})).resolves.toBe(true);
  });
});
