"use client";

import { Minus, Plus } from "lucide-react";
import { useState } from "react";

interface Props {
	title: string;
	count?: number;
	defaultOpen?: boolean;
	children: React.ReactNode;
}

export function FilterGroupShell({
	title,
	count,
	defaultOpen = true,
	children,
}: Props) {
	const [open, setOpen] = useState(defaultOpen);
	return (
		<div className="border-t border-nl-cacao/10 py-5">
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				aria-expanded={open}
				className="flex w-full items-center justify-between bg-transparent p-0 text-left text-nl-cacao"
			>
				<span className="font-serif text-[17px] tracking-[-0.005em]">
					{title}
					{count != null && (
						<span className="ms-1 text-[13px] text-nl-russet">· {count}</span>
					)}
				</span>
				{open ? (
					<Minus className="h-3.5 w-3.5 text-nl-russet" strokeWidth={1.25} />
				) : (
					<Plus className="h-3.5 w-3.5 text-nl-russet" strokeWidth={1.25} />
				)}
			</button>
			{open && <div className="mt-4">{children}</div>}
		</div>
	);
}

interface RowProps {
	label: string;
	count?: number;
	checked: boolean;
	onChange: () => void;
	ariaLabel?: string;
}

export function FilterCheckRow({
	label,
	count,
	checked,
	onChange,
	ariaLabel,
}: RowProps) {
	return (
		<label className="flex cursor-pointer items-center gap-2.5 py-[5px] text-[13px] text-nl-cacao">
			<span className="relative inline-flex h-3.5 w-3.5 flex-none items-center justify-center">
				<input
					type="checkbox"
					aria-label={ariaLabel ?? label}
					checked={checked}
					onChange={onChange}
					className="peer absolute inset-0 m-0 cursor-pointer appearance-none border border-nl-cacao/35 bg-transparent checked:border-nl-cacao checked:bg-nl-cacao focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nl-amber/50"
				/>
				<svg
					viewBox="0 0 10 10"
					className="pointer-events-none relative h-2.5 w-2.5 text-nl-linen opacity-0 peer-checked:opacity-100"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden="true"
				>
					<polyline points="1.5,5.5 4,8 8.5,2.5" />
				</svg>
			</span>
			<span className="flex-1">{label}</span>
			{count != null && (
				<span className="text-[11px] text-nl-russet/70">{count}</span>
			)}
		</label>
	);
}
