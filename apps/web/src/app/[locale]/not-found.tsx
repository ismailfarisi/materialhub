import { CategoryStocks } from "@/components/content/category-stocks";
import { Button } from "@/components/swatch";
import { Search } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

export default async function NotFound() {
	const locale = await getLocale();
	const t = await getTranslations("content.notFound");

	return (
		<div className="bg-nl-linen text-nl-cacao">
			<div className="max-w-[1400px] mx-auto px-4 md:px-8 py-12 md:py-20 grid gap-12 md:gap-16">
				<div className="grid gap-5 max-w-[760px]">
					<p className="font-mono text-[13px] text-nl-russet tabular-nums m-0">
						{t("code")}
					</p>
					<h1 className="font-display font-bold font-expanded text-[clamp(32px,5vw,60px)] leading-[1.02] tracking-[-0.03em] m-0">
						{t("title")}
					</h1>
					<p className="text-[16px] md:text-[18px] leading-[1.55] text-nl-russet max-w-[58ch] m-0">
						{t("body")}
					</p>
					<search>
						<form
							action={`/${locale}/search`}
							method="get"
							className="mt-2 grid gap-2"
						>
							<label
								htmlFor="nf-q"
								className="text-[13px] font-medium text-nl-cacao"
							>
								{t("searchLabel")}
							</label>
							<div className="flex gap-2">
								<div className="relative flex-1 min-w-0">
									<Search
										className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-nl-russet"
										strokeWidth={1.75}
										aria-hidden="true"
									/>
									<input
										id="nf-q"
										name="q"
										type="search"
										required
										enterKeyHint="search"
										placeholder={t("searchPlaceholder")}
										className="h-12 w-full rounded-md border border-nl-cacao/15 bg-nl-pearl ps-10 pe-3 text-[15px] text-nl-cacao placeholder:text-nl-russet/80 transition-colors hover:border-nl-cacao/35 focus:border-nl-cacao focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber"
									/>
								</div>
								<Button type="submit" size="lg">
									{t("searchButton")}
								</Button>
							</div>
						</form>
					</search>
				</div>

				<section aria-labelledby="nf-browse" className="grid gap-4">
					<h2
						id="nf-browse"
						className="font-display font-semibold text-[clamp(20px,2.2vw,26px)] leading-[1.1] tracking-[-0.02em] m-0"
					>
						{t("browse")}
					</h2>
					<CategoryStocks locale={locale} />
				</section>

				<p className="m-0 text-[15px]">
					<Link
						href={`/${locale}`}
						className="text-nl-cacao underline decoration-nl-cacao/30 underline-offset-[0.2em] hover:decoration-nl-amber"
					>
						{t("home")}
					</Link>
				</p>
			</div>
		</div>
	);
}
