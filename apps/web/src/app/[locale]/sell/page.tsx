import { CategoryStocks } from "@/components/content/category-stocks";
import { Button, FanDeck } from "@/components/swatch";
import { ArrowRight } from "lucide-react";
import { buildAlternates } from "@/lib/seo/alternates";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: string }>;
}): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "content.sell" });
	return {
		title: t("meta.title"),
		description: t("meta.description"),
		alternates: buildAlternates(locale, "/sell"),
	};
}

/** Vendor dashboard sign-in for existing suppliers. */
const DASHBOARD_URL = process.env.NEXT_PUBLIC_VENDOR_DASHBOARD_URL || "https://vendor.materialhubuae.com";
/** Supplier application (vendor onboarding): the in-app form in the vendor dashboard. */
const APPLY_URL = process.env.NEXT_PUBLIC_SELLER_APPLY_URL || `${DASHBOARD_URL.replace(/\/$/, "")}/apply`;

const WHY = ["payments", "payouts", "shipping", "dashboard", "integrations", "bilingual"] as const;
const STEPS = ["apply", "verify", "setup", "list"] as const;

const linkClass =
	"underline decoration-nl-cacao/30 underline-offset-[0.2em] hover:decoration-nl-amber transition-colors";

export default async function SellPage() {
	const locale = await getLocale();
	const t = await getTranslations("content.sell");
	const nf = new Intl.NumberFormat(locale === "ar" ? "ar-AE" : "en-AE", { minimumIntegerDigits: 2 });

	return (
		<div className="bg-nl-linen text-nl-cacao">
			{/* Opening: the offer, the action, the whole range fanned out. */}
			<section className="border-b border-nl-cacao/12">
				<div className="max-w-[1400px] mx-auto px-4 md:px-8 pt-10 pb-12 md:pt-16 md:pb-20 grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-center lg:gap-16">
					<div className="grid gap-6 content-start">
						<h1 className="font-display font-bold font-expanded text-[clamp(36px,5.4vw,76px)] leading-[1] tracking-[-0.03em] m-0 max-w-[16ch]">
							{t("title")}
						</h1>
						<p className="text-[17px] md:text-[19px] leading-[1.5] text-nl-russet max-w-[52ch] m-0">
							{t("intro")}
						</p>
						<div className="flex flex-wrap items-center gap-x-6 gap-y-4 pt-2">
							<Button asChild variant="signal" size="lg">
								<a href={APPLY_URL}>
									{t("cta")}
									<ArrowRight className="h-4 w-4 rtl:rotate-180" strokeWidth={1.75} aria-hidden="true" />
								</a>
							</Button>
							<a href={DASHBOARD_URL} className={`text-[14px] text-nl-cacao ${linkClass}`}>
								{t("signIn")}
							</a>
						</div>
					</div>
					<FanDeck className="max-w-[560px] w-full justify-self-center lg:justify-self-end" />
				</div>
			</section>

			<div className="max-w-[1400px] mx-auto px-4 md:px-8 py-12 md:py-20 grid gap-16 md:gap-24">
				<section aria-labelledby="sell-why" className="grid gap-6 md:gap-8">
					<h2
						id="sell-why"
						className="font-display font-semibold text-[clamp(24px,3vw,36px)] leading-[1.08] tracking-[-0.02em] m-0"
					>
						{t("whyTitle")}
					</h2>
					<dl className="m-0 grid md:grid-cols-2 md:gap-x-12 lg:gap-x-16 border-t-2 border-nl-cacao">
						{WHY.map((k) => (
							<div key={k} className="grid gap-1.5 py-5 md:py-6 border-b border-nl-cacao/12 content-start">
								<dt className="font-display text-[18px] font-semibold leading-snug tracking-[-0.01em]">
									{t(`why.${k}.t`)}
								</dt>
								<dd className="m-0 text-[15px] leading-[1.6] text-nl-cacao/80 max-w-[56ch]">
									{t(`why.${k}.d`)}
								</dd>
							</div>
						))}
					</dl>
				</section>

				<section aria-labelledby="sell-cats" className="grid gap-6 md:gap-8">
					<div className="grid gap-3">
						<h2
							id="sell-cats"
							className="font-display font-semibold text-[clamp(24px,3vw,36px)] leading-[1.08] tracking-[-0.02em] m-0"
						>
							{t("categoriesTitle")}
						</h2>
						<p className="m-0 text-[16px] leading-[1.6] text-nl-russet max-w-[62ch]">{t("categoriesBody")}</p>
					</div>
					<CategoryStocks locale={locale} />
				</section>

				<section aria-labelledby="sell-steps" className="grid gap-6 md:gap-8">
					<h2
						id="sell-steps"
						className="font-display font-semibold text-[clamp(24px,3vw,36px)] leading-[1.08] tracking-[-0.02em] m-0"
					>
						{t("stepsTitle")}
					</h2>
					<ol className="list-none m-0 p-0 grid sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
						{STEPS.map((k, i) => (
							<li key={k} className="rounded-md bg-nl-pearl shadow-card p-5 grid gap-2 content-start">
								<span className="font-mono text-[13px] tabular-nums text-nl-russet" aria-hidden="true">
									{nf.format(i + 1)}
								</span>
								<h3 className="m-0 font-display text-[17px] font-semibold tracking-[-0.01em]">
									{t(`steps.${k}.t`)}
								</h3>
								<p className="m-0 text-[14.5px] leading-[1.55] text-nl-cacao/80">{t(`steps.${k}.d`)}</p>
							</li>
						))}
					</ol>
				</section>
			</div>

			<section aria-labelledby="sell-close" className="bg-nl-espresso text-nl-pearl">
				<div className="max-w-[1400px] mx-auto px-4 md:px-8 py-12 md:py-16 grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:gap-12">
					<div className="grid gap-3">
						<h2
							id="sell-close"
							className="font-display font-bold font-expanded text-[clamp(26px,3.4vw,44px)] leading-[1.05] tracking-[-0.025em] m-0"
						>
							{t("closingTitle")}
						</h2>
						<p className="m-0 text-[16px] leading-[1.6] text-nl-pearl/75 max-w-[60ch]">{t("closingBody")}</p>
					</div>
					<div className="flex flex-wrap items-center gap-x-6 gap-y-3">
						<Button asChild variant="inverse" size="lg">
							<a href={APPLY_URL}>
								{t("cta")}
								<ArrowRight className="h-4 w-4 rtl:rotate-180" strokeWidth={1.75} aria-hidden="true" />
							</a>
						</Button>
					</div>
				</div>
			</section>
		</div>
	);
}
