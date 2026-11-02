"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";

export type ColorGroupMember = {
	slug: string;
	name: string;
	swatch: { hex: string | null; image: string | null };
	image: string | null;
	price: number;
	is_current: boolean;
};

interface GroupSwatchesProps {
	label: string;
	members: ColorGroupMember[];
	locale: string;
}

/**
 * Sibling listings in the same colour family (separate products, not
 * variants). Each links to its own page. Members with a real hex or swatch
 * image show as colour squares; members without one show their name.
 */
export function GroupSwatches({ label, members, locale }: GroupSwatchesProps) {
	if (!members || members.length <= 1) return null;
	const current = members.find((m) => m.is_current);

	return (
		<nav aria-label={label} className="grid gap-2.5">
			<p className="m-0 flex flex-wrap items-baseline gap-x-2 text-[13px] font-medium text-nl-cacao">
				<span>{label}</span>
				{current && <bdi className="font-normal text-nl-russet">{current.name}</bdi>}
			</p>
			<ul className="m-0 flex list-none flex-wrap gap-2 p-0">
				{members.map((member) => {
					const hasColour = Boolean(member.swatch.hex || member.swatch.image);
					const className = cn(
						"relative flex shrink-0 items-center justify-center rounded-sm transition-[outline-color] duration-150",
						"outline outline-2 outline-offset-2 focus-visible:outline-nl-amber",
						member.is_current ? "outline-nl-cacao" : "outline-transparent hover:outline-nl-cacao/30",
						hasColour
							? "h-10 w-10 bg-cover bg-center ring-1 ring-inset ring-black/15"
							: "h-10 border border-nl-cacao/20 bg-nl-pearl px-3 text-[13px] text-nl-cacao",
					);
					const style = hasColour
						? {
								backgroundColor: member.swatch.hex ?? undefined,
								backgroundImage: member.swatch.image ? `url(${member.swatch.image})` : undefined,
							}
						: undefined;
					const content = hasColour ? null : member.name;
					return (
						<li key={member.slug}>
							{member.is_current ? (
								<span aria-current="page" title={member.name} aria-label={hasColour ? member.name : undefined} className={className} style={style}>
									{content}
								</span>
							) : (
								<Link
									href={`/${locale}/product/${member.slug}`}
									title={member.name}
									aria-label={hasColour ? member.name : undefined}
									className={className}
									style={style}
								>
									{content}
								</Link>
							)}
						</li>
					);
				})}
			</ul>
		</nav>
	);
}
