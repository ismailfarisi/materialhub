"use client";

import { useTranslations } from "next-intl";
import { useRecentlyViewed } from "@/lib/queries/account";
import { ProductCard } from "@/components/product/product-card";
import { useAuthStore } from "@/stores/auth";

function normalizeProduct(raw: any) {
  return {
    id: raw.id,
    name: raw.name,
    slug: raw.slug,
    price_min: raw.price_min ?? raw.price,
    price_max: raw.price_max ?? raw.price,
    images: raw.images
      ? (typeof raw.images[0] === "string" ? raw.images : raw.images.map((img: any) => img.url))
      : [],
    rating_avg: typeof raw.rating_avg === "string" ? parseFloat(raw.rating_avg) || 0 : (raw.rating_avg || 0),
    vendor_name: raw.vendor_name || raw.vendor?.name || null,
    vendor_id: raw.vendor_id,
    category_name: raw.category_name || null,
    in_stock: raw.in_stock,
    tags: raw.tags || [],
  };
}

export function RecentlyViewed() {
  const t = useTranslations("home");
  const { isAuthenticated } = useAuthStore();
  const { data: items } = useRecentlyViewed(8);

  if (!isAuthenticated || !items || items.length === 0) return null;

  return (
    <section>
      <h2 className="text-xl font-serif font-bold mb-4">{t("recentlyViewed")}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
        {items.map((item: any) => {
          const raw = item.product || item;
          return <ProductCard key={item.id} product={normalizeProduct(raw)} />;
        })}
      </div>
    </section>
  );
}
