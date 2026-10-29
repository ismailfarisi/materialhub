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

export function GroupSwatches({ label, members, locale }: GroupSwatchesProps) {
	if (!members || members.length <= 1) return null;

	return (
		<div className="mb-6">
			<div className="text-[9px] tracking-[0.22em] uppercase text-nl-russet/70 mb-2.5">
				{label}
			</div>
			<div className="flex flex-wrap gap-2">
				{members.map((member) => {
					const swatchContent = member.swatch.image ? (
						<img
							src={member.swatch.image}
							alt={member.name}
							className="w-full h-full object-cover"
						/>
					) : (
						<span
							aria-hidden="true"
							className="w-full h-full block"
							style={{
								background:
									member.swatch.hex ??
									"linear-gradient(160deg,#C2865C,#7C4C35)",
							}}
						/>
					);

					const sharedClass = cn(
						"relative w-9 h-9 overflow-hidden border transition-colors flex-shrink-0",
						member.is_current
							? "border-nl-cacao ring-2 ring-nl-cacao ring-offset-1"
							: "border-nl-cacao/20 hover:border-nl-russet/60",
					);

					if (member.is_current) {
						return (
							<span
								key={member.slug}
								aria-current="true"
								aria-label={`${member.name} (current)`}
								title={member.name}
								className={sharedClass}
							>
								{swatchContent}
							</span>
						);
					}

					return (
						<Link
							key={member.slug}
							href={`/${locale}/product/${member.slug}`}
							aria-label={member.name}
							title={member.name}
							className={sharedClass}
						>
							{swatchContent}
						</Link>
					);
				})}
			</div>
		</div>
	);
}
