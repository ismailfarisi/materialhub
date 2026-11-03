"use client";

import { formatFils } from "@/components/swatch";
import { cn } from "@/lib/utils";
import { AlertCircle, Check } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Checkout building blocks on Swatch Book tokens. Operate surface: standard
 * patterns, ink for selection, orange reserved for the one Pay button.
 */

/** "AED 1,234.50" with tabular numerals, locale-aware digits. */
export function Money({
	fils,
	locale,
	negative = false,
	className,
}: { fils: number; locale: string; negative?: boolean; className?: string }) {
	return (
		<span dir="ltr" className={cn("tabular-nums whitespace-nowrap [unicode-bidi:isolate]", className)}>
			{negative && "−"}
			<span className="text-[0.88em] text-nl-russet">AED</span> {formatFils(fils, locale)}
		</span>
	);
}

/** Numbered checkout section: a white card with a step square and a heading. */
export function Panel({
	id,
	step,
	done = false,
	title,
	action,
	children,
	className,
}: {
	id: string;
	step?: number;
	done?: boolean;
	title: ReactNode;
	action?: ReactNode;
	children: ReactNode;
	className?: string;
}) {
	return (
		<section aria-labelledby={`${id}-title`} className={cn("rounded-md bg-nl-pearl shadow-card", className)}>
			<header className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-6 sm:pt-5">
				<h2 id={`${id}-title`} className="m-0 flex items-center gap-3 font-display text-[17px] font-semibold tracking-[-0.01em] text-nl-cacao">
					{step != null && <StepSquare n={step} done={done} />}
					{title}
				</h2>
				{action}
			</header>
			<div className="px-4 pb-4 pt-4 sm:px-6 sm:pb-6">{children}</div>
		</section>
	);
}

function StepSquare({ n, done }: { n: number; done: boolean }) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				"inline-grid h-6 w-6 shrink-0 place-items-center rounded-sm font-mono text-[12px] tabular-nums",
				done ? "bg-nl-cacao text-white" : "border border-nl-cacao/30 text-nl-cacao",
			)}
		>
			{done ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : n}
		</span>
	);
}

/** Small text-weight action in a panel header ("Change", "Edit"). */
export function PanelAction({ children, onClick, label }: { children: ReactNode; onClick: () => void; label?: string }) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-label={label}
			className="inline-flex h-9 items-center rounded-md px-2.5 text-[13px] font-medium text-nl-cacao underline decoration-nl-cacao/25 underline-offset-4 transition-colors hover:bg-nl-cacao/[0.06] hover:decoration-nl-cacao focus-visible:outline focus-visible:outline-2 focus-visible:outline-nl-amber"
		>
			{children}
		</button>
	);
}

/**
 * A selectable option row backed by a native radio input, so arrow keys,
 * form semantics and screen readers work as expected. Selected = ink.
 */
export function OptionTile({
	name,
	value,
	checked,
	disabled,
	onSelect,
	children,
	className,
}: {
	name: string;
	value: string;
	checked: boolean;
	disabled?: boolean;
	onSelect: () => void;
	children: ReactNode;
	className?: string;
}) {
	return (
		<label
			className={cn(
				"relative flex cursor-pointer items-start gap-3 rounded-md border bg-nl-pearl px-3.5 py-3 transition-[border-color,box-shadow] duration-150",
				checked
					? "border-nl-cacao shadow-[inset_0_0_0_1px_hsl(var(--nl-cacao))]"
					: "border-nl-cacao/20 hover:border-nl-cacao/45",
				disabled && "cursor-not-allowed bg-nl-linen/60 hover:border-nl-cacao/20",
				"has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-nl-amber",
				className,
			)}
		>
			<input
				type="radio"
				name={name}
				value={value}
				checked={checked}
				disabled={disabled}
				onChange={onSelect}
				className="peer sr-only"
			/>
			<RadioDot checked={checked} disabled={disabled} />
			<div className={cn("min-w-0 flex-1", disabled && "opacity-60")}>{children}</div>
		</label>
	);
}

export function RadioDot({ checked, disabled }: { checked: boolean; disabled?: boolean }) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				"mt-0.5 inline-grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border bg-nl-pearl",
				checked ? "border-nl-cacao" : "border-nl-cacao/35",
				disabled && "opacity-50",
			)}
		>
			{checked && <span className="h-2.5 w-2.5 rounded-full bg-nl-cacao" />}
		</span>
	);
}

/** Inline status message. `error` is red with an icon; `info` is neutral. */
export function Notice({
	tone = "error",
	title,
	children,
	live = false,
	className,
}: {
	tone?: "error" | "info";
	title?: ReactNode;
	children?: ReactNode;
	/** Announce on change (use for errors raised by an action). */
	live?: boolean;
	className?: string;
}) {
	return (
		<div
			role={live ? "alert" : undefined}
			className={cn(
				"flex items-start gap-2.5 rounded-md border px-3.5 py-3 text-[13.5px] leading-snug",
				tone === "error"
					? "border-destructive/30 bg-destructive/[0.06] text-destructive"
					: "border-nl-cacao/15 bg-nl-linen/70 text-nl-cacao",
				className,
			)}
		>
			<AlertCircle className="mt-px h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
			<div className="grid gap-0.5">
				{title && <p className="m-0 font-semibold">{title}</p>}
				{children && <div className={cn(title && tone === "error" && "text-nl-cacao")}>{children}</div>}
			</div>
		</div>
	);
}

/** Step indicator for the single-page checkout: Cart ✓ — Delivery — Payment. */
export function StepIndicator({
	steps,
	current,
	doneLabel,
	currentLabel,
}: {
	steps: { label: string; href?: string }[];
	current: number;
	doneLabel: string;
	currentLabel: string;
}) {
	return (
		<ol className="m-0 flex list-none items-center gap-2 p-0 text-[13px] sm:gap-3">
			{steps.map((s, i) => {
				const done = i < current;
				const active = i === current;
				const content = (
					<>
						<span
							aria-hidden="true"
							className={cn(
								"inline-grid h-6 w-6 shrink-0 place-items-center rounded-sm font-mono text-[12px] tabular-nums",
								done && "bg-nl-cacao text-white",
								active && "border-2 border-nl-cacao text-nl-cacao",
								!done && !active && "border border-nl-cacao/25 text-nl-russet",
							)}
						>
							{done ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : i + 1}
						</span>
						<span className={cn(active ? "font-semibold text-nl-cacao" : done ? "text-nl-cacao" : "text-nl-russet")}>
							{s.label}
						</span>
						<span className="sr-only">
							{done ? ` (${doneLabel})` : active ? ` (${currentLabel})` : ""}
						</span>
					</>
				);
				return (
					<li key={s.label} className="flex items-center gap-2 sm:gap-3" aria-current={active ? "step" : undefined}>
						{done && s.href ? (
							<Link
								href={s.href}
								className="inline-flex items-center gap-2 rounded-sm underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber"
							>
								{content}
							</Link>
						) : (
							<span className="inline-flex items-center gap-2">{content}</span>
						)}
						{i < steps.length - 1 && <span aria-hidden="true" className="h-px w-5 bg-nl-cacao/25 sm:w-10" />}
					</li>
				);
			})}
		</ol>
	);
}

/** One label/value row in a totals list. */
export function TotalsRow({
	label,
	children,
	muted = false,
}: {
	label: ReactNode;
	children: ReactNode;
	muted?: boolean;
}) {
	return (
		<div className={cn("flex items-baseline justify-between gap-4", muted ? "text-nl-russet" : "text-nl-cacao")}>
			<dt className="min-w-0">{label}</dt>
			<dd className="m-0 shrink-0 text-end">{children}</dd>
		</div>
	);
}
