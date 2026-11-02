import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * A horizontal step track: one ruled segment per milestone, like the scale
 * on a cutting mat. Done segments are success green with a check, the
 * current one is binder ink, upcoming ones are a hairline. Status colours,
 * never stock colours.
 */
export function StepTrack({
	steps,
	current,
	label,
	className,
}: {
	steps: { key: string; label: ReactNode }[];
	/** Index of the current step; -1 when none is reached yet. */
	current: number;
	label?: string;
	className?: string;
}) {
	return (
		<ol
			aria-label={label}
			className={cn("m-0 grid list-none gap-1.5 p-0", className)}
			style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
		>
			{steps.map((s, i) => {
				const done = i < current;
				const now = i === current;
				return (
					<li key={s.key} aria-current={now ? "step" : undefined} className="grid min-w-0 content-start gap-2">
						<span
							aria-hidden="true"
							className={cn(
								"h-1 rounded-[1px]",
								done ? "bg-green-700" : now ? "bg-nl-cacao" : "bg-nl-cacao/12",
							)}
						/>
						<span
							className={cn(
								"flex min-w-0 items-start gap-1 text-[12.5px] leading-tight",
								done ? "text-nl-cacao" : now ? "font-medium text-nl-cacao" : "text-nl-russet",
							)}
						>
							{done && (
								<svg
									width="12"
									height="12"
									viewBox="0 0 12 12"
									fill="none"
									stroke="currentColor"
									strokeWidth="1.75"
									className="mt-px shrink-0 text-green-700"
									aria-hidden="true"
								>
									<title>Completed</title>
									<path d="M2 6.5 L5 9 L10 3" />
								</svg>
							)}
							<span className="min-w-0 break-words">{s.label}</span>
						</span>
					</li>
				);
			})}
		</ol>
	);
}
