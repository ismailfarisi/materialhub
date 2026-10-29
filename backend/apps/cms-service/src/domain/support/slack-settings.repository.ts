import { config } from "@materialhub/config";
import { AppDataSource, SiteSetting } from "@materialhub/database";
import { EncryptionService } from "@materialhub/utils";

export type SlackConfig = {
  enabled: boolean;
  channel_id: string | null;
  bot_token: string | null;
  signing_secret: string | null;
};

export type PublicSlackConfig = {
  enabled: boolean;
  channel_id: string | null;
  bot_token_set: boolean;
  bot_token_preview: string | null;
  signing_secret_set: boolean;
};

export type SlackConfigPatch = Partial<SlackConfig>;

const KEY = "slack_support";

// Stored JSON shape: secrets are ciphertext (or empty string).
type StoredShape = {
  enabled?: boolean;
  channel_id?: string | null;
  bot_token_enc?: string;
  signing_secret_enc?: string;
};

export class SlackSettingsRepository {
  private readonly enc: EncryptionService;

  constructor(encryptionKey: string = config.encryption.key) {
    this.enc = new EncryptionService(encryptionKey);
  }

  private get repo() {
    return AppDataSource.getRepository(SiteSetting);
  }

  private async readStored(): Promise<StoredShape> {
    const row = await this.repo.findOne({ where: { key: KEY } });
    if (!row) return {};
    try {
      return JSON.parse(row.value) as StoredShape;
    } catch {
      return {};
    }
  }

  private decryptOrEmpty(ciphertext?: string): string {
    if (!ciphertext) return "";
    try {
      return this.enc.decrypt(ciphertext);
    } catch {
      return "";
    }
  }

  async get(): Promise<SlackConfig> {
    const s = await this.readStored();
    return {
      enabled: s.enabled ?? false,
      channel_id: s.channel_id ?? null,
      bot_token: this.decryptOrEmpty(s.bot_token_enc) || null,
      signing_secret: this.decryptOrEmpty(s.signing_secret_enc) || null,
    };
  }

  async getPublic(): Promise<PublicSlackConfig> {
    const s = await this.readStored();
    const botToken = this.decryptOrEmpty(s.bot_token_enc);
    return {
      enabled: s.enabled ?? false,
      channel_id: s.channel_id ?? null,
      bot_token_set: botToken.length > 0,
      bot_token_preview: botToken ? `••••${botToken.slice(-4)}` : null,
      signing_secret_set: this.decryptOrEmpty(s.signing_secret_enc).length > 0,
    };
  }

  async update(partial: SlackConfigPatch, updatedBy: string): Promise<SlackConfig> {
    const s = await this.readStored();
    const next: StoredShape = {
      enabled: partial.enabled ?? s.enabled ?? false,
      channel_id: partial.channel_id !== undefined ? partial.channel_id : (s.channel_id ?? null),
      bot_token_enc: s.bot_token_enc,
      signing_secret_enc: s.signing_secret_enc,
    };
    // Only re-encrypt a secret when a new non-empty value is supplied.
    if (partial.bot_token) next.bot_token_enc = this.enc.encrypt(partial.bot_token);
    if (partial.signing_secret) next.signing_secret_enc = this.enc.encrypt(partial.signing_secret);

    await this.repo.upsert(
      {
        key: KEY,
        value: JSON.stringify(next),
        value_type: "json",
        group: "slack",
        description: "Slack support relay configuration",
        updated_by: updatedBy,
      },
      // `site_settings` has only a PARTIAL unique index on key
      // (WHERE deleted_at IS NULL). A bare ON CONFLICT ("key") does not match
      // a partial index — indexPredicate emits the matching WHERE clause.
      { conflictPaths: ["key"], indexPredicate: "deleted_at IS NULL" },
    );
    return this.get();
  }
}
