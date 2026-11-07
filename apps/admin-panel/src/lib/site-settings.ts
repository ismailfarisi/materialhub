/**
 * Site settings are stored as text with a `value_type` (string, number,
 * integer, boolean, json); the API takes the new value as a string too.
 */
export type SettingValueType = "string" | "number" | "integer" | "boolean" | "json";

export interface SiteSettingRow {
  key: string;
  value: string;
  value_type?: string;
  group?: string | null;
  description?: string | null;
}

export function settingValueType(row: Pick<SiteSettingRow, "value_type">): SettingValueType {
  const t = row.value_type;
  return t === "number" || t === "integer" || t === "boolean" || t === "json" ? t : "string";
}

/** What the edit field starts with: JSON pretty-printed, everything else as stored. */
export function settingEditText(row: SiteSettingRow): string {
  if (settingValueType(row) === "json") {
    try {
      return JSON.stringify(JSON.parse(row.value), null, 2);
    } catch {
      return row.value;
    }
  }
  return row.value ?? "";
}

/** The string to send for an edited value, or an error to show. */
export function serializeSettingInput(
  type: SettingValueType,
  input: string,
): { ok: true; value: string } | { ok: false; error: string } {
  switch (type) {
    case "boolean":
      return input === "true" || input === "false"
        ? { ok: true, value: input }
        : { ok: false, error: "Choose on or off." };
    case "number":
      return input.trim() !== "" && Number.isFinite(Number(input))
        ? { ok: true, value: String(Number(input)) }
        : { ok: false, error: "Must be a valid number." };
    case "integer":
      return /^-?\d+$/.test(input.trim())
        ? { ok: true, value: input.trim() }
        : { ok: false, error: "Must be a whole number." };
    case "json":
      try {
        return { ok: true, value: JSON.stringify(JSON.parse(input)) };
      } catch {
        return { ok: false, error: "Invalid JSON." };
      }
    default:
      return { ok: true, value: input };
  }
}

/** Groups that have their own admin page; the generic editor links there instead. */
export const SETTING_GROUPS_WITH_PAGES: Record<string, { label: string; href: string }> = {
  ai: { label: "AI image enhance", href: "/settings/ai" },
  slack: { label: "Slack", href: "/settings/slack" },
  samples: { label: "Samples", href: "/settings/samples" },
  shipping: { label: "Shipping contribution", href: "/settings/shipping-contribution-tiers" },
};

const GROUP_LABELS: Record<string, string> = {
  general: "General",
  order: "Orders",
  cart: "Cart",
  tax: "Tax",
  vendor: "Vendors",
  commission: "Commission & payouts",
  integrations: "Integrations",
};

export function settingGroupLabel(group: string): string {
  return GROUP_LABELS[group] ?? group.charAt(0).toUpperCase() + group.slice(1).replace(/[_-]+/g, " ");
}

/** Tabs for the groups that actually have settings, general first. */
export function settingGroupTabs(rows: SiteSettingRow[]): Array<{ key: string; label: string }> {
  const groups = new Set<string>();
  for (const r of rows) {
    const g = r.group || "general";
    if (!SETTING_GROUPS_WITH_PAGES[g]) groups.add(g);
  }
  return [...groups]
    .sort((a, b) => (a === "general" ? -1 : b === "general" ? 1 : settingGroupLabel(a).localeCompare(settingGroupLabel(b))))
    .map((key) => ({ key, label: settingGroupLabel(key) }));
}
