import { Breadcrumb } from "@/components/product/breadcrumb";
import { buttonVariants } from "@/components/swatch";
import { apiServer } from "@/lib/api-server";
import { buildAlternates } from "@/lib/seo/alternates";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: string }>;
}): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "browse.brandsMeta" });
	return {
		title: t("title"),
		description: t("description"),
		alternates: buildAlternates(locale, "/brands"),
	};
}

export const revalidate = 600;

interface Brand {
	id: string;
	name: string;
	slug: string;
	logo_url?: string | null;
	product_count?: number;
}

/** `null` when the catalogue did not answer, so the page can say so. */
async function getBrands(): Promise<Brand[] | null> {
	try {
		const server = await apiServer();
		const res = await server.get("/brands");
		const list: Brand[] = Array.isArray(res.data?.data) ? res.data.data : [];
		return list.slice().sort((a, b) => a.name.localeCompare(b.name));
	} catch {
		return null;
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
	// Latin letters A–Z first, then everything else ("#": digits, Arabic names).
	return Array.from(map.entries()).sort(([a], [b]) =>
		a === "#" ? 1 : b === "#" ? -1 : a.localeCompare(b),
	);
}

const ALPHABET = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "#"];

export default async function BrandsPage({
	params,
}: {
	params: Promise<{ locale: string }>;
}) {
	const { locale } = await params;
	setRequestLocale(locale);
	const t = await getTranslations({ locale, namespace: "browse" });
	const nf = new Intl.NumberFormat(locale === "ar" ? "ar-AE" : "en-AE");

	const brands = await getBrands();
	const groups = groupByLetter(brands ?? []);
	const lettersWithBrands = new Set(groups.map(([letter]) => letter));

	return (
		<div className="mx-auto max-w-[1400px] px-4 pb-16 md:px-8">
			<header className="grid gap-3 pt-2 pb-6 md:pb-8">
				<Breadcrumb items={[{ name: t("brandsCrumb") }]} />
				<h1 className="m-0 font-display text-[clamp(2.25rem,5vw,4.75rem)] font-bold leading-none tracking-[-0.03em] text-nl-cacao font-expanded">
					{t("brandsTitle")}
				</h1>
				<p className="m-0 max-w-[60ch] text-[15.5px] leading-relaxed text-nl-russet">
					{brands && brands.length > 0
						? t.rich("brandsIntroCount", {
								count: brands.length,
								formatted: nf.format(brands.length),
								n: (chunks) => (
									<span className="font-mono tabular-nums text-nl-cacao">{chunks}</span>
								),
							})
						: t("brandsIntro")}
				</p>
			</header>

			{brands === null ? (
				<StateCard title={t("errorTitle")} hint={t("errorHint")}>
					<Link href={`/${locale}/brands`} className={buttonVariants({ variant: "outline" })}>
						{t("retry")}
					</Link>
				</StateCard>
			) : brands.length === 0 ? (
				<StateCard title={t("brandsEmptyTitle")} hint={t("brandsEmptyHint")}>
					<Link href={`/${locale}/search`} className={buttonVariants({ variant: "primary" })}>
						{t("searchCatalogue")}
					</Link>
				</StateCard>
			) : (
				<>
					<nav
						aria-label={t("jumpToLetter")}
						className="sticky top-[4.5rem] z-10 -mx-4 mb-8 border-y border-nl-cacao/12 bg-nl-linen/95 px-4 py-2 backdrop-blur-sm md:top-[5.25rem] md:-mx-8 md:px-8 lg:top-[8.25rem]"
					>
						<ul className="scrollbar-hide m-0 flex list-none gap-1 overflow-x-auto p-0" dir="ltr">
							{ALPHABET.map((letter) => (
								<li key={letter} className="shrink-0">
									{lettersWithBrands.has(letter) ? (
										<a
											href={`#letter-${letter === "#" ? "other" : letter}`}
											className="inline-flex h-9 w-9 items-center justify-center rounded-sm font-mono text-[13px] font-medium text-nl-cacao transition-colors hover:bg-nl-cacao hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber"
										>
											{letter}
										</a>
									) : (
										<span
											aria-hidden="true"
											className="inline-flex h-9 w-9 items-center justify-center font-mono text-[13px] text-nl-russet/40"
										>
											{letter}
										</span>
									)}
								</li>
							))}
						</ul>
					</nav>

					<div className="grid gap-10 md:gap-14">
						{groups.map(([letter, list]) => (
							<section
								key={letter}
								id={`letter-${letter === "#" ? "other" : letter}`}
								aria-labelledby={`letter-h-${letter === "#" ? "other" : letter}`}
								className="scroll-mt-40 grid gap-4 md:grid-cols-[72px_minmax(0,1fr)] md:gap-6"
							>
								<h2
									id={`letter-h-${letter === "#" ? "other" : letter}`}
									className="m-0 border-t-2 border-nl-cacao pt-2 font-display text-[32px] font-bold leading-none tracking-[-0.02em] text-nl-cacao md:text-[40px]"
								>
									{letter}
								</h2>
								<ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5">
									{list.map((brand) => (
										<li key={brand.id} className="min-w-0">
											<Link
												href={`/${locale}/brand/${encodeURIComponent(brand.slug)}`}
												className="group flex h-full flex-col overflow-hidden rounded-md bg-nl-pearl shadow-card transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber motion-reduce:transition-none motion-reduce:hover:translate-y-0"
											>
												<div className="relative grid aspect-[16/9] place-items-center bg-nl-linen/70">
													{brand.logo_url ? (
														<Image
															src={brand.logo_url}
															alt=""
															fill
															sizes="(max-width: 640px) 45vw, 220px"
															className="object-contain p-4"
														/>
													) : (
														<span
															aria-hidden="true"
															className="font-display text-[28px] font-bold text-nl-cacao/35"
														>
															{brand.name.trim().charAt(0).toUpperCase()}
														</span>
													)}
												</div>
												<div className="grid gap-1 p-3 md:p-3.5">
													<span className="font-display text-[15px] font-semibold leading-tight tracking-[-0.01em] text-nl-cacao [overflow-wrap:anywhere] line-clamp-2">
														{brand.name}
													</span>
													{typeof brand.product_count === "number" &&
														brand.product_count > 0 && (
															<span className="text-[12.5px] text-nl-russet">
																<span className="font-mono tabular-nums">
																	{nf.format(brand.product_count)}
																</span>{" "}
																{t("productsWord", { count: brand.product_count })}
															</span>
														)}
												</div>
											</Link>
										</li>
									))}
								</ul>
							</section>
						))}
					</div>
				</>
			)}
		</div>
	);
}

function StateCard({
	title,
	hint,
	children,
}: {
	title: string;
	hint: string;
	children?: React.ReactNode;
}) {
	return (
		<div className="grid justify-items-start gap-3 rounded-md border border-dashed border-nl-cacao/25 bg-nl-pearl/60 px-5 py-10 md:px-8 md:py-14">
			<h2 className="m-0 font-display text-[19px] font-semibold tracking-[-0.01em] text-nl-cacao">
				{title}
			</h2>
			<p className="m-0 max-w-[56ch] text-[15px] text-nl-russet">{hint}</p>
			<div className="pt-2">{children}</div>
		</div>
	);
}
