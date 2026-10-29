import { Elysia } from "elysia";
import { container } from "../container.ts";
import { markSlackEventSeen } from "../lib/ticket-events.ts";

export const slackWebhookRoutes = new Elysia({ prefix: "/support/slack" }).use(container).post(
  "/events",
  async ({ body, headers, slackService, supportController, set }: any) => {
    const rawBody: string = typeof body === "string" ? body : String(body ?? "");

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      set.status = 400;
      return { statusCode: 400, error: "invalid_json" };
    }

    // URL verification handshake (Slack sends this when you save the Events URL).
    if (payload.type === "url_verification") {
      return { challenge: payload.challenge };
    }

    const ts = headers["x-slack-request-timestamp"] as string | undefined;
    const sig = headers["x-slack-signature"] as string | undefined;

    let verified: boolean;
    try {
      verified = !!ts && !!sig && (await slackService.verifySignature(rawBody, ts, sig));
    } catch {
      // verifySignature threw (e.g. its settings.get() DB read hiccuped) — this is
      // an infra error, not a genuine bad signature. Return 503 so Slack retries
      // later instead of dropping the event (200) or surfacing an unhandled 500.
      set.status = 503;
      return { statusCode: 503, error: "signature_verification_unavailable" };
    }
    if (!verified) {
      set.status = 401;
      return { statusCode: 401, error: "invalid_signature" };
    }

    if (payload.type === "event_callback" && payload.event?.type === "message") {
      const e = payload.event;
      // Ignore our own bot posts, edits/joins (subtype), and non-thread messages.
      if (!e.bot_id && !e.subtype && e.thread_ts && e.text) {
        // De-dupe Slack's at-least-once retries: a replayed event_id must not
        // create a second customer-visible agent message. No event_id (shouldn't
        // happen in practice) falls back to processing as before.
        const eventId: string | undefined = payload.event_id;
        const isNewEvent = eventId ? await markSlackEventSeen(eventId) : true;
        if (isNewEvent) {
          try {
            await supportController.addSlackAgentMessage(e.thread_ts, e.text, e.user ?? "");
          } catch {
            /* best-effort; Slack retries on non-2xx so we still 200 */
          }
        }
      }
    }

    return { statusCode: 200 };
  },
  { parse: ["text"] },
);
