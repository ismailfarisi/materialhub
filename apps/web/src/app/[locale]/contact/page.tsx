import { ContactForm } from "@/components/content/contact-form";
import { StaticPageLayout } from "@/components/layout/static-page-layout";
import { buildAlternates } from "@/lib/seo/alternates";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: string }>;
}): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "content.contact" });
	return {
		title: t("meta.title"),
		description: t("meta.description"),
		alternates: buildAlternates(locale, "/contact"),
	};
}

const PHONE = "+971 50 301 9357";
const LINES = [
	{ key: "general", email: "info@materialhubuae.com" },
	{ key: "help", email: "help@materialhubuae.com" },
	{ key: "press", email: "info@materialhubuae.com" },
] as const;

export default async function ContactPage() {
	const locale = await getLocale();
	const t = await getTranslations("content.contact");

	return (
		<StaticPageLayout eyebrow={t("crumb")} title={t("title")} intro={t("intro")}>
			<div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-16 items-start">
				<ContactForm />
				<aside aria-labelledby="contact-lines" className="grid gap-4">
					<h2
						id="contact-lines"
						className="m-0 font-display text-[22px] font-semibold tracking-[-0.02em]"
					>
						{t("detailsTitle")}
					</h2>
					<dl className="m-0 grid border-t-2 border-nl-cacao">
						<div className="grid gap-1 py-3 border-b border-nl-cacao/12">
							<dt className="mill-label text-nl-russet">{t("phone")}</dt>
							<dd className="m-0">
								<a
									href={`tel:${PHONE.replace(/\s/g, "")}`}
									dir="ltr"
									className="font-mono text-[15px] tabular-nums text-nl-cacao underline decoration-nl-cacao/30 underline-offset-[0.2em] hover:decoration-nl-amber"
								>
									{PHONE}
								</a>
							</dd>
						</div>
						{LINES.map((l) => (
							<div key={l.key} className="grid gap-1 py-3 border-b border-nl-cacao/12">
								<dt className="mill-label text-nl-russet">{t(l.key)}</dt>
								<dd className="m-0">
									<a
										href={`mailto:${l.email}`}
										dir="ltr"
										className="font-mono text-[14px] text-nl-cacao underline decoration-nl-cacao/30 underline-offset-[0.2em] hover:decoration-nl-amber break-all"
									>
										{l.email}
									</a>
								</dd>
							</div>
						))}
						<div className="grid gap-1 py-3 border-b border-nl-cacao/12">
							<dt className="mill-label text-nl-russet">{t("sellers")}</dt>
							<dd className="m-0 text-[15px]">
								<Link
									href={`/${locale}/sell`}
									className="text-nl-cacao underline decoration-nl-cacao/30 underline-offset-[0.2em] hover:decoration-nl-amber"
								>
									{t("sellersLink")}
								</Link>
							</dd>
						</div>
					</dl>
					<p className="m-0 text-[14px] text-nl-russet">{t("languages")}</p>
				</aside>
			</div>
		</StaticPageLayout>
	);
}
