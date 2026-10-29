import type { SlackConfigPatch, SlackSettingsRepository } from "./slack-settings.repository.ts";
import type { SlackService } from "./slack.service.ts";

export class SlackController {
  constructor(
    private readonly settings: SlackSettingsRepository,
    private readonly slack: SlackService,
  ) {}

  getPublic() {
    return this.settings.getPublic();
  }

  async update(patch: SlackConfigPatch, userId: string) {
    // FIX A: settings.update() returns the FULL DECRYPTED SlackConfig (raw
    // bot_token/signing_secret) — that is its internal contract for the
    // relay code path. The admin API must never echo raw secrets back to
    // the client, so we discard that return value and re-read the masked
    // public shape instead.
    await this.settings.update(patch, userId);
    return this.settings.getPublic();
  }

  test() {
    return this.slack.testConnection();
  }
}
