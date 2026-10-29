import { AppDataSource, SiteSetting } from "@materialhub/database";

export interface ProductAiSettings {
  enabled: boolean;
  provider: "qwen";
  base_url: string;
  model: string;
  prompt: string;
  timeout_ms: number;
  api_key: string;
}

export type PublicProductAiSettings = Omit<ProductAiSettings, "api_key"> & {
  api_key_set: boolean;
  api_key_preview: string | null;
  env_key_set: boolean;
};

type SiteSettingRepo = {
  findOne: (args: { where: { key: string } }) => Promise<{ value?: string | null } | null>;
  upsert: (row: Record<string, unknown>, options: unknown) => Promise<unknown>;
};

export const PRODUCT_AI_SETTINGS_KEY = "ai_product_content";

const DEFAULT_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
const DEFAULT_MODEL = "qwen-plus";
const DEFAULT_TIMEOUT_MS = 90000;
const DEFAULT_PROMPT =
  "Improve product copy for a UAE ecommerce catalog, suggest safe descriptive attributes, and translate product content to Arabic. Preserve factual claims and return strict JSON only.";

function nonEmpty(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function maskKey(raw: string): string | null {
  if (!raw) return null;
  return `\u2022\u2022\u2022\u2022${raw.slice(-4)}`;
}

export class ProductAiSettingsRepository {
  constructor(private readonly injectedRepo?: SiteSettingRepo) {}

  private get repo(): SiteSettingRepo {
    return (this.injectedRepo ?? AppDataSource.getRepository(SiteSetting)) as SiteSettingRepo;
  }

  async get(): Promise<ProductAiSettings> {
    const row = await this.repo.findOne({ where: { key: PRODUCT_AI_SETTINGS_KEY } });
    const parsed = row?.value ? (JSON.parse(row.value) as Partial<ProductAiSettings>) : {};

    return {
      enabled: parsed.enabled ?? false,
      provider: "qwen",
      base_url: nonEmpty(parsed.base_url, DEFAULT_BASE_URL),
      model: nonEmpty(parsed.model, DEFAULT_MODEL),
      prompt: nonEmpty(parsed.prompt, DEFAULT_PROMPT),
      timeout_ms: parsed.timeout_ms ?? DEFAULT_TIMEOUT_MS,
      api_key: parsed.api_key ?? "",
    };
  }

  async getPublic(): Promise<PublicProductAiSettings> {
    const { api_key, ...settings } = await this.get();
    return {
      ...settings,
      api_key_set: api_key.length > 0,
      api_key_preview: maskKey(api_key),
      env_key_set: Boolean(process.env.QWEN_API_KEY),
    };
  }

  async update(partial: Partial<ProductAiSettings>, updatedBy: string): Promise<ProductAiSettings> {
    const current = await this.get();
    const next: ProductAiSettings = {
      ...current,
      ...partial,
      provider: "qwen",
      base_url: nonEmpty(partial.base_url, current.base_url),
      model: nonEmpty(partial.model, current.model),
      prompt: nonEmpty(partial.prompt, current.prompt),
      timeout_ms: partial.timeout_ms ?? current.timeout_ms,
      api_key: partial.api_key ?? current.api_key,
    };

    await this.repo.upsert(
      {
        key: PRODUCT_AI_SETTINGS_KEY,
        value: JSON.stringify(next),
        value_type: "json",
        group: "ai",
        description: "AI product content enhancement configuration",
        updated_by: updatedBy,
      },
      { conflictPaths: ["key"], indexPredicate: "deleted_at IS NULL" },
    );

    return next;
  }
}
