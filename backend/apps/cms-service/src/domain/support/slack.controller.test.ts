import { describe, expect, it, mock } from "bun:test";
import type { PublicSlackConfig, SlackConfigPatch } from "./slack-settings.repository.ts";
import { SlackController } from "./slack.controller.ts";

const MASKED: PublicSlackConfig = {
  enabled: true,
  channel_id: "C123",
  bot_token_set: true,
  bot_token_preview: "••••1234",
  signing_secret_set: true,
};

function fakeSettings(pub: PublicSlackConfig = MASKED) {
  return {
    getPublic: mock(async () => pub),
    // FIX A: update() returns the FULL DECRYPTED config in real usage — the
    // fake mirrors that contract so the controller's discard-and-re-read
    // behaviour is actually exercised.
    update: mock(async (_patch: SlackConfigPatch, _userId: string) => ({
      enabled: true,
      channel_id: "C123",
      bot_token: "xoxb-raw-secret",
      signing_secret: "raw-signing-secret",
    })),
  };
}

function fakeSlack(result: { ok: boolean; team?: string; error?: string }) {
  return {
    testConnection: mock(async () => result),
  };
}

describe("SlackController", () => {
  it("getPublic passes through the masked shape from the repository", async () => {
    const settings = fakeSettings();
    const slack = fakeSlack({ ok: true });
    const controller = new SlackController(settings as any, slack as any);

    const result = await controller.getPublic();

    expect(settings.getPublic.mock.calls.length).toBe(1);
    expect(result).toEqual(MASKED);
  });

  it("update() writes the patch via the repo and returns the repo's masked getPublic() result", async () => {
    const settings = fakeSettings();
    const slack = fakeSlack({ ok: true });
    const controller = new SlackController(settings as any, slack as any);

    const patch = { bot_token: "xoxb-raw-secret", signing_secret: "raw-signing-secret" };
    const result = await controller.update(patch, "user-1");

    expect(settings.update.mock.calls[0]![0]).toBe(patch);
    expect(settings.update.mock.calls[0]![1]).toBe("user-1");
    expect(settings.getPublic.mock.calls.length).toBe(1);

    expect(result).toEqual(MASKED);
    expect(result.bot_token_set).toBe(true);
    expect(result.bot_token_preview).toBe("••••1234");
    expect(result.signing_secret_set).toBe(true);
    expect((result as any).bot_token).toBeUndefined();
    expect((result as any).signing_secret).toBeUndefined();
    expect(Object.keys(result)).not.toContain("bot_token");
    expect(Object.keys(result)).not.toContain("signing_secret");
  });

  it("test() delegates to SlackService.testConnection()", async () => {
    const settings = fakeSettings();
    const slack = fakeSlack({ ok: true, team: "MaterialHub" });
    const controller = new SlackController(settings as any, slack as any);

    const result = await controller.test();

    expect(slack.testConnection.mock.calls.length).toBe(1);
    expect(result).toEqual({ ok: true, team: "MaterialHub" });
  });
});
