import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getLocale } from "next-intl/server";
import { apiServer } from "@/lib/api-server";
import { StaticPageLayout } from "@/components/layout/static-page-layout";

export const metadata: Metadata = {
	title: "Brand directory — MaterialHub",
	description:
		"Every brand on MaterialHub, A to Z. Discover regional houses, global favourites and indie launches in beauty, fragrance and wellness.",
};

export const revalidate = 600;

interface Brand {
	id: string;
	name: string;
	slug: string;
	logo_url?: string | null;
	product_count?: number;
}

async function getBrands(): Promise<Brand[]> {
	try {
		const server = await apiServer();
		const res = await server.get("/brands");
		const list: Brand[] = Array.isArray(res.data?.data) ? res.data.data : [];
		return list.slice().sort((a, b) => a.name.localeCompare(b.name));
	} catch {
		return [];
	}
}

function groupByLetter(brands: Brand[]) {
	const map = new Map<string, Brand[]>();
	for (const b of brands) {
		const first = (b.name.trim()[0] ?? "#").toUpperCase();
		const key = /[A-Z]/.test(first) ? first : "#";
		const arr = map.get(key) ?? [];
		arr.push(b);
		map.set(key, arr);
	}
	return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export default async function BrandsPage() {
	const locale = await getLocale();
	const brands = await getBrands();
	const groups = groupByLetter(brands);
	const lettersWithBrands = new Set(groups.map(([letter]) => letter));

	return (
		<StaticPageLayout
			eyebrow="Brand directory"
			title="Every brand on MaterialHub."
			intro={
				brands.length > 0
					? `${brands.length} ${brands.length === 1 ? "brand" : "brands"} — heritage houses, regional founders and indie launches across skincare, makeup, fragrance, hair, body, wellness and tools.`
					: "Heritage houses, regional founders and indie launches across skincare, makeup, fragrance, hair, body, wellness and tools."
			}
		>
			{brands.length === 0 ? (
				<p className="text-nl-russet">
					We&rsquo;re refreshing the brand directory. Please check back
					shortly, or browse{" "}
					<Link
						href={`/${locale}/search`}
						className="text-nl-amber hover:underline"
					>
						all products
					</Link>{" "}
					in the meantime.
				</p>
			) : (
				<>
					<nav
						aria-label="Jump to letter"
						className="not-prose flex flex-wrap gap-1.5 sticky top-2 z-10 bg-nl-linen/90 backdrop-blur py-2 -mx-2 px-2 rounded"
					>
						{ALPHABET.map((letter) => {
							const active = lettersWithBrands.has(letter);
							return active ? (
								<a
									key={letter}
									href={`#letter-${letter}`}
									className="w-8 h-8 flex items-center justify-center text-[12px] font-medium text-nl-cacao border border-nl-cacao/15 hover:border-nl-amber hover:text-nl-amber transition-colors"
								>
									{letter}
								</a>
							) : (
								<span
									key={letter}
									className="w-8 h-8 flex items-center justify-center text-[12px] text-nl-russet/30 border border-nl-cacao/5 cursor-not-allowed"
									aria-disabled
								>
									{letter}
								</span>
							);
						})}
					</nav>

					{groups.map(([letter, list]) => (
						<section key={letter} id={`letter-${letter}`} className="scroll-mt-24">
							<h2 className="font-serif text-3xl md:text-4xl text-nl-amber mb-5">
								{letter}
							</h2>
							<ul className="not-prose grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
								{list.map((brand) => (
									<li key={brand.id}>
										<Link
											href={`/${locale}/brand/${encodeURIComponent(brand.slug)}`}
											className="group flex flex-col items-center justify-center text-center gap-2 border border-nl-cacao/10 bg-white/60 hover:bg-white hover:border-nl-amber/60 transition-colors p-4 h-full min-h-[140px]"
										>
											{brand.logo_url ? (
												<div className="relative w-full h-14 flex items-center justify-center">
													<Image
														src={brand.logo_url}
														alt={brand.name}
														fill
														sizes="(max-width: 768px) 40vw, 200px"
														className="object-contain"
													/>
												</div>
											) : (
												<div className="w-full h-14 flex items-center justify-center font-serif text-nl-cacao/40 text-2xl">
													{brand.name.charAt(0)}
												</div>
											)}
											<div className="text-[13px] text-nl-cacao group-hover:text-nl-amber font-medium leading-tight">
												{brand.name}
											</div>
											{typeof brand.product_count === "number" &&
												brand.product_count > 0 && (
													<div className="text-[10px] tracking-[0.14em] uppercase text-nl-russet/70">
														{brand.product_count}{" "}
														{brand.product_count === 1
															? "product"
															: "products"}
													</div>
												)}
										</Link>
									</li>
								))}
							</ul>
						</section>
					))}
				</>
			)}
		</StaticPageLayout>
	);
}
