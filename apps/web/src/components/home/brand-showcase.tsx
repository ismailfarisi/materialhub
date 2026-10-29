import { useTranslations } from "next-intl";
import Image from "next/image";

interface Brand {
  id: string;
  name: string;
  logo_url: string;
}

export function BrandShowcase({ brands }: { brands: Brand[] }) {
  const t = useTranslations("home");

  return (
    <section>
      <h2 className="text-xl font-bold mb-4">{t("brands")}</h2>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
        {brands.map((brand) => (
          <div
            key={brand.id}
            className="border rounded-lg p-4 flex items-center justify-center aspect-square hover:shadow-sm transition-shadow"
          >
            <Image
              src={brand.logo_url}
              alt={brand.name}
              width={80}
              height={80}
              className="object-contain"
            />
          </div>
        ))}
      </div>
    </section>
  );
}
