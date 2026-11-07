import {
	Button,
	FanDeck,
	MillLabel,
	PriceTag,
	STOCKS,
	STOCK_ORDER,
	SectionHead,
	StockChip,
	SwatchCard,
} from "@/components/swatch";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: string }>;
}): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "content.designSystem" });
	return { title: t("meta.title"), robots: { index: false, follow: false } };
}

/**
 * Living specimen of the Swatch Book system (see /DESIGN.md). Not linked from
 * the storefront; used by designers and per-page sessions to check work
 * against the real components. Sample values are illustrative.
 */
export default async function DesignSystemPage({
	params,
}: {
	params: Promise<{ locale: string }>;
}) {
	const { locale } = await params;
	setRequestLocale(locale);
	const t = await getTranslations({ locale, namespace: "content.designSystem" });

	return (
		<div className="max-w-[1400px] mx-auto px-4 md:px-8 py-10 md:py-16 grid gap-16">
			<header className="grid md:grid-cols-[1.1fr_1fr] gap-8 items-center">
				<div className="grid gap-4">
										<h1 className="font-display font-bold [font-stretch:112%] text-[clamp(36px,5vw,68px)] leading-[1] tracking-[-0.03em] m-0">
						{t("title")}
					</h1>
					<p className="text-nl-russet text-[17px] max-w-[56ch] m-0">
						{t("intro")}
					</p>
				</div>
				<FanDeck className="max-w-[520px] justify-self-center" />
			</header>

			<section className="grid gap-6">
				<SectionHead title={t("sections.stocks")} />
				<div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
					{STOCK_ORDER.map((k) => (
						<SwatchCard key={k} stock={STOCKS[k]} tabLabel={STOCKS[k].slug}>
							<div className="h-24" style={{ background: STOCKS[k].color }} />
							<div className="p-3 grid gap-1">
								<span className="text-sm font-medium">{t(`stockNames.${k}`)}</span>
								<code className="font-mono text-[11.5px] text-nl-russet">--stock-{k}</code>
							</div>
						</SwatchCard>
					))}
				</div>
				<div className="flex flex-wrap gap-3">
					{[
						["board", "bg-nl-linen", "--nl-linen"],
						["stock", "bg-nl-pearl", "--nl-pearl"],
						["binderInk", "bg-nl-cacao", "--nl-cacao"],
						["pencil", "bg-nl-russet", "--nl-russet"],
						["cutterOrange", "bg-nl-amber", "--nl-amber"],
						["binderBlack", "bg-nl-espresso", "--nl-espresso"],
					].map(([name, cls, token]) => (
						<div key={name} className="flex items-center gap-2.5 bg-nl-pearl rounded-md shadow-card p-2 pe-4">
							<span className={`h-10 w-10 rounded-sm ring-1 ring-inset ring-black/10 ${cls}`} />
							<span className="grid">
								<span className="text-sm font-medium">{t(`tokens.${name}`)}</span>
								<code className="font-mono text-[11.5px] text-nl-russet">{token}</code>
							</span>
						</div>
					))}
				</div>
			</section>

			<section className="grid gap-6">
				<SectionHead title={t("sections.type")} />
				<div className="bg-nl-pearl rounded-md shadow-card p-6 grid gap-5">
					<p className="font-display font-bold [font-stretch:112%] text-[56px] leading-none tracking-[-0.03em] m-0">{t("specimen.display")}</p>
					<p className="font-display font-semibold text-[28px] leading-tight tracking-[-0.015em] m-0">{t("specimen.headline")}</p>
					<p className="text-[15px] max-w-[65ch] m-0">
						{t("specimen.body")}
					</p>
					<div className="flex flex-wrap items-center gap-4">
						<span className="mill-label">{t("specimen.millLabel")}</span>
						<span className="font-mono text-[13.5px] tabular-nums">350 gsm · 70×100 cm · 0.9 mm</span>
					</div>
				</div>
			</section>

			<section className="grid gap-6">
				<SectionHead title={t("sections.buttons")} />
				<div className="grid md:grid-cols-3 gap-4">
					<div className="bg-nl-pearl rounded-md shadow-card p-5 grid gap-3 content-start">
						<span className="mill-label text-nl-russet">{t("labels.buttons")}</span>
						<div className="flex flex-wrap gap-2">
							<Button variant="signal">{t("buttons.addToCart")}</Button>
							<Button>{t("buttons.requestQuote")}</Button>
							<Button variant="outline">{t("buttons.orderSample")}</Button>
							<Button variant="ghost">{t("buttons.compare")}</Button>
						</div>
						<span className="mill-label text-nl-russet pt-2">{t("labels.stockChips")}</span>
						<div className="flex flex-wrap gap-3">
							{STOCK_ORDER.slice(0, 4).map((k) => (
								<StockChip key={k} stock={STOCKS[k]} label={t(`stockNames.${k}`)} />
							))}
						</div>
					</div>
					<div className="bg-nl-pearl rounded-md shadow-card p-5 grid gap-3 content-start">
						<span className="mill-label text-nl-russet">{t("labels.millLabel")}</span>
						<MillLabel
							specs={[
								{ label: t("specs.grammage"), value: "1250 gsm" },
								{ label: t("specs.thickness"), value: "2.0 mm" },
								{ label: t("specs.sheet"), value: "70 × 100 cm" },
								{ label: t("specs.finish"), value: t("specs.uncoated") },
							]}
						/>
						<MillLabel
							variant="inline"
							specs={[
								{ label: t("specs.grammage"), value: "350 gsm" },
								{ label: t("specs.sheet"), value: "70×100" },
							]}
						/>
					</div>
					<div className="bg-nl-pearl rounded-md shadow-card p-5 grid gap-3 content-start">
						<span className="mill-label text-nl-russet">{t("labels.priceTags")}</span>
						<PriceTag amount={480} locale={locale} unit="sheet" size="lg" />
						<PriceTag amount={410} locale={locale} unit="sheet" from />
						<PriceTag amount={9600} locale={locale} unit="roll" compareAt={11200} />
					</div>
				</div>
			</section>

			<section className="grid gap-6">
				<SectionHead title={t("sections.cards")} action={{ href: `/${locale}`, label: t("backToStore") }} />
				<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
					{(
						[
							["paper", "Art board, matte", "Gulf Paper Supply", 480, "sheet", ["350 gsm", "70×100"]],
							["leather", "PU leather, pebble grain", "Sharjah Leather House", 3800, "metre", ["0.9 mm", "137 cm"]],
							["hardware", "Neodymium box magnets", "Jebel Ali Fittings", 2500, "pack of 50", ["10×2 mm"]],
							["packaging", "Kraft mailer box", "Al Qusais Board Co.", 190, "box", ["E-flute", "30×20×8"]],
						] as const
					).map(([k, name, vendor, price, unit, specs]) => (
						<SwatchCard key={k} stock={STOCKS[k]} tabLabel={STOCKS[k].slug.replace("-", " & ")}>
							<div className="aspect-[4/3]" style={{ background: `linear-gradient(135deg, ${STOCKS[k].color}, hsl(var(--nl-cacao)))` }} />
							<div className="p-4 grid gap-2">
								<span className="text-[12.5px] text-nl-russet">{vendor}</span>
								<span className="font-display font-semibold text-[15.5px] leading-tight">{name}</span>
								<MillLabel variant="inline" specs={specs.map((v) => ({ label: v, value: v }))} />
								<div className="pt-2 border-t border-dashed border-nl-cacao/15">
									<PriceTag amount={price} locale={locale} unit={unit} />
								</div>
							</div>
						</SwatchCard>
					))}
				</div>
			</section>
		</div>
	);
}
