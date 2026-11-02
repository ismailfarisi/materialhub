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
import { setRequestLocale } from "next-intl/server";

export const metadata: Metadata = {
	title: "Design system",
	robots: { index: false, follow: false },
};

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

	return (
		<div className="max-w-[1400px] mx-auto px-4 md:px-8 py-10 md:py-16 grid gap-16">
			<header className="grid md:grid-cols-[1.1fr_1fr] gap-8 items-center">
				<div className="grid gap-4">
										<h1 className="font-display font-bold [font-stretch:112%] text-[clamp(36px,5vw,68px)] leading-[1] tracking-[-0.03em] m-0">
						Every category is a stock. Every product is a swatch.
					</h1>
					<p className="text-nl-russet text-[17px] max-w-[56ch] m-0">
						Components, colour and type for the storefront. Read DESIGN.md for the rules;
						this page shows them working.
					</p>
				</div>
				<FanDeck className="max-w-[520px] justify-self-center" />
			</header>

			<section className="grid gap-6">
				<SectionHead title="Category stocks" />
				<div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
					{STOCK_ORDER.map((k) => (
						<SwatchCard key={k} stock={STOCKS[k]} tabLabel={STOCKS[k].slug}>
							<div className="h-24" style={{ background: STOCKS[k].color }} />
							<div className="p-3 grid gap-1">
								<span className="text-sm font-medium">{STOCKS[k].material}</span>
								<code className="font-mono text-[11.5px] text-nl-russet">--stock-{k}</code>
							</div>
						</SwatchCard>
					))}
				</div>
				<div className="flex flex-wrap gap-3">
					{[
						["Board", "bg-nl-linen", "--nl-linen"],
						["Stock", "bg-nl-pearl", "--nl-pearl"],
						["Binder ink", "bg-nl-cacao", "--nl-cacao"],
						["Pencil", "bg-nl-russet", "--nl-russet"],
						["Cutter orange", "bg-nl-amber", "--nl-amber"],
						["Binder black", "bg-nl-espresso", "--nl-espresso"],
					].map(([name, cls, token]) => (
						<div key={name} className="flex items-center gap-2.5 bg-nl-pearl rounded-md shadow-card p-2 pe-4">
							<span className={`h-10 w-10 rounded-sm ring-1 ring-inset ring-black/10 ${cls}`} />
							<span className="grid">
								<span className="text-sm font-medium">{name}</span>
								<code className="font-mono text-[11.5px] text-nl-russet">{token}</code>
							</span>
						</div>
					))}
				</div>
			</section>

			<section className="grid gap-6">
				<SectionHead title="Archivo, Geist, Geist Mono" />
				<div className="bg-nl-pearl rounded-md shadow-card p-6 grid gap-5">
					<p className="font-display font-bold [font-stretch:112%] text-[56px] leading-none tracking-[-0.03em] m-0">Greyboard 2.0 mm</p>
					<p className="font-display font-semibold text-[28px] leading-tight tracking-[-0.015em] m-0">Rigid box materials, sheet to carton</p>
					<p className="text-[15px] max-w-[65ch] m-0">
						Geist carries the interface and running text. Order a sample pack before a production run;
						every listing names its supplier, unit of measure and price per unit.
					</p>
					<div className="flex flex-wrap items-center gap-4">
						<span className="mill-label">Mill label · condensed caps</span>
						<span className="font-mono text-[13.5px] tabular-nums">350 gsm · 70×100 cm · 0.9 mm</span>
					</div>
				</div>
			</section>

			<section className="grid gap-6">
				<SectionHead title="Buttons, specs and prices" />
				<div className="grid md:grid-cols-3 gap-4">
					<div className="bg-nl-pearl rounded-md shadow-card p-5 grid gap-3 content-start">
						<span className="mill-label text-nl-russet">Buttons</span>
						<div className="flex flex-wrap gap-2">
							<Button variant="signal">Add to cart</Button>
							<Button>Request quote</Button>
							<Button variant="outline">Order sample</Button>
							<Button variant="ghost">Compare</Button>
						</div>
						<span className="mill-label text-nl-russet pt-2">Stock chips</span>
						<div className="flex flex-wrap gap-3">
							{STOCK_ORDER.slice(0, 4).map((k) => (
								<StockChip key={k} stock={STOCKS[k]} label={STOCKS[k].material} />
							))}
						</div>
					</div>
					<div className="bg-nl-pearl rounded-md shadow-card p-5 grid gap-3 content-start">
						<span className="mill-label text-nl-russet">Mill label</span>
						<MillLabel
							specs={[
								{ label: "Grammage", value: "1250 gsm" },
								{ label: "Thickness", value: "2.0 mm" },
								{ label: "Sheet", value: "70 × 100 cm" },
								{ label: "Finish", value: "Uncoated" },
							]}
						/>
						<MillLabel
							variant="inline"
							specs={[
								{ label: "Grammage", value: "350 gsm" },
								{ label: "Sheet", value: "70×100" },
							]}
						/>
					</div>
					<div className="bg-nl-pearl rounded-md shadow-card p-5 grid gap-3 content-start">
						<span className="mill-label text-nl-russet">Price tags</span>
						<PriceTag amount={480} locale={locale} unit="sheet" size="lg" />
						<PriceTag amount={410} locale={locale} unit="sheet" from />
						<PriceTag amount={9600} locale={locale} unit="roll" compareAt={11200} />
					</div>
				</div>
			</section>

			<section className="grid gap-6">
				<SectionHead title="Swatch cards" action={{ href: `/${locale}`, label: "Back to the store" }} />
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
