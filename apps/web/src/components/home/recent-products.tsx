import { useTranslations } from "next-intl";
import { ProductCard } from "@/components/product/product-card";

export function RecentProducts({ products }: { products: any[] }) {
  const t = useTranslations("home");

  return (
    <section>
      <h2 className="text-xl font-bold mb-4">{t("recentProducts")}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
