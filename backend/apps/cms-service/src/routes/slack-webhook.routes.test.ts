import { describe, expect, it, mock } from "bun:test";
import { createHmac } from "node:crypto";
import { Elysia } from "elysia";

const SIGNING = "sig";
function sign(ts: string, body: string) {
  return `v0=${createHmac("sha256", SIGNING).update(`v0:${ts}:${body}`).digest("hex")}`;
}

// Stub the container so mounting slackWebhookRoutes never touches the real
// SupportService / SlackService (no live DB / Slack API in this test). The
// real container decorates `supportController` (but not yet `slackService` —
// that lands in Task 6), and re-applying it inside slackWebhookRoutes would
// silently override the per-test stub decorated on the outer app.
mock.module("../container.ts", () => ({
  container: new Elysia({ name: "cms-service-container" }),
}));

// Stub the shared ticket-events publisher so tests never open a real Redis
// connection. markSlackEventSeen mirrors the real dedup semantics (first call
// for a given eventId returns true, repeats return false) using an in-memory
// Set instead of Redis SET NX.
const seenSlackEventIds = new Set<string>();
const markSlackEventSeen = mock(async (eventId: string) => {
  if (seenSlackEventIds.has(eventId)) return false;
  seenSlackEventIds.add(eventId);
  return true;
});
mock.module("../lib/ticket-events.ts", () => ({
  markSlackEventSeen,
  ticketChannel: (id: string) => `support:ticket:${id}`,
  publishTicketMessage: mock(async () => {}),
  subscribeTicket: mock(async () => async () => {}),
}));

const { slackWebhookRoutes } = await import("./slack-webhook.routes.ts");

function app(
  addSlackAgentMessage = mock(async () => ({ id: "m1" })),
  slackServiceOverride?: {
    verifySignature: (raw: string, ts: string, sig: string) => Promise<boolean>;
  },
) {
  const slackService = slackServiceOverride ?? {
    verifySignature: async (raw: string, ts: string, sig: string) =>
      sig === sign(ts, raw) && Math.abs(Date.now() / 1000 - Number(ts)) < 300,
  };
  return {
    handle: new Elysia()
      .decorate("slackService", slackService as any)
      .decorate("supportController", { addSlackAgentMessage } as any)
      .use(slackWebhookRoutes),
    addSlackAgentMessage,
  };
}

describe("POST /support/slack/events", () => {
  it("answers the url_verification challenge", async () => {
    const { handle } = app();
    const body = JSON.stringify({ type: "url_verification", challenge: "abc" });
    const res = await handle.handle(
      new Request("http://localhost/support/slack/events", { method: "POST", body }),
    );
    expect(await res.json()).toEqual({ challenge: "abc" });
  });

  it("creates an agent message for a signed threaded reply", async () => {
    const { handle, addSlackAgentMessage } = app();
    const body = JSON.stringify({
      type: "event_callback",
      event: { type: "message", text: "hi", thread_ts: "1.2", user: "U1" },
    });
    const ts = String(Math.floor(Date.now() / 1000));
    const res = await handle.handle(
      new Request("http://localhost/support/slack/events", {
        method: "POST",
        headers: { "x-slack-request-timestamp": ts, "x-slack-signature": sign(ts, body) },
        body,
      }),
    );
    expect(res.status).toBe(200);
    expect(addSlackAgentMessage).toHaveBeenCalledWith("1.2", "hi", "U1");
  });

  it("ignores a bot-authored message (no agent message created)", async () => {
    const { handle, addSlackAgentMessage } = app();
    const body = JSON.stringify({
      type: "event_callback",
      event: { type: "message", text: "x", thread_ts: "1.2", bot_id: "B1" },
    });
    const ts = String(Math.floor(Date.now() / 1000));
    await handle.handle(
      new Request("http://localhost/support/slack/events", {
        method: "POST",
        headers: { "x-slack-request-timestamp": ts, "x-slack-signature": sign(ts, body) },
        body,
      }),
    );
    expect(addSlackAgentMessage).not.toHaveBeenCalled();
  });

  it("401s on a bad signature", async () => {
    const { handle } = app();
    const body = JSON.stringify({
      type: "event_callback",
      event: { type: "message", text: "x", thread_ts: "1.2" },
    });
    const ts = String(Math.floor(Date.now() / 1000));
    const res = await handle.handle(
      new Request("http://localhost/support/slack/events", {
        method: "POST",
        headers: { "x-slack-request-timestamp": ts, "x-slack-signature": "v0=deadbeef" },
        body,
      }),
    );
    expect(res.status).toBe(401);
  });

  it("de-dupes a retried event_id (addSlackAgentMessage called once, both 200)", async () => {
    const { handle, addSlackAgentMessage } = app();
    const body = JSON.stringify({
      type: "event_callback",
      event_id: "Ev0RETRY1",
      event: { type: "message", text: "hi again", thread_ts: "1.2", user: "U1" },
    });
    const ts = String(Math.floor(Date.now() / 1000));
    const req = () =>
      new Request("http://localhost/support/slack/events", {
        method: "POST",
        headers: { "x-slack-request-timestamp": ts, "x-slack-signature": sign(ts, body) },
        body,
      });

    const first = await handle.handle(req());
    const second = await handle.handle(req());

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(addSlackAgentMessage).toHaveBeenCalledTimes(1);
  });

  it("503s when verifySignature throws (DB read hiccup), instead of an unhandled 500", async () => {
    const { handle, addSlackAgentMessage } = app(undefined, {
      verifySignature: async () => {
        throw new Error("settings.get() DB blip");
      },
    });
    const body = JSON.stringify({
      type: "event_callback",
      event: { type: "message", text: "x", thread_ts: "1.2" },
    });
    const ts = String(Math.floor(Date.now() / 1000));
    const res = await handle.handle(
      new Request("http://localhost/support/slack/events", {
        method: "POST",
        headers: { "x-slack-request-timestamp": ts, "x-slack-signature": sign(ts, body) },
        body,
      }),
    );
    expect(res.status).toBe(503);
    expect(addSlackAgentMessage).not.toHaveBeenCalled();
  });
});
