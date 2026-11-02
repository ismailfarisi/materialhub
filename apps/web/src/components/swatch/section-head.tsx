import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Section heading: an Archivo headline with an optional one-line description
 * and an optional "View all" link on the trailing edge. No kicker or eyebrow
 * above the heading (Impeccable craft-floor ban): the heading carries itself.
 */
export function SectionHead({
	title,
	description,
	action,
	className,
	as: H = "h2",
}: {
	title: ReactNode;
	description?: ReactNode;
	action?: { href: string; label: string };
	className?: string;
	as?: "h1" | "h2" | "h3";
}) {
	return (
		<div className={cn("flex items-end justify-between gap-4", className)}>
			<div className="min-w-0 grid gap-1.5">
				<H className="font-display font-semibold text-[clamp(22px,2.6vw,32px)] leading-[1.08] tracking-[-0.02em] text-nl-cacao m-0">
					{title}
				</H>
				{description && (
					<p className="m-0 text-[15px] leading-snug text-nl-russet max-w-[65ch]">{description}</p>
				)}
			</div>
			{action && (
				<Link
					href={action.href}
					className="group inline-flex items-center gap-1.5 shrink-0 text-sm font-medium text-nl-cacao underline decoration-nl-cacao/25 hover:decoration-nl-amber"
				>
					{action.label}
					<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" strokeWidth={1.75} />
				</Link>
			)}
		</div>
	);
}
