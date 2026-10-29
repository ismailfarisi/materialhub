import { describe, expect, it } from "bun:test";
import { SlackSettingsRepository } from "./slack-settings.repository.ts";

const TEST_KEY = "0".repeat(64); // 32 bytes hex

function makeRepo(rowValue: string | null) {
  const repo = new SlackSettingsRepository(TEST_KEY);
  let stored = rowValue;
  const fake = {
    findOne: async () => (stored == null ? null : { key: "slack_support", value: stored }),
    upsert: async (entity: any) => {
      stored = entity.value;
    },
  };
  Object.defineProperty(repo, "repo", { get: () => fake });
  return { repo, getStored: () => stored };
}

describe("SlackSettingsRepository", () => {
  it("getPublic masks secrets and never returns raw values", async () => {
    // A row whose bot_token is stored encrypted — build it via update first.
    const { repo } = makeRepo(null);
    await repo.update(
      {
        enabled: true,
        channel_id: "C123",
        bot_token: "xoxb-secret-1234",
        signing_secret: "ss-secret-9999",
      },
      "u1",
    );
    const pub = await repo.getPublic();
    expect(pub.enabled).toBe(true);
    expect(pub.channel_id).toBe("C123");
    expect(pub.bot_token_set).toBe(true);
    expect(pub.bot_token_preview).toBe("••••1234");
    expect(pub.signing_secret_set).toBe(true);
    expect((pub as any).bot_token).toBeUndefined();
    expect((pub as any).signing_secret).toBeUndefined();
  });

  it("get round-trips decrypted secrets", async () => {
    const { repo } = makeRepo(null);
    await repo.update(
      { bot_token: "xoxb-abc", signing_secret: "ss-xyz", channel_id: "C1", enabled: false },
      "u1",
    );
    const cfg = await repo.get();
    expect(cfg.bot_token).toBe("xoxb-abc");
    expect(cfg.signing_secret).toBe("ss-xyz");
  });

  it("update keeps existing secret when the field is omitted or empty", async () => {
    const { repo } = makeRepo(null);
    await repo.update({ bot_token: "xoxb-keep", signing_secret: "ss-keep" }, "u1");
    await repo.update({ enabled: true }, "u1"); // no secrets supplied
    const cfg = await repo.get();
    expect(cfg.bot_token).toBe("xoxb-keep");
    expect(cfg.signing_secret).toBe("ss-keep");
    expect(cfg.enabled).toBe(true);
  });

  it("stores secrets encrypted (not plaintext) at rest", async () => {
    const { repo, getStored } = makeRepo(null);
    await repo.update({ bot_token: "xoxb-plaintext-check" }, "u1");
    expect(getStored()).not.toContain("xoxb-plaintext-check");
  });
});
