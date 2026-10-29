"use client";

import { useTranslations } from "next-intl";

interface VariantAttribute {
  name: string;
  values: Array<{
    value: string;
    color_hex?: string;
    swatch_image_url?: string;
    available: boolean;
  }>;
}

interface Props {
  attributes: VariantAttribute[];
  selected: Record<string, string>;
  onSelect: (attribute: string, value: string) => void;
}

export function VariantSelector({ attributes, selected, onSelect }: Props) {
  const t = useTranslations("product");

  return (
    <div className="space-y-4">
      {attributes.map((attr) => (
        <div key={attr.name}>
          <label className="text-sm font-medium">
            {t("selectVariant", { name: attr.name })}:{" "}
            <span className="font-normal text-muted-foreground">
              {selected[attr.name] || "—"}
            </span>
          </label>
          <div className="flex gap-2 mt-2 flex-wrap">
            {attr.values.map((val) => {
              const isSelected = selected[attr.name] === val.value;
              const isColor = !!val.color_hex || !!val.swatch_image_url;

              if (isColor) {
                return (
                  <button
                    key={val.value}
                    onClick={() => val.available && onSelect(attr.name, val.value)}
                    disabled={!val.available}
                    className={`h-8 w-8 rounded-full border-2 relative ${
                      isSelected ? "border-copper ring-2 ring-copper/30" : "border-border"
                    } ${!val.available ? "opacity-30 cursor-not-allowed" : ""}`}
                    style={{
                      backgroundColor: val.color_hex || undefined,
                      backgroundImage: val.swatch_image_url
                        ? `url(${val.swatch_image_url})`
                        : undefined,
                      backgroundSize: "cover",
                    }}
                    title={val.value}
                  >
                    {!val.available && (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="block w-full h-px bg-destructive rotate-45" />
                      </span>
                    )}
                  </button>
                );
              }

              return (
                <button
                  key={val.value}
                  onClick={() => val.available && onSelect(attr.name, val.value)}
                  disabled={!val.available}
                  className={`px-3 py-1 border rounded text-sm ${
                    isSelected
                      ? "border-copper bg-copper/10 text-copper"
                      : "border-border"
                  } ${!val.available ? "opacity-30 cursor-not-allowed line-through" : ""}`}
                >
                  {val.value}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
