// Canonical list of the 7 UAE emirates. `value` is the stored string (maps to
// the entity `state` column); `labelKey` resolves against the "emirates" i18n
// namespace for the localized option label shown in the dropdown.
export const UAE_EMIRATES = [
  { value: "Abu Dhabi", labelKey: "abu_dhabi" },
  { value: "Dubai", labelKey: "dubai" },
  { value: "Sharjah", labelKey: "sharjah" },
  { value: "Ajman", labelKey: "ajman" },
  { value: "Umm Al Quwain", labelKey: "umm_al_quwain" },
  { value: "Ras Al Khaimah", labelKey: "ras_al_khaimah" },
  { value: "Fujairah", labelKey: "fujairah" },
] as const;

export type UaeEmirateValue = (typeof UAE_EMIRATES)[number]["value"];
