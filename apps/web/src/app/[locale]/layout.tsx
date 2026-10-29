import { CartSlideOver } from "@/components/cart/cart-slide-over";
import { ConsentBanner } from "@/components/consent/consent-banner";
import { Footer } from "@/components/layout/footer";
import { HeaderServer } from "@/components/layout/header-server";
import { HideOnReels } from "@/components/layout/hide-on-reels";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { Providers } from "@/components/providers";
import { ChatWidget } from "@/components/support/chat-widget";
import { GclidCapture } from "@/components/tracking/gclid-capture";
import { PageViewFire } from "@/components/tracking/page-view-fire";
import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import {
	Antic_Didone,
	DM_Sans,
	Inter_Tight,
	Playfair_Display,
} from "next/font/google";
import { notFound } from "next/navigation";
import Script from "next/script";
import { routing } from "../../../i18n/routing";
import { SITE_URL } from "@/lib/seo/config";
import "../globals.css";

const playfair = Playfair_Display({
	subsets: ["latin"],
	variable: "--font-playfair",
	display: "swap",
});

const dmSans = DM_Sans({
	subsets: ["latin"],
	variable: "--font-dm-sans",
	display: "swap",
});

const anticDidone = Antic_Didone({
	subsets: ["latin"],
	weight: "400",
	variable: "--font-antic",
	display: "swap",
});

const interTight = Inter_Tight({
	subsets: ["latin"],
	variable: "--font-inter-tight",
	display: "swap",
});

export const metadata: Metadata = {
	metadataBase: new URL(SITE_URL),
	title: {
		default: "MaterialHub — UAE Beauty Marketplace",
		template: "%s | MaterialHub",
	},
	description:
		"Shop beauty, fragrance, skincare, makeup and wellness from trusted local and international vendors across the UAE.",
	manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
	width: "device-width",
	initialScale: 1,
	// Shrink the layout viewport when the on-screen keyboard opens, so `dvh`
	// units and vertically centred fixed elements (dialogs, the mobile tab bar)
	// stay inside the strip the keyboard leaves visible instead of sitting
	// behind it. iOS ignores this and is handled by `useKeyboardViewport`.
	interactiveWidget: "resizes-content",
};

const rtlLocales = ["ar"];

export function generateStaticParams() {
	return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
	children,
	params,
}: {
	children: React.ReactNode;
	params: Promise<{ locale: string }>;
}) {
	const { locale } = await params;

	if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
		notFound();
	}

	setRequestLocale(locale);
	const messages = await getMessages();
	const dir = rtlLocales.includes(locale) ? "rtl" : "ltr";

	return (
		<html
			lang={locale}
			dir={dir}
			className={`${playfair.variable} ${dmSans.variable} ${anticDidone.variable} ${interTight.variable}`}
		>
			<body className="min-h-screen flex flex-col font-sans">
				<NextIntlClientProvider messages={messages} locale={locale}>
					<Providers>
						<GclidCapture />
						<PageViewFire />
						<HideOnReels>
							<HeaderServer />
						</HideOnReels>
						<main className="flex-1">{children}</main>
						<HideOnReels>
							<Footer />
						</HideOnReels>
						<MobileTabBar />
						<CartSlideOver />
						<HideOnReels>
							<ChatWidget />
						</HideOnReels>
						<ConsentBanner />
					</Providers>
				</NextIntlClientProvider>
				<Script
					src="https://analytics.ahrefs.com/analytics.js"
					data-key="XS2C/iwzXeOEEWFk8Wws0w"
					strategy="afterInteractive"
				/>
			</body>
		</html>
	);
}
