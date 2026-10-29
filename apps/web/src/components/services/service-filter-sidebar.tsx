"use client";

import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import type { ServiceFacetConfig, ServiceFilterDraft } from "./service-filter-state";

const VISIT_OPTIONS = [
  { value: "at_premises", labelKey: "visitAtPremises" },
  { value: "home_visit", labelKey: "visitHomeVisit" },
] as const;

function readDraft(searchParams: URLSearchParams): ServiceFilterDraft {
  const out: ServiceFilterDraft = {};
  for (const [k, v] of searchParams.entries()) {
    if (k === "page") continue;
    out[k] = v;
  }
  return out;
}

export function ServiceFilterSidebar({ config }: { config: ServiceFacetConfig }) {
  const t = useTranslations("service.listing");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<ServiceFilterDraft>(() =>
    readDraft(new URLSearchParams(searchParams.toString())),
  );

  useEffect(() => {
    if (isPending) return;
    setDraft(readDraft(new URLSearchParams(searchParams.toString())));
  }, [searchParams, isPending]);

  const commit = useCallback(
    (next: ServiceFilterDraft) => {
      setDraft(next);
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(next)) {
        if (v) params.set(k, v);
      }
      // Any filter change invalidates the current page offset.
      params.delete("page");
      startTransition(() => {
        router.replace(`?${params.toString()}`, { scroll: false });
      });
    },
    [router],
  );

  const toggle = useCallback(
    (key: string, value: string) => {
      const next = { ...draft };
      if (next[key] === value) delete next[key];
      else next[key] = value;
      commit(next);
    },
    [draft, commit],
  );

  const clearAll = useCallback(() => {
    setDraft({});
    startTransition(() => {
      router.replace("?", { scroll: false });
    });
  }, [router]);

  return (
    <aside aria-label={t("filters")} data-pending={isPending ? "" : undefined}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[10px] tracking-[0.2em] uppercase text-nl-russet">
          {t("filters")}
        </h2>
        <button type="button" onClick={clearAll} className="text-[10px] uppercase text-nl-amber">
          {t("clearAll")}
        </button>
      </div>

      {/* Facets with no values are hidden, not rendered empty — the rating
          group in particular has no data until real reviews exist. */}
      {config.areas.length > 0 && (
        <fieldset className="mb-6">
          <legend className="text-[10px] uppercase tracking-[0.2em] text-nl-russet mb-2">
            {t("area")}
          </legend>
          {config.areas.map((area) => (
            <label key={area.value} className="flex items-center gap-2 py-1 text-sm">
              <input
                type="checkbox"
                aria-label={area.label}
                checked={draft.area === area.value}
                onChange={() => toggle("area", area.value)}
              />
              <span>{area.label}</span>
              {area.count != null && <span className="text-nl-russet">({area.count})</span>}
            </label>
          ))}
        </fieldset>
      )}

      <fieldset className="mb-6">
        <legend className="text-[10px] uppercase tracking-[0.2em] text-nl-russet mb-2">
          {t("visit")}
        </legend>
        {VISIT_OPTIONS.map((opt) => (
          <label key={opt.value} className="flex items-center gap-2 py-1 text-sm">
            <input
              type="checkbox"
              aria-label={t(opt.labelKey)}
              checked={draft.visit === opt.value}
              onChange={() => toggle("visit", opt.value)}
            />
            <span>{t(opt.labelKey)}</span>
          </label>
        ))}
      </fieldset>

      {config.categories.length > 0 && (
        <fieldset className="mb-6">
          <legend className="text-[10px] uppercase tracking-[0.2em] text-nl-russet mb-2">
            {t("category")}
          </legend>
          {config.categories.map((cat) => (
            <label key={cat.value} className="flex items-center gap-2 py-1 text-sm">
              <input
                type="checkbox"
                aria-label={cat.label}
                checked={draft.category === cat.value}
                onChange={() => toggle("category", cat.value)}
              />
              <span>{cat.label}</span>
            </label>
          ))}
        </fieldset>
      )}

      <fieldset className="mb-6">
        <legend className="text-[10px] uppercase tracking-[0.2em] text-nl-russet mb-2">
          {t("priceAed")}
        </legend>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            aria-label={t("minPrice")}
            value={draft.minPrice ?? ""}
            onChange={(e) => commit({ ...draft, minPrice: e.target.value })}
            className="w-full border px-2 py-1 text-sm"
          />
          <span>–</span>
          <input
            type="number"
            min={0}
            aria-label={t("maxPrice")}
            value={draft.maxPrice ?? ""}
            onChange={(e) => commit({ ...draft, maxPrice: e.target.value })}
            className="w-full border px-2 py-1 text-sm"
          />
        </div>
      </fieldset>
    </aside>
  );
}
