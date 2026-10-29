import { ServiceUnavailableError } from "@materialhub/plugins";
import type { ProductAiSettingsRepository } from "./product-ai-settings.repository.ts";

export interface ProductAiEnhanceDraft {
  product: {
    name?: string;
    description?: string;
    ingredients?: string;
    usage_instructions?: string;
    meta_title?: string;
    meta_description?: string;
    tags?: string[];
  };
  translations: Array<{
    locale: "ar";
    name: string;
    description?: string | null;
    ingredients?: string | null;
    usage_instructions?: string | null;
    meta_title?: string | null;
    meta_description?: string | null;
  }>;
  attributes: Array<{
    attribute_id: string;
    value_id?: string | null;
    text_value?: string | null;
  }>;
  warnings?: string[];
}

type ProductAiCategoryAttribute = {
  attribute_id?: string | null;
  is_required?: boolean | null;
  attribute?: {
    id?: string | null;
    name?: string | null;
    type?: string | null;
    is_variant?: boolean | null;
    values?: Array<{
      id?: string | null;
      value?: string | null;
      display_value?: string | null;
    }>;
  } | null;
};

export class ProductAiEnhanceService {
  constructor(
    private readonly settings: Pick<ProductAiSettingsRepository, "get">,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private resolveKey(configuredKey: string): string {
    const key = configuredKey.trim() || process.env.QWEN_API_KEY?.trim() || "";
    if (!key) throw new ServiceUnavailableError("Qwen API key not configured");
    return key;
  }

  // biome-ignore lint/suspicious/noExplicitAny: database entities are highly dynamic
  private buildContext(product: any) {
    return {
      id: product.id,
      name: product.name,
      description: product.description,
      ingredients: product.ingredients,
      usage_instructions: product.usage_instructions,
      meta_title: product.meta_title,
      meta_description: product.meta_description,
      tags: product.tags ?? [],
      category: product.category ? { id: product.category.id, name: product.category.name } : null,
      brand: product.brand ? { id: product.brand.id, name: product.brand.name } : null,
      existing_translations: product.translations ?? [],
      // All descriptive attributes available for the category, not just values
      // already selected on the product. This lets the model choose from valid
      // option ids when completing missing product attributes.
      category_attributes: ((product.categoryAttributes ?? []) as ProductAiCategoryAttribute[]).map(
        (row) => ({
          attribute_id: row.attribute_id ?? row.attribute?.id,
          name: row.attribute?.name,
          type: row.attribute?.type,
          is_variant: row.attribute?.is_variant ?? false,
          is_required: row.is_required ?? false,
          allowed_values: (row.attribute?.values ?? []).map((value) => ({
            id: value.id,
            value: value.value,
            display_value: value.display_value,
          })),
        }),
      ),
      // biome-ignore lint/suspicious/noExplicitAny: database relation rows
      attributes: (product.attributeValues ?? []).map((row: any) => ({
        attribute_id: row.attribute_id,
        current_value_id: row.attribute_value_id ?? row.attributeValue?.id ?? null,
        current_text_value: row.text_value ?? null,
        attribute: row.attribute
          ? {
              id: row.attribute.id,
              name: row.attribute.name,
              type: row.attribute.type,
              is_variant: row.attribute.is_variant,
              allowed_values: (row.attribute.values ?? []).map(
                // biome-ignore lint/suspicious/noExplicitAny: database enum values
                (value: any) => ({
                  id: value.id,
                  value: value.value,
                  display_value: value.display_value,
                }),
              ),
            }
          : null,
      })),
      // biome-ignore lint/suspicious/noExplicitAny: database image entities
      images: (product.images ?? []).slice(0, 5).map((image: any) => ({
        alt_text: image.alt_text,
        is_primary: image.is_primary,
      })),
    };
  }

  private parseDraft(raw: unknown): ProductAiEnhanceDraft {
    if (!raw || typeof raw !== "object") throw new Error("Qwen returned invalid JSON");
    const value = raw as ProductAiEnhanceDraft;
    if (!value.product || typeof value.product !== "object") {
      throw new Error("Qwen draft missing product");
    }
    if (!Array.isArray(value.translations)) {
      throw new Error("Qwen draft missing translations");
    }
    if (!value.translations.some((entry) => entry.locale === "ar" && entry.name?.trim())) {
      throw new Error("Qwen draft missing Arabic translation");
    }
    if (!Array.isArray(value.attributes)) value.attributes = [];
    if (!Array.isArray(value.warnings)) value.warnings = [];
    return value;
  }

  async generateDraft(input: {
    // biome-ignore lint/suspicious/noExplicitAny: incoming database product
    product: any;
  }): Promise<ProductAiEnhanceDraft> {
    const settings = await this.settings.get();
    if (!settings.enabled) throw new ServiceUnavailableError("Product content AI is disabled");
    const apiKey = this.resolveKey(settings.api_key);
    const baseUrl = settings.base_url.replace(/\/+$/, "");

    const response = await this.fetchImpl(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [
          {
            role: "system",
            content: `${settings.prompt}\nReturn only JSON matching { product, translations, attributes, warnings }. Use translations[0].locale = "ar".`,
          },
          {
            role: "user",
            content: JSON.stringify(this.buildContext(input.product)),
          },
        ],
        temperature: 0.3,
        max_tokens: 1800,
      }),
      signal: AbortSignal.timeout(settings.timeout_ms),
    });

    if (!response.ok) {
      throw new Error(`Qwen request failed with ${response.status}`);
    }
    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("Qwen returned no content");

    let cleaned = content.trim();
    if (cleaned.startsWith("```")) {
      const match = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
      if (match) {
        cleaned = match[1]!.trim();
      }
    }
    return this.parseDraft(JSON.parse(cleaned));
  }
}
