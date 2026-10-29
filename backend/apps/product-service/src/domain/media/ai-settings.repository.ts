import { AppDataSource, SiteSetting } from "@materialhub/database";

export interface AiEnhanceSettings {
  enabled: boolean;
  model: string;
  prompt: string;
  per_vendor_monthly_cap: number;
  per_vendor_per_minute_cap: number;
  /**
   * Gemini API key. Persisted in site_settings JSON blob. Never returned to
   * the client by the admin GET endpoint — see `PublicAiEnhanceSettings`.
   * Empty string means "not configured here; fall back to env var".
   */
  api_key: string;
}

export type PublicAiEnhanceSettings = Omit<AiEnhanceSettings, "api_key"> & {
  /** True if an api_key is configured in the DB (independent of env-var fallback). */
  api_key_set: boolean;
  /** Last 4 characters of the stored key for visual confirmation, or null. */
  api_key_preview: string | null;
};

const KEY = "ai_image_enhance";

function maskKey(raw: string): string | null {
  if (!raw) return null;
  const tail = raw.slice(-4);
  return `••••${tail}`;
}

export class AiSettingsRepository {
  private get repo() {
    return AppDataSource.getRepository(SiteSetting);
  }

  async get(): Promise<AiEnhanceSettings> {
    const row = await this.repo.findOne({ where: { key: KEY } });
    if (!row) {
      return {
        enabled: false,
        model: "gemini-2.5-flash-image",
        prompt: "",
        per_vendor_monthly_cap: 200,
        per_vendor_per_minute_cap: 5,
        api_key: "",
      };
    }
    const parsed = JSON.parse(row.value) as Partial<AiEnhanceSettings>;
    return {
      enabled: parsed.enabled ?? false,
      model: parsed.model ?? "gemini-2.5-flash-image",
      prompt: parsed.prompt ?? "",
      per_vendor_monthly_cap: parsed.per_vendor_monthly_cap ?? 200,
      per_vendor_per_minute_cap: parsed.per_vendor_per_minute_cap ?? 5,
      api_key: parsed.api_key ?? "",
    };
  }

  async getPublic(): Promise<PublicAiEnhanceSettings> {
    const { api_key, ...rest } = await this.get();
    return {
      ...rest,
      api_key_set: api_key.length > 0,
      api_key_preview: maskKey(api_key),
    };
  }

  async update(partial: Partial<AiEnhanceSettings>, updatedBy: string): Promise<AiEnhanceSettings> {
    const current = await this.get();
    const next: AiEnhanceSettings = { ...current, ...partial };
    await this.repo.upsert(
      {
        key: KEY,
        value: JSON.stringify(next),
        value_type: "json",
        group: "ai",
        description: "AI image enhance configuration",
        updated_by: updatedBy,
      },
      // `site_settings` has only a PARTIAL unique index on key
      // (`uq_site_settings_key_active ... WHERE deleted_at IS NULL`). A bare
      // ON CONFLICT ("key") does not match a partial index — Postgres rejects it
      // with "no unique or exclusion constraint matching the ON CONFLICT
      // specification". indexPredicate emits the matching WHERE clause.
      { conflictPaths: ["key"], indexPredicate: "deleted_at IS NULL" },
    );
    return next;
  }
}
