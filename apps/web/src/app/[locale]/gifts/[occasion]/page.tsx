import type { Metadata } from "next";
import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { GiftBoxCard } from "@/components/gifts/GiftBoxCard";
import { apiServer } from "@/lib/api-server";
import type { GiftBoxListResult, GiftOccasion } from "@/lib/api/gifts";

export const dynamic = "force-dynamic";

interface Props {
	params: Promise<{ locale: string; occasion: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { occasion: slug } = await params;
	const server = await apiServer();
	try {
		const { data } = await server.get(`/gift/occasions/${slug}`);
		const occasion = data.data as GiftOccasion;
		return {
			title: `${occasion.name} gifts — MaterialHub`,
			description: `Curated gift boxes for ${occasion.name}, beautifully packaged and ready to send.`,
		};
	} catch {
		return { title: "Gifts" };
	}
}

export default async function GiftOccasionPage({ params }: Props) {
	const { locale, occasion: slug } = await params;
	setRequestLocale(locale);

	const server = await apiServer();

	const occasion = (await server
		.get(`/gift/occasions/${slug}`)
		.then((r) => r.data.data as GiftOccasion)
		.catch(() => null)) as GiftOccasion | null;

	if (!occasion) notFound();

	const boxes = (await server
		.get("/gift/boxes", { params: { occasion: slug, page: 1, perPage: 24 } })
		.then((r) => r.data.data as GiftBoxListResult)
		.catch(() => null)) as GiftBoxListResult | null;

	const items = boxes?.items ?? [];

	return (
		<div className="mx-auto max-w-[1400px] px-4 py-10 md:px-8 md:py-14">
			<nav className="mb-4 text-[11px] tracking-[0.16em] uppercase text-nl-russet">
				<Link href={`/${locale}/gifts`} className="hover:text-nl-amber">
					Gifts
				</Link>
				<span className="mx-2">/</span>
				<span className="text-nl-cacao">{occasion.name}</span>
			</nav>

			<header className="mb-10 max-w-2xl">
				<h1 className="font-serif text-4xl md:text-5xl text-nl-cacao mb-4">
					{occasion.name} gifts
				</h1>
				<p className="text-nl-russet">
					{items.length > 0
						? `${items.length} ${items.length === 1 ? "gift box" : "gift boxes"} curated for ${occasion.name.toLowerCase()}.`
						: "Curated gift boxes, beautifully packaged and ready to send."}
				</p>
			</header>

			{items.length === 0 ? (
				<div className="text-nl-russet">
					<p className="mb-3">
						No gift boxes are available for {occasion.name.toLowerCase()} right
						now.
					</p>
					<Link
						href={`/${locale}/gifts`}
						className="text-nl-amber hover:underline"
					>
						Browse other occasions
					</Link>
				</div>
			) : (
				<div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
					{items.map((entry) => (
						<GiftBoxCard key={entry.box.id} entry={entry} locale={locale} />
					))}
				</div>
			)}
		</div>
	);
}
