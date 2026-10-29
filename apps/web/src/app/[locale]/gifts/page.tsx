import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import { apiServer } from "@/lib/api-server";
import type { GiftOccasion } from "@/lib/api/gifts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
	title: "Gifts by occasion — MaterialHub",
	description:
		"Curated gift boxes for every occasion. Beautifully packaged beauty, fragrance and wellness, ready to send.",
};

interface Props {
	params: Promise<{ locale: string }>;
}

async function getOccasions(): Promise<GiftOccasion[]> {
	try {
		const server = await apiServer();
		const res = await server.get("/gift/occasions");
		const list: GiftOccasion[] = Array.isArray(res.data?.data)
			? res.data.data
			: [];
		return list;
	} catch {
		return [];
	}
}

export default async function GiftsPage({ params }: Props) {
	const { locale } = await params;
	setRequestLocale(locale);

	const occasions = await getOccasions();

	return (
		<div className="mx-auto max-w-[1400px] px-4 py-10 md:px-8 md:py-14">
			<header className="mb-10 max-w-2xl">
				<p className="text-[10px] tracking-[0.24em] uppercase text-nl-russet mb-3">
					The gift edit
				</p>
				<h1 className="font-serif text-4xl md:text-5xl text-nl-cacao mb-4">
					Gifts by occasion
				</h1>
				<p className="text-nl-russet">
					Thoughtfully curated boxes for every moment — beautifully packaged
					and ready to send.
				</p>
			</header>

			{occasions.length === 0 ? (
				<p className="text-nl-russet">
					No gift occasions are available right now. Please check back shortly.
				</p>
			) : (
				<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
					{occasions.map((occasion) => (
						<Link
							key={occasion.id}
							href={`/${locale}/gifts/${occasion.slug}`}
							className="group block"
							aria-label={occasion.name}
						>
							<div className="relative aspect-[4/3] overflow-hidden bg-nl-russet/15 mb-3">
								{occasion.image_url ? (
									<Image
										src={occasion.image_url}
										alt={occasion.name}
										fill
										sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 320px"
										className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
									/>
								) : (
									<div className="absolute inset-0 flex items-center justify-center font-serif text-2xl text-nl-russet/40">
										{occasion.name.charAt(0)}
									</div>
								)}
								<div className="absolute inset-0 bg-gradient-to-t from-nl-espresso/40 to-transparent" />
								<h2 className="absolute bottom-3 left-3 right-3 font-serif text-lg text-nl-linen leading-tight">
									{occasion.name}
								</h2>
							</div>
						</Link>
					))}
				</div>
			)}
		</div>
	);
}
