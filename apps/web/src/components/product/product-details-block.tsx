"use client";

import { type AccordionItem, DetailsAccordions } from "@/components/product/details-accordions";
import { type SpecEntry, SpecStrip } from "@/components/product/spec-strip";

interface ProductDetailsBlockProps {
  product: any;
  siteSettings?: Record<string, string>;
  shippingZoneRates?: any[];
  vendorPolicies?: { return_policy?: string | null; shipping_policy?: string | null };
}

export function ProductDetailsBlock({
  product,
  siteSettings = {},
  shippingZoneRates = [],
  vendorPolicies,
}: ProductDetailsBlockProps) {
  const a = product.attributes ?? {};
  const bullets: string[] = a.detail_bullets ?? splitBullets(product.description);

  const specs: SpecEntry[] = [
    { label: "Place of origin", value: product.country_of_origin },
    { label: "Volume", value: a.volume_label },
    { label: "Concentration", value: a.concentration_label },
    { label: "SKU", value: product.sku, mono: true },
  ];

  const accordions: AccordionItem[] = buildAccordions({
    product,
    a,
    siteSettings,
    shippingZoneRates,
    vendorPolicies,
  });

  if (
    !bullets.length &&
    !a.whats_in_box?.length &&
    specs.every((s) => !s.value) &&
    !accordions.length
  ) {
    return null;
  }

  return (
    <section className="py-16 border-t border-nl-cacao/15">
      <div className="mx-auto max-w-[1100px] px-6 lg:px-12">
        {bullets.length > 0 && (
          <div className="mb-10">
            <h3 className="font-serif text-2xl tracking-tight mb-4 text-nl-cacao">
              Product details
            </h3>
            <ul className="list-disc pl-6 text-sm leading-relaxed text-nl-cacao space-y-1.5">
              {bullets.map((b, i) => (
                <li key={`${i}-${b.slice(0, 12)}`}>{b}</li>
              ))}
            </ul>
          </div>
        )}

        {a.whats_in_box?.length > 0 && (
          <div className="mb-10">
            <h3 className="font-serif text-xl tracking-tight mb-3 text-nl-cacao">
              What&apos;s in the box
            </h3>
            <div className="text-sm leading-relaxed text-nl-cacao space-y-1">
              {a.whats_in_box.map((line: string, i: number) => (
                <div key={`${i}-${line.slice(0, 12)}`}>
                  {line.startsWith("1 ×") ? line : `1 × ${line}`}
                </div>
              ))}
            </div>
          </div>
        )}

        <SpecStrip entries={specs} />
        <DetailsAccordions items={accordions} />
      </div>
    </section>
  );
}

// — helpers —

function splitBullets(description: string | null | undefined): string[] {
  if (!description) return [];
  const parts = description
    .split(/\n\n|\n|(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.slice(0, 4);
}

function buildAccordions({
  product,
  a,
  siteSettings,
  shippingZoneRates,
  vendorPolicies,
}: {
  product: any;
  a: any;
  siteSettings: Record<string, string>;
  shippingZoneRates: any[];
  vendorPolicies?: { return_policy?: string | null; shipping_policy?: string | null };
}): AccordionItem[] {
  const out: AccordionItem[] = [];

  if (product.ingredients) {
    out.push({
      id: "ingredients",
      label: "Ingredients",
      defaultOpen: true,
      body: <p className="whitespace-pre-line">{product.ingredients}</p>,
    });
  }

  if (product.usage_instructions) {
    out.push({
      id: "howto",
      label: "How to use",
      body: <p className="whitespace-pre-line">{product.usage_instructions}</p>,
    });
  }

  const returnsBody = buildReturnsBody({ siteSettings, vendorPolicies });
  if (returnsBody) {
    out.push({ id: "returns", label: "Returns & refunds", body: returnsBody });
  }

  const shippingBody = buildShippingBody({ shippingZoneRates, vendorPolicies });
  if (shippingBody) {
    out.push({ id: "shipping", label: "Shipping & delivery", body: shippingBody });
  }

  if (siteSettings.marketplace_authenticity_guarantee) {
    out.push({
      id: "authenticity",
      label: "Authenticity guarantee",
      body: (
        <p className="whitespace-pre-line">{siteSettings.marketplace_authenticity_guarantee}</p>
      ),
    });
  }

  return out;
}

function buildReturnsBody({
  siteSettings,
  vendorPolicies,
}: {
  siteSettings: Record<string, string>;
  vendorPolicies?: { return_policy?: string | null };
}) {
  const windowDays = Number.parseInt(siteSettings.marketplace_return_window_days ?? "7", 10);
  const policy = vendorPolicies?.return_policy?.trim();
  if (!windowDays && !policy) return null;
  const tiles: [string, string][] = [
    [`${windowDays} days`, "Return window from delivery date"],
    ["Sealed", "Unopened items only"],
    ["Free", "Refund once received"],
  ];
  return (
    <div>
      <div className="grid grid-cols-3 gap-6 mb-4">
        {tiles.map(([n, c]) => (
          <div key={n} className="border-t border-nl-cacao/15 pt-3">
            <div className="font-serif text-2xl text-nl-cacao">{n}</div>
            <div className="text-[11px] mt-1">{c}</div>
          </div>
        ))}
      </div>
      <p className="whitespace-pre-line">
        Return eligible items within {windowDays} days of delivery for a full refund. For hygiene
        and safety, beauty, skincare and fragrance can only be returned if they are sealed, unused
        and in their original packaging — opened or used items cannot be accepted. Items must be
        returned with the invoice and any tags or seals intact.
      </p>
      {policy && <p className="mt-3 whitespace-pre-line">{policy}</p>}
    </div>
  );
}

function buildShippingBody({
  shippingZoneRates,
  vendorPolicies,
}: {
  shippingZoneRates: any[];
  vendorPolicies?: { shipping_policy?: string | null };
}) {
  const policy = vendorPolicies?.shipping_policy?.trim();
  const uae = shippingZoneRates.filter((r: any) => r.zone_code === "UAE");
  const gcc = shippingZoneRates.filter((r: any) => r.zone_code === "GCC");
  const intl = shippingZoneRates.filter((r: any) => r.zone_code === "INTL");
  if (uae.length === 0 && gcc.length + intl.length === 0 && !policy) return null;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <div className="text-[9px] tracking-[0.22em] uppercase text-nl-amber mb-2">UAE</div>
        {uae.length > 0 ? (
          uae.map((r: any) => (
            <div key={r.id}>
              {r.label} {r.estimated_days_min}–{r.estimated_days_max} days · AED{" "}
              {(r.base_cost / 100).toFixed(0)}
            </div>
          ))
        ) : (
          <div className="text-nl-russet">Standard 2–3 days</div>
        )}
      </div>
      <div>
        <div className="text-[9px] tracking-[0.22em] uppercase text-nl-amber mb-2">
          GCC &amp; International
        </div>
        {gcc.length + intl.length > 0 ? (
          [...gcc, ...intl].map((r: any) => (
            <div key={r.id}>
              {r.label} {r.estimated_days_min}–{r.estimated_days_max} days · AED{" "}
              {(r.base_cost / 100).toFixed(0)}
            </div>
          ))
        ) : (
          <div className="text-nl-russet">GCC 4–6 days · Worldwide 7–14 days</div>
        )}
        {policy && <p className="mt-3 whitespace-pre-line">{policy}</p>}
      </div>
    </div>
  );
}
