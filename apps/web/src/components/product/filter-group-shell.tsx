"use client";

import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";

interface Props {
	title: string;
	count?: number;
	defaultOpen?: boolean;
	children: React.ReactNode;
}

/**
 * One collapsible group in the filter rail or sheet: an Archivo title with the
 * option count in mono, a chevron, and a hairline above. Standard disclosure
 * pattern — the button carries aria-expanded and controls the panel.
 */
export function FilterGroupShell({
	title,
	count,
	defaultOpen = true,
	children,
}: Props) {
	const [open, setOpen] = useState(defaultOpen);
	const panelId = useId();
	return (
		<div className="border-t border-nl-cacao/12 py-3">
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				aria-expanded={open}
				aria-controls={panelId}
				className="flex min-h-10 w-full items-center justify-between gap-3 rounded-sm bg-transparent p-0 text-start text-nl-cacao focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber"
			>
				<span className="flex min-w-0 items-baseline gap-2">
					<span className="truncate font-display text-[14.5px] font-semibold tracking-[-0.01em]">
						{title}
					</span>
					{count != null && (
						<span className="font-mono text-[11.5px] tabular-nums text-nl-russet">
							{count}
						</span>
					)}
				</span>
				<ChevronDown
					aria-hidden="true"
					className={cn(
						"h-4 w-4 shrink-0 text-nl-russet transition-transform duration-200 ease-out motion-reduce:transition-none",
						open && "rotate-180",
					)}
					strokeWidth={1.75}
				/>
			</button>
			{open && (
				<div id={panelId} className="pt-1.5 pb-1">
					{children}
				</div>
			)}
		</div>
	);
}

interface RowProps {
	label: string;
	count?: number;
	checked: boolean;
	onChange: () => void;
	ariaLabel?: string;
	/** Measured values (GSM, mm, sizes) set in mono so they line up. */
	mono?: boolean;
	type?: "checkbox" | "radio";
	name?: string;
}

const CONTROL =
	"peer absolute inset-0 m-0 cursor-pointer appearance-none border border-nl-cacao/35 bg-nl-pearl transition-colors hover:border-nl-cacao/70 checked:border-nl-cacao checked:bg-nl-cacao focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber";

/** A checkbox (or radio) row: 40px tall so it is a real touch target in the sheet. */
export function FilterCheckRow({
	label,
	count,
	checked,
	onChange,
	ariaLabel,
	mono = false,
	type = "checkbox",
	name,
}: RowProps) {
	return (
		<label className="-mx-2 flex min-h-10 cursor-pointer items-center gap-3 rounded-sm px-2 text-[14px] text-nl-cacao transition-colors hover:bg-nl-cacao/[0.04]">
			<span className="relative inline-flex h-4 w-4 flex-none items-center justify-center">
				<input
					type={type}
					name={name}
					aria-label={ariaLabel ?? label}
					checked={checked}
					onChange={onChange}
					onClick={type === "radio" && checked ? onChange : undefined}
					className={cn(CONTROL, type === "radio" ? "rounded-full" : "rounded-sm")}
				/>
				{type === "radio" ? (
					<span
						aria-hidden="true"
						className="pointer-events-none relative h-1.5 w-1.5 rounded-full bg-white opacity-0 peer-checked:opacity-100"
					/>
				) : (
					<svg
						viewBox="0 0 10 10"
						className="pointer-events-none relative h-2.5 w-2.5 text-white opacity-0 peer-checked:opacity-100"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.75"
						strokeLinecap="round"
						strokeLinejoin="round"
						aria-hidden="true"
					>
						<polyline points="1.5,5.5 4,8 8.5,2.5" />
					</svg>
				)}
			</span>
			<span
				className={cn(
					"min-w-0 flex-1 truncate",
					mono && "font-mono text-[13px] tabular-nums",
				)}
			>
				{label}
			</span>
			{count != null && (
				<span className="font-mono text-[11.5px] tabular-nums text-nl-russet">
					{count}
				</span>
			)}
		</label>
	);
}
