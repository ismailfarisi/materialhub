import type { ProductExportMetadata } from "@/lib/queries/bulk";

type ProductExportPresetConfig = ProductExportMetadata["presets"][number];

export function getEffectiveFieldGroups(
  selectedGroups: string[],
  preset: ProductExportPresetConfig | undefined,
) {
  return selectedGroups.length > 0 ? selectedGroups : (preset?.defaultFieldGroups ?? []);
}

export function toggleFieldGroup(
  selectedGroups: string[],
  preset: ProductExportPresetConfig | undefined,
  group: string,
) {
  const baseGroups = getEffectiveFieldGroups(selectedGroups, preset);
  return baseGroups.includes(group)
    ? baseGroups.filter((key) => key !== group)
    : [...baseGroups, group];
}
