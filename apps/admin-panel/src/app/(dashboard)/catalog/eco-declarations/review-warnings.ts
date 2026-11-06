import type { EcoDeclaration } from "@/lib/queries/eco-declarations";

const BAN_BAG_MIN_MICRONS = 50;

/** Flags where the vendor's own attributes contradict the declaration. */
export function reviewWarnings(row: Pick<EcoDeclaration, "eco_attributes">): string[] {
  const warnings: string[] = [];
  const attr = (slug: string) => row.eco_attributes.find((a) => a.slug === slug);
  if (attr("plastic-free")?.values.includes("No")) {
    warnings.push("The listing's own attributes say it is not plastic-free.");
  }
  const lining = attr("material-composition")?.values.filter((v) => /lining/i.test(v)) ?? [];
  if (lining.length) {
    warnings.push(`Material composition includes ${lining.join(", ")}.`);
  }
  const microns = Number(attr("bag-thickness-microns")?.values[0]);
  if (Number.isFinite(microns) && microns > 0 && microns < BAN_BAG_MIN_MICRONS) {
    warnings.push(
      `Bag thickness is ${microns} microns; single-use bags under ${BAN_BAG_MIN_MICRONS} microns are covered by the ban.`,
    );
  }
  if (row.eco_attributes.length === 0) {
    warnings.push("No compliance attributes are filled in on this listing.");
  }
  return warnings;
}
