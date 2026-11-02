"use client";

import { cn } from "@/lib/utils";
import { Minus, Plus } from "lucide-react";

/**
 * Quantity stepper for cart lines. The value is mono and tabular so columns of
 * quantities line up; the buttons disable at the limits rather than clamping
 * silently, and `limitHint` explains why when a limit is reached.
 */
export function QtyStepper({
	value,
	onChange,
	min = 1,
	max,
	pending = false,
	disabled = false,
	label,
	decreaseLabel,
	increaseLabel,
	size = "md",
	className,
}: {
	value: number;
	onChange: (qty: number) => void;
	min?: number;
	max?: number;
	pending?: boolean;
	disabled?: boolean;
	/** Accessible name for the group, e.g. "Quantity for Kraft paper 120 gsm". */
	label: string;
	decreaseLabel: string;
	increaseLabel: string;
	size?: "sm" | "md";
	className?: string;
}) {
	const atMin = value <= min;
	const atMax = max != null && value >= max;
	const btn = size === "sm" ? "h-8 w-8" : "h-10 w-10";
	return (
		// biome-ignore lint/a11y/useSemanticElements: a <fieldset> breaks the inline-flex stepper layout; role=group + aria-label is equivalent
		<div
			role="group"
			aria-label={label}
			aria-busy={pending || undefined}
			className={cn(
				"inline-flex items-center rounded-md border border-nl-cacao/20 bg-nl-pearl",
				(disabled || pending) && "opacity-60",
				className,
			)}
		>
			<button
				type="button"
				onClick={() => onChange(Math.max(min, value - 1))}
				disabled={disabled || pending || atMin}
				aria-label={decreaseLabel}
				className={cn(
					btn,
					"grid place-items-center rounded-s-md text-nl-cacao transition-colors hover:bg-nl-cacao/[0.06] disabled:cursor-not-allowed disabled:text-nl-cacao/30 disabled:hover:bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-nl-amber",
				)}
			>
				<Minus className="h-3.5 w-3.5" strokeWidth={1.75} />
			</button>
			<output
				aria-live="polite"
				className={cn(
					"min-w-[2.5rem] px-1 text-center font-mono text-[13.5px] tabular-nums text-nl-cacao border-x border-nl-cacao/12",
					size === "sm" ? "leading-8" : "leading-10",
				)}
			>
				{value}
			</output>
			<button
				type="button"
				onClick={() => onChange(max != null ? Math.min(max, value + 1) : value + 1)}
				disabled={disabled || pending || atMax}
				aria-label={increaseLabel}
				className={cn(
					btn,
					"grid place-items-center rounded-e-md text-nl-cacao transition-colors hover:bg-nl-cacao/[0.06] disabled:cursor-not-allowed disabled:text-nl-cacao/30 disabled:hover:bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-nl-amber",
				)}
			>
				<Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
			</button>
		</div>
	);
}
