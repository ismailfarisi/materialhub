import type { AttributeFilterInput } from "../search/search.interface.ts";

interface AttrForParsing {
  id: string;
  slug: string;
  filter_input_type: string | null;
  values: Array<{ id: string; slug: string }>;
}

export function parseAttributeParams(
  query: Record<string, string | undefined>,
  attributes: AttrForParsing[],
): AttributeFilterInput[] {
  const bySlug = new Map(attributes.map((a) => [a.slug, a]));
  const out: AttributeFilterInput[] = [];

  for (const [key, raw] of Object.entries(query)) {
    if (!raw) continue;
    const attr = bySlug.get(key);
    if (!attr || !attr.filter_input_type) continue;

    switch (attr.filter_input_type) {
      case "checkbox":
      case "color_swatch": {
        const slugs = raw.split(",").filter(Boolean);
        const valueIds = slugs
          .map((s) => attr.values.find((v) => v.slug === s)?.id)
          .filter((id): id is string => !!id);
        if (valueIds.length) {
          out.push({ kind: "checkbox", attributeId: attr.id, valueIds });
        }
        break;
      }
      case "radio": {
        const match = attr.values.find((v) => v.slug === raw);
        if (match) out.push({ kind: "radio", attributeId: attr.id, valueId: match.id });
        break;
      }
      case "range": {
        const [lo, hi] = raw.split("-");
        const min = lo ? Number(lo) : undefined;
        const max = hi ? Number(hi) : undefined;
        if (min != null || max != null) {
          out.push({ kind: "range", attributeSlug: attr.slug, min, max });
        }
        break;
      }
      case "toggle":
        if (raw === "true") out.push({ kind: "toggle", attributeSlug: attr.slug, value: true });
        break;
    }
  }

  return out;
}
