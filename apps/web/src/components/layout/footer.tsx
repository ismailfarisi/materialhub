import { getLocale, getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import { Instagram, Linkedin, Youtube } from "lucide-react";
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
			{ label: "Skincare", href: "/c/skincare" },
			{ label: "Makeup", href: "/c/makeup" },
			{ label: "Fragrance", href: "/c/fragrance" },
			{ label: "Haircare", href: "/c/haircare" },
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
		// ("MaterialHub UAE Beauty").
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

const PAYMENT_METHODS = ["Visa", "Mastercard", "Amex", "Apple Pay", "Tamara"];

export async function Footer() {
	const t = await getTranslations("footer");
	const locale = await getLocale();
	const year = new Date().getFullYear();

	return (
		<footer className="bg-nl-espresso text-nl-pearl mt-auto">
			<div className="max-w-[1400px] mx-auto px-4 md:px-12 pt-12 md:pt-16 pb-6 md:pb-8">
				<div className="grid grid-cols-2 md:grid-cols-[1.6fr_1fr_1fr_1fr_1fr] gap-10 md:gap-12 mb-10 md:mb-12">
					<div className="col-span-2 md:col-span-1">
						<Link
							href={`/${locale}`}
							className="inline-flex items-center mb-5"
							aria-label="MaterialHub"
						>
							<Image
								src="/materialhub-logo.png"
								alt="MaterialHub"
								width={216}
								height={120}
								className="h-16 w-auto"
							/>
						</Link>
						<p className="font-serif italic text-base md:text-lg leading-[1.5] text-nl-linen max-w-[320px] mb-6">
							UAE&rsquo;s curated multi-vendor beauty marketplace.
							Trusted local and international vendors, one address.
						</p>
						<div className="flex gap-2.5">
							{SOCIALS.map(({ Icon, href, label }) => (
								<a
									key={label}
									href={href}
									target="_blank"
									rel="noreferrer noopener"
									aria-label={label}
									className="w-9 h-9 border border-nl-pearl/25 flex items-center justify-center hover:border-nl-amber hover:text-nl-amber text-nl-pearl transition-colors"
								>
									<Icon className="h-4 w-4" strokeWidth={1.25} />
								</a>
							))}
						</div>
					</div>

					{COLUMNS.map((col) => (
						<div key={col.headingKey}>
							<h3 className="text-[10px] tracking-[0.22em] uppercase text-nl-amber mb-4 md:mb-5">
								{t(col.headingKey)}
							</h3>
							<ul className="flex flex-col gap-2.5 text-sm leading-[1.5]">
								{col.items.map((item) => (
									<li key={item.label}>
										<Link
											href={`/${locale}${item.href}`}
											className="text-nl-pearl hover:text-nl-amber transition-colors"
										>
											{item.label}
										</Link>
									</li>
								))}
							</ul>
						</div>
					))}
				</div>

				<div className="pt-6 border-t border-nl-pearl/15 flex flex-col md:flex-row md:items-center md:justify-between gap-4 text-[10px] tracking-[0.18em] uppercase text-nl-pearl/70">
					<span>{t("copyright", { year })}</span>
					<div className="flex flex-wrap items-center gap-2 md:gap-3">
						<span className="opacity-70 me-1">We accept</span>
						{PAYMENT_METHODS.map((p) => (
							<span
								key={p}
								className="px-2.5 py-1 border border-nl-pearl/20 text-[9px] text-nl-pearl"
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
