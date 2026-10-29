"use client";

import { useRecentFollowedVendors } from "@/lib/queries/vendor-follow";
import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

function defaultMonogram(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function BrandsYouFollowRail() {
  const { data, isPending } = useRecentFollowedVendors(4);
  const brands = data ?? [];

  // Hidden for guests (401) and for users following nothing.
  if (!isPending && brands.length === 0) return null;

  return (
    <section className="py-16 bg-nl-pearl">
      <div className="mx-auto max-w-[1340px] px-6 lg:px-12">
        <div className="flex justify-between items-baseline mb-7">
          <div>
            <div className="text-[10px] tracking-[0.22em] uppercase text-nl-russet">
              Brands you follow
            </div>
            <h3 className="font-serif text-3xl mt-2 tracking-tight text-nl-cacao">
              New from your makers
            </h3>
          </div>
          {brands.length > 0 && (
            <Link
              href="/account/followed-brands"
              className="text-[10px] tracking-[0.22em] uppercase text-nl-russet hover:text-nl-cacao"
            >
              All brands →
            </Link>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {isPending
            ? ["s1", "s2", "s3", "s4"].map((k) => (
                <div
                  key={k}
                  className="bg-nl-linen border border-nl-cacao/10 px-5 py-5 flex items-center gap-3.5 animate-pulse h-[88px]"
                />
              ))
            : brands.map((b) => (
                <Link
                  key={b.id}
                  href={`/vendor/${b.slug}`}
                  className="bg-nl-linen border border-nl-cacao/10 px-5 py-5 flex items-center gap-3.5 hover:border-nl-cacao/25 transition-colors"
                >
                  <div
                    aria-hidden="true"
                    className="w-11 h-11 flex-shrink-0 flex items-center justify-center text-nl-linen font-serif text-lg overflow-hidden"
                    style={{
                      background:
                        "linear-gradient(135deg, hsl(var(--nl-russet)) 0%, hsl(var(--nl-cacao)) 100%)",
                    }}
                  >
                    {b.logo_url ? (
                      <Image
                        src={b.logo_url}
                        alt={b.name}
                        width={44}
                        height={44}
                        className="object-cover w-full h-full"
                      />
                    ) : (
                      defaultMonogram(b.name)
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-serif text-base leading-tight mb-0.5 text-nl-cacao truncate">
                      {b.name}
                    </div>
                    <div className="text-[10.5px] text-nl-russet truncate">
                      {[
                        b.location,
                        b.product_count != null ? `${b.product_count} items` : null,
                        b.rating_avg != null ? `★ ${b.rating_avg.toFixed(1)}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-nl-russet flex-shrink-0" />
                </Link>
              ))}
        </div>
      </div>
    </section>
  );
}
