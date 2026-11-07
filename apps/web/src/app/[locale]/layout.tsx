import { CartSlideOver } from "@/components/cart/cart-slide-over";
import { ConsentBanner } from "@/components/consent/consent-banner";
import { Footer } from "@/components/layout/footer";
import { HeaderServer } from "@/components/layout/header-server";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { Providers } from "@/components/providers";
import { ChatWidget } from "@/components/support/chat-widget";
import { GclidCapture } from "@/components/tracking/gclid-capture";
import { PageViewFire } from "@/components/tracking/page-view-fire";
import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { Archivo, Geist, Geist_Mono, Readex_Pro } from "next/font/google";
import { notFound } from "next/navigation";
import Script from "next/script";
import { routing } from "../../../i18n/routing";
import { SITE_URL } from "@/lib/seo/config";
import "../globals.css";

// Swatch Book type system (see /DESIGN.md): Archivo for display and, at its
// condensed width, mill-label caps; Geist for UI and body copy; Geist Mono
// for spec values (GSM, mm, cm, SKUs).
const display = Archivo({
	subsets: ["latin"],
	axes: ["wdth"],
	variable: "--font-display",
	display: "swap",
});

const sans = Geist({
	subsets: ["latin"],
	variable: "--font-sans",
	display: "swap",
});

const mono = Geist_Mono({
	subsets: ["latin"],
	variable: "--font-mono",
	display: "swap",
});

// Latin faces have no Arabic glyphs; the `ar` locale falls through to Readex.
const arabic = Readex_Pro({
	subsets: ["arabic"],
	variable: "--font-arabic",
	display: "swap",
});

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: string }>;
}): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "home" });
	return {
		metadataBase: new URL(SITE_URL),
		title: {
			default: t("title"),
			template: "%s | MaterialHub",
		},
		description: t("description"),
		manifest: "/manifest.webmanifest",
	};
}

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
			className={`${display.variable} ${sans.variable} ${mono.variable} ${arabic.variable}`}
		>
			<body className="min-h-screen flex flex-col font-sans">
				<NextIntlClientProvider messages={messages} locale={locale}>
					<Providers>
						<GclidCapture />
						<PageViewFire />
						<HeaderServer />
						<main className="flex-1">{children}</main>
						<Footer />
						<MobileTabBar />
						<CartSlideOver />
						<ChatWidget />
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
