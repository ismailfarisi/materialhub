import { cn } from "@/lib/utils";

export interface Spec {
	label: string;
	value: string;
}

/**
 * Mill label — the spec block printed on a ream or roll wrapper.
 * Condensed caps for the key, mono for the value, ruled rows.
 * `variant="inline"` renders compact chips for cards and lists.
 */
export function MillLabel({
	specs,
	variant = "table",
	className,
}: {
	specs: Spec[];
	variant?: "table" | "inline";
	className?: string;
}) {
	if (specs.length === 0) return null;
	if (variant === "inline") {
		return (
			<ul className={cn("flex flex-wrap gap-1.5 list-none p-0 m-0", className)}>
				{specs.map((s) => (
					<li
						key={s.label}
						title={s.label}
						className="inline-flex items-center h-6 px-1.5 rounded-sm border border-nl-cacao/15 bg-nl-linen/60 font-mono text-[11.5px] leading-none text-nl-cacao tabular-nums"
					>
						{s.value}
					</li>
				))}
			</ul>
		);
	}
	return (
		<dl
			className={cn(
				"grid grid-cols-[minmax(0,auto)_1fr] border-t-2 border-nl-cacao m-0",
				className,
			)}
		>
			{specs.map((s) => (
				<div key={s.label} className="contents">
					<dt className="mill-label text-nl-russet py-2.5 pe-4 border-b border-nl-cacao/12 flex items-center">
						{s.label}
					</dt>
					<dd className="m-0 py-2.5 border-b border-nl-cacao/12 font-mono text-[13.5px] text-nl-cacao tabular-nums text-end">
						{s.value}
					</dd>
				</div>
			))}
		</dl>
	);
}
