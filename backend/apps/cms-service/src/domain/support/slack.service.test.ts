import { describe, expect, it } from "bun:test";
import { createHmac } from "node:crypto";
import { SlackService } from "./slack.service.ts";

const SIGNING = "test-signing-secret";

function fakeRepo(overrides: Partial<any> = {}) {
  return {
    get: async () => ({
      enabled: true,
      channel_id: "C1",
      bot_token: "xoxb-t",
      signing_secret: SIGNING,
      ...overrides,
    }),
  } as any;
}

function sign(ts: string, body: string): string {
  return `v0=${createHmac("sha256", SIGNING).update(`v0:${ts}:${body}`).digest("hex")}`;
}

describe("SlackService.verifySignature", () => {
  const svc = new SlackService(fakeRepo());
  const body = '{"type":"event_callback"}';

  it("accepts a valid, fresh signature", async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    expect(await svc.verifySignature(body, ts, sign(ts, body))).toBe(true);
  });

  it("rejects a tampered body", async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    expect(await svc.verifySignature('{"x":1}', ts, sign(ts, body))).toBe(false);
  });

  it("rejects a stale timestamp (>5 min)", async () => {
    const ts = String(Math.floor(Date.now() / 1000) - 3600);
    expect(await svc.verifySignature(body, ts, sign(ts, body))).toBe(false);
  });

  it("rejects when no signing secret configured", async () => {
    const s2 = new SlackService(fakeRepo({ signing_secret: null }));
    const ts = String(Math.floor(Date.now() / 1000));
    expect(await s2.verifySignature(body, ts, sign(ts, body))).toBe(false);
  });
});
