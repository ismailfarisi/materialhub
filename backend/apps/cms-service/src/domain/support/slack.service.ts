import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupportTicket } from "@materialhub/database";
import type { SlackSettingsRepository } from "./slack-settings.repository.ts";

const MAX_SIGNATURE_AGE_SECONDS = 300;
const SLACK_API = "https://slack.com/api";

export class SlackService {
  constructor(private readonly settings: SlackSettingsRepository) {}

  async isEnabled(): Promise<boolean> {
    const c = await this.settings.get();
    return Boolean(c.enabled && c.bot_token && c.channel_id);
  }

  async postToThread(
    ticket: Pick<
      SupportTicket,
      "ticket_number" | "subject" | "slack_channel_id" | "slack_thread_ts"
    >,
    text: string,
    authorLabel: string,
  ): Promise<{ channel: string; ts: string } | null> {
    const c = await this.settings.get();
    if (!c.enabled || !c.bot_token || !c.channel_id) return null;

    const isFirst = !ticket.slack_thread_ts;
    const body = isFirst
      ? {
          channel: c.channel_id,
          text: `*${ticket.ticket_number} — ${ticket.subject}*\n${authorLabel} ${text}`,
        }
      : {
          channel: ticket.slack_channel_id ?? c.channel_id,
          thread_ts: ticket.slack_thread_ts,
          text: `${authorLabel} ${text}`,
        };

    try {
      const res = await fetch(`${SLACK_API}/chat.postMessage`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${c.bot_token}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as {
        ok: boolean;
        ts?: string;
        channel?: string;
        error?: string;
      };
      if (!json.ok || !json.ts || !json.channel) {
        // Relay stays best-effort, but a silent drop is undiagnosable in prod.
        console.warn(
          `[slack] chat.postMessage failed for ${ticket.ticket_number}: ${json.error ?? "unknown_error"}`,
        );
        return null;
      }
      return { channel: json.channel, ts: json.ts };
    } catch (e) {
      console.warn(
        `[slack] chat.postMessage threw for ${ticket.ticket_number}: ${e instanceof Error ? e.message : "request_failed"}`,
      );
      return null;
    }
  }

  async testConnection(): Promise<{ ok: boolean; team?: string; error?: string }> {
    const c = await this.settings.get();
    if (!c.bot_token) return { ok: false, error: "no_bot_token" };
    try {
      const res = await fetch(`${SLACK_API}/auth.test`, {
        method: "POST",
        headers: { Authorization: `Bearer ${c.bot_token}` },
      });
      const json = (await res.json()) as { ok: boolean; team?: string; error?: string };
      return json.ok ? { ok: true, team: json.team } : { ok: false, error: json.error };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "request_failed" };
    }
  }

  async verifySignature(rawBody: string, timestamp: string, signature: string): Promise<boolean> {
    const c = await this.settings.get();
    if (!c.signing_secret) return false;
    const ts = Number(timestamp);
    if (!ts || Number.isNaN(ts)) return false;
    if (Math.abs(Date.now() / 1000 - ts) > MAX_SIGNATURE_AGE_SECONDS) return false;

    const expected = `v0=${createHmac("sha256", c.signing_secret).update(`v0:${timestamp}:${rawBody}`).digest("hex")}`;
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(signature, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }
}
