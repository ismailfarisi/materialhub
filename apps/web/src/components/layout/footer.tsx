import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { STOCKS, STOCK_ORDER } from "@/components/swatch/stock";
import { Logo } from "./logo";
import {
	BadgeCheck,
	Instagram,
	Layers,
	Linkedin,
	Truck,
	Wallet,
	Youtube,
} from "lucide-react";
import type { SVGProps } from "react";

// Inline brand glyphs for marks lucide-react doesn't ship: the post-rebrand
// X mark and the TikTok musical-note. Stroke-based; rendered with currentColor
// so they inherit the footer hover/focus colors like the lucide icons do.
function XIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
			<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.451-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644z" />
		</svg>
	);
}
function TikTokIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
			<path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.95A8.16 8.16 0 0 0 21.58 11V7.6a4.83 4.83 0 0 1-1.99-.91z" />
		</svg>
	);
}

const COLUMNS: Array<{
	headingKey: "about" | "help" | "sell" | "categories";
	items: Array<{ label: string; href: string }>;
}> = [
	{
		headingKey: "about",
		items: [
			{ label: "About Us", href: "/about" },
			{ label: "Careers", href: "/careers" },
			{ label: "Contact", href: "/contact" },
			{ label: "Press", href: "/press" },
		],
	},
	{
		headingKey: "help",
		items: [
			{ label: "FAQ", href: "/faq" },
			{ label: "Shipping Info", href: "/shipping" },
			{ label: "Returns", href: "/returns" },
			{ label: "Track order", href: "/account/orders" },
		],
	},
	{
		headingKey: "sell",
		items: [
			{ label: "Become a Vendor", href: "/sell" },
			{ label: "Privacy Policy", href: "/privacy" },
			{ label: "Terms of Service", href: "/terms" },
			{ label: "Brand directory", href: "/brands" },
		],
	},
	{
		headingKey: "categories",
		items: [
			{ label: "Packaging papers", href: "/c/papers-boards" },
			{ label: "Boxes & packaging", href: "/c/boxes-packaging" },
			{ label: "PU leather", href: "/c/pu-leather" },
			{ label: "Hinges & hardware", href: "/c/hardware-fittings" },
		],
	},
];

const SOCIALS = [
	{
		Icon: Instagram,
		href: "https://www.instagram.com/materialhub.uaeofficial",
		label: "Instagram",
	},
	{
		Icon: TikTokIcon,
		href: "https://www.tiktok.com/@materialhub_uae_official",
		label: "TikTok",
	},
	{
		Icon: Youtube,
		// @MaterialHubuae is NOT ours — it resolves to an unrelated personal
		// channel (@Keerthanasuresh123). The real one is @MATERIALHUB-UAE
		// ("MaterialHub UAE").
		href: "https://www.youtube.com/@MATERIALHUB-UAE",
		label: "YouTube",
	},
	{
		Icon: XIcon,
		href: "https://x.com/MaterialHubUae",
		label: "X (formerly Twitter)",
	},
	{
		Icon: Linkedin,
		href: "https://www.linkedin.com/company/materialhub-uae/",
		label: "LinkedIn",
	},
];

const PAYMENT_METHODS = ["Visa", "Mastercard", "Amex", "Apple Pay", "Tabby", "Tamara", "COD"];

const VALUE_PROPS = [
	{
		Icon: BadgeCheck,
		title: "Verified suppliers",
		body: "Every vendor is KYC-checked before listing.",
	},
	{
		Icon: Layers,
		title: "Sheet to carton",
		body: "Buy a sample pack or a full production run.",
	},
	{
		Icon: Truck,
		title: "UAE-wide delivery",
		body: "Free shipping on orders over AED 150.",
	},
	{
		Icon: Wallet,
		title: "Flexible payment",
		body: "Card, Tabby, Tamara or cash on delivery.",
	},
];

export async function Footer() {
	const t = await getTranslations("footer");
	const locale = await getLocale();
	const year = new Date().getFullYear();

	return (
		<footer className="bg-nl-espresso text-white/70 mt-auto">
			{/* The book's edge: one band per category stock. */}
			<div aria-hidden="true" className="flex h-1.5">
				{STOCK_ORDER.map((k) => (
					<span key={k} className="flex-1" style={{ background: STOCKS[k].color }} />
				))}
			</div>
			<div className="max-w-[1400px] mx-auto px-4 md:px-8">
				{/* Value strip — what makes buying materials here different */}
				<ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-nl-pearl/10 border-b border-nl-pearl/10 -mx-4 md:mx-0 list-none p-0 m-0">
					{VALUE_PROPS.map(({ Icon, title, body }) => (
						<li
							key={title}
							className="bg-nl-espresso px-4 md:px-6 py-5 md:py-8 flex items-start gap-3.5"
						>
							<span className="h-9 w-9 shrink-0 rounded-md bg-nl-amber/15 text-nl-amber inline-flex items-center justify-center">
								<Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
							</span>
							<span>
								<span className="block text-sm font-medium text-nl-pearl">{title}</span>
								<span className="block text-[13px] leading-snug mt-0.5">{body}</span>
							</span>
						</li>
					))}
				</ul>

				<div className="grid grid-cols-2 md:grid-cols-[1.6fr_1fr_1fr_1fr_1fr] gap-10 md:gap-12 pt-12 md:pt-16 pb-10 md:pb-14">
					<div className="col-span-2 md:col-span-1">
						<Link
							href={`/${locale}`}
							className="inline-flex items-center mb-5 rounded-md"
							aria-label="MaterialHub"
						>
							<Logo className="text-nl-pearl" />
						</Link>
						<p className="font-display text-xl md:text-2xl font-semibold leading-[1.2] tracking-[-0.015em] text-white max-w-[340px] mb-6">
							Papers, boards, leathers and fittings from UAE suppliers, in one place.
						</p>
						<div className="flex gap-2">
							{SOCIALS.map(({ Icon, href, label }) => (
								<a
									key={label}
									href={href}
									target="_blank"
									rel="noreferrer noopener"
									aria-label={label}
									className="w-10 h-10 rounded-md bg-white/[0.07] flex items-center justify-center hover:bg-nl-amber hover:text-white text-nl-pearl/80 transition-colors"
								>
									<Icon className="h-4 w-4" strokeWidth={1.75} />
								</a>
							))}
						</div>
					</div>

					{COLUMNS.map((col) => (
						<div key={col.headingKey}>
							<h3 className="mill-label text-white/60 mb-4">
								{t(col.headingKey)}
							</h3>
							<ul className="flex flex-col gap-3 text-sm leading-[1.4]">
								{col.items.map((item) => (
									<li key={item.label}>
										<Link
											href={`/${locale}${item.href}`}
											className="hover:text-nl-pearl transition-colors"
										>
											{item.label}
										</Link>
									</li>
								))}
							</ul>
						</div>
					))}
				</div>

				<div className="py-6 border-t border-nl-pearl/10 flex flex-col md:flex-row md:items-center md:justify-between gap-4 text-[13px]">
					<span>{t("copyright", { year })}</span>
					<div className="flex flex-wrap items-center gap-1.5">
						<span className="me-1.5">We accept</span>
						{PAYMENT_METHODS.map((p) => (
							<span
								key={p}
								className="h-7 px-2.5 inline-flex items-center rounded-md bg-nl-pearl/[0.06] text-[12px] font-medium text-nl-pearl/85"
							>
								{p}
							</span>
						))}
					</div>
					<span>Dubai · Abu Dhabi · Sharjah</span>
				</div>
			</div>
		</footer>
	);
}
