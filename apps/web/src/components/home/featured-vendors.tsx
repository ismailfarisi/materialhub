import { getTranslations } from "next-intl/server";
import Image from "next/image";
import { Star } from "lucide-react";

interface Vendor {
  id: string;
  name: string;
  logo_url: string;
  rating_avg: number;
  total_orders: number;
  follower_count: number;
}

export async function FeaturedVendors({ vendors }: { vendors: Vendor[] }) {
  const t = await getTranslations("home");

  return (
    <section>
      <h2 className="text-xl font-bold mb-4">{t("featuredVendors")}</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {vendors.map((vendor) => (
          <div
            key={vendor.id}
            className="border rounded-lg p-4 text-center hover:shadow-md transition-shadow"
          >
            <div className="relative h-16 w-16 mx-auto mb-2">
              <Image
                src={vendor.logo_url}
                alt={vendor.name}
                fill
                className="rounded-full object-cover"
              />
            </div>
            <h3 className="font-medium text-sm truncate">{vendor.name}</h3>
            <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mt-1">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              {vendor.rating_avg.toFixed(1)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {vendor.total_orders} orders
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
