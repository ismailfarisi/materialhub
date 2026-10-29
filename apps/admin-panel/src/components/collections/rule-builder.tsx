"use client";

import { useState } from "react";
import { Input, Switch } from "@materialhub/ui";
import { X } from "lucide-react";
import { EntityMultiCombobox } from "@/components/ui/entity-combobox";
import {
  searchAdminBrandSlugsLookup,
  getAdminBrandSlugLookup,
  searchAdminCategorySlugsLookup,
  getAdminCategorySlugLookup,
} from "@/lib/queries/lookups";
import type { CollectionRules } from "@/lib/queries/collections";

interface RuleBuilderProps {
  value: CollectionRules | null;
  onChange: (rules: CollectionRules | null) => void;
}

const filsToAed = (f?: number) => (f == null ? "" : String(f / 100));
const aedToFils = (a: string) => (a.trim() === "" ? undefined : Math.round(Number(a) * 100));

export function RuleBuilder({ value, onChange }: RuleBuilderProps) {
  const c = value?.conditions ?? {};
  const [tagInput, setTagInput] = useState("");

  function emit(next: NonNullable<CollectionRules>["conditions"]) {
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(next)) {
      if (v == null) continue;
      if (Array.isArray(v) && v.length === 0) continue;
      cleaned[k] = v;
    }
    if (Object.keys(cleaned).length === 0) {
      onChange(null);
    } else {
      onChange({ v: 1, match: "all", conditions: cleaned });
    }
  }

  const tags = c.tags ?? [];

  function addTag() {
    const t = tagInput.trim();
    if (!t || tags.includes(t)) {
      setTagInput("");
      return;
    }
    emit({ ...c, tags: [...tags, t] });
    setTagInput("");
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-cacao mb-1">Categories</label>
        <EntityMultiCombobox
          values={c.category_slugs ?? []}
          onChange={(slugs) => emit({ ...c, category_slugs: slugs })}
          search={searchAdminCategorySlugsLookup}
          getById={getAdminCategorySlugLookup}
          placeholder="Search categories…"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-cacao mb-1">Brands</label>
        <EntityMultiCombobox
          values={c.brand_slugs ?? []}
          onChange={(slugs) => emit({ ...c, brand_slugs: slugs })}
          search={searchAdminBrandSlugsLookup}
          getById={getAdminBrandSlugLookup}
          placeholder="Search brands…"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-cacao mb-1">Tags</label>
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          {tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
            >
              {t}
              <button
                type="button"
                onClick={() => emit({ ...c, tags: tags.filter((x) => x !== t) })}
                aria-label={`Remove ${t}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
        <Input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addTag();
            }
          }}
          onBlur={addTag}
          placeholder="Type a tag and press Enter"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-cacao mb-1">Min price (AED)</label>
          <Input
            type="number"
            defaultValue={filsToAed(c.price_min)}
            onBlur={(e) => emit({ ...c, price_min: aedToFils(e.target.value) })}
            placeholder="0"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-cacao mb-1">Max price (AED)</label>
          <Input
            type="number"
            defaultValue={filsToAed(c.price_max)}
            onBlur={(e) => emit({ ...c, price_max: aedToFils(e.target.value) })}
            placeholder="No max"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-cacao">
        <Switch
          checked={c.in_stock ?? false}
          onCheckedChange={(v: boolean) => emit({ ...c, in_stock: v || undefined })}
        />
        In stock only
      </label>
    </div>
  );
}
