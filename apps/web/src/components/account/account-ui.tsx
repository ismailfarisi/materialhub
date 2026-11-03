"use client";

import { Button, SectionHead } from "@/components/swatch";
import { cn } from "@/lib/utils";
import { AlertCircle, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
	type InputHTMLAttributes,
	type ReactNode,
	type SelectHTMLAttributes,
	type TextareaHTMLAttributes,
	forwardRef,
	useId,
} from "react";

/**
 * Account surface primitives (Operate mode). Built on Swatch Book tokens so
 * every account page shares one vocabulary: page header, panel, field,
 * status badge and the loading / empty / error states.
 * Candidates for "Promote to swatch": Field, StatusBadge, EmptyState.
 */

/* ------------------------------------------------------------------ */
/* Page header                                                         */
/* ------------------------------------------------------------------ */

export function PageHeader({
	title,
	description,
	action,
	className,
}: {
	title: ReactNode;
	description?: ReactNode;
	/** Trailing control, e.g. an "Add address" button. */
	action?: ReactNode;
	className?: string;
}) {
	return (
		<header className={cn("mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 md:mb-8", className)}>
			<div className="grid min-w-0 gap-1.5">
				<SectionHead as="h1" title={title} />
				{description && <p className="m-0 max-w-[65ch] text-sm text-nl-russet">{description}</p>}
			</div>
			{action && <div className="shrink-0">{action}</div>}
		</header>
	);
}

/** White card on the board. The account surface's one container. */
export function Panel({
	children,
	className,
	as: Tag = "section",
}: {
	children: ReactNode;
	className?: string;
	as?: "section" | "div" | "article" | "li" | "form";
}) {
	return <Tag className={cn("rounded-md bg-nl-pearl shadow-card", className)}>{children}</Tag>;
}

/** Title row inside a panel. */
export function PanelHead({
	title,
	meta,
	className,
}: {
	title: ReactNode;
	meta?: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-nl-cacao/10 px-4 py-3 md:px-5",
				className,
			)}
		>
			<h2 className="m-0 font-display text-[15.5px] font-semibold leading-tight tracking-[-0.01em] text-nl-cacao">
				{title}
			</h2>
			{meta}
		</div>
	);
}

/** Key / value row with a mono value, used for totals and summaries. */
export function ValueRow({
	label,
	value,
	strong,
	className,
}: {
	label: ReactNode;
	value: ReactNode;
	strong?: boolean;
	className?: string;
}) {
	return (
		<div className={cn("flex items-baseline justify-between gap-4 py-1.5", className)}>
			<span className={cn("text-sm", strong ? "font-medium text-nl-cacao" : "text-nl-russet")}>{label}</span>
			<span
				className={cn(
					"text-end font-mono tabular-nums text-nl-cacao",
					strong ? "text-[15px] font-medium" : "text-[13.5px]",
				)}
			>
				{value}
			</span>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */

/**
 * State colours. Deliberately separate from the category stocks
 * (DESIGN.md: "No stock without a category"); green is a true green
 * (hue 142) so it never reads as laminate green.
 */
export type Tone = "neutral" | "progress" | "success" | "warning" | "error";

export const TONE_BADGE: Record<Tone, string> = {
	neutral: "bg-nl-cacao/[0.06] text-nl-russet",
	progress: "bg-nl-cacao text-white",
	success: "bg-green-700/10 text-green-800",
	warning: "bg-amber-500/15 text-amber-900",
	error: "bg-destructive/10 text-destructive",
};

export const TONE_DOT: Record<Tone, string> = {
	neutral: "bg-nl-russet/60",
	progress: "bg-white",
	success: "bg-green-700",
	warning: "bg-amber-600",
	error: "bg-destructive",
};

export function StatusBadge({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
	return (
		<span
			className={cn(
				"inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm px-2 font-sans text-[12.5px] font-medium leading-none",
				TONE_BADGE[tone],
				className,
			)}
		>
			<span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-[1px]", TONE_DOT[tone])} />
			{children}
		</span>
	);
}

/* ------------------------------------------------------------------ */
/* Forms                                                               */
/* ------------------------------------------------------------------ */

const control =
	"w-full rounded-md border border-nl-cacao/15 bg-nl-pearl text-base text-nl-cacao transition-colors placeholder:text-nl-russet/70 hover:border-nl-cacao/35 focus:border-nl-cacao focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive md:text-[15px]";

export const inputClass = cn(control, "h-12 px-3.5");
export const selectClass = cn(control, "h-12 ps-3.5 pe-9");
export const textareaClass = cn(control, "min-h-[112px] px-3.5 py-3 leading-relaxed");
/** Composite field (phone): the wrapper draws the border, the inner input none. */
/** Phone fields always read left to right (+971 first), also in Arabic. */
export const compositeClass =
	"flex h-12 [direction:ltr] w-full items-stretch overflow-hidden rounded-md border border-nl-cacao/15 bg-nl-pearl text-nl-cacao transition-colors hover:border-nl-cacao/35 focus-within:border-nl-cacao focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-nl-amber";
export const compositePrefixClass =
	"flex items-center border-e border-nl-cacao/12 bg-nl-linen/60 px-3.5 font-mono text-[14px] tabular-nums text-nl-russet";
export const compositeInputClass =
	"min-w-0 flex-1 bg-transparent px-3.5 text-base text-nl-cacao placeholder:text-nl-russet/70 focus-visible:outline-none md:text-[15px]";

export const labelClass = "text-[13px] font-medium text-nl-cacao";

/**
 * Label above, control, then hint or error. Pass the control as a render
 * function to receive the generated id and aria props.
 */
export function Field({
	label,
	hint,
	error,
	optional,
	className,
	children,
	id: idProp,
}: {
	label: ReactNode;
	hint?: ReactNode;
	error?: ReactNode;
	optional?: boolean;
	className?: string;
	id?: string;
	children: (props: { id: string; "aria-invalid"?: true; "aria-describedby"?: string }) => ReactNode;
}) {
	const t = useTranslations("account");
	const auto = useId();
	const id = idProp ?? auto;
	const msgId = `${id}-msg`;
	return (
		<div className={cn("grid content-start gap-1.5", className)}>
			<label htmlFor={id} className={labelClass}>
				{label}
				{optional && <span className="ms-1.5 font-normal text-nl-russet">({t("ui.optional")})</span>}
			</label>
			{children({
				id,
				...(error ? { "aria-invalid": true as const } : {}),
				...(error || hint ? { "aria-describedby": msgId } : {}),
			})}
			{error ? <FieldError id={msgId}>{error}</FieldError> : hint ? <p id={msgId} className="m-0 text-[13px] text-nl-russet">{hint}</p> : null}
		</div>
	);
}

export function FieldError({ children, id, className }: { children: ReactNode; id?: string; className?: string }) {
	return (
		<p id={id} role="alert" className={cn("m-0 flex items-start gap-1.5 text-[13px] text-destructive", className)}>
			<AlertCircle className="mt-px h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
			<span>{children}</span>
		</p>
	);
}

/** Form-level message: success (green) or error (red), with an icon. */
export function FormMessage({ tone, children }: { tone: "success" | "error"; children: ReactNode }) {
	if (tone === "error") return <FieldError>{children}</FieldError>;
	return (
		<output className="m-0 flex items-center gap-1.5 text-[13px] text-green-800">
			<span aria-hidden="true" className="h-1.5 w-1.5 rounded-[1px] bg-green-700" />
			{children}
		</output>
	);
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
	({ className, ...props }, ref) => <input ref={ref} className={cn(inputClass, className)} {...props} />,
);
Input.displayName = "AccountInput";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
	({ className, ...props }, ref) => <select ref={ref} className={cn(selectClass, className)} {...props} />,
);
Select.displayName = "AccountSelect";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
	({ className, ...props }, ref) => <textarea ref={ref} className={cn(textareaClass, className)} {...props} />,
);
Textarea.displayName = "AccountTextarea";

/* ------------------------------------------------------------------ */
/* States                                                              */
/* ------------------------------------------------------------------ */

export function Skeleton({ className }: { className?: string }) {
	return <div aria-hidden="true" className={cn("animate-pulse rounded-sm bg-nl-cacao/[0.07] motion-reduce:animate-none", className)} />;
}

/** A stack of skeleton list rows inside panels. */
export function ListSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
	const t = useTranslations("common");
	return (
		<output className={cn("grid gap-3", className)} aria-label={t("loading")}>
			{Array.from({ length: rows }, (_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows
				<Panel as="div" key={i} className="grid gap-3 p-4 md:p-5">
					<div className="flex items-center justify-between gap-3">
						<Skeleton className="h-4 w-36" />
						<Skeleton className="h-6 w-20" />
					</div>
					<Skeleton className="h-3.5 w-2/3" />
					<Skeleton className="h-3.5 w-1/3" />
				</Panel>
			))}
		</output>
	);
}

/**
 * Empty state. A blank swatch card (stock-less, dashed) stands in for the
 * missing content; copy says what goes here and the action fills it.
 */
export function EmptyState({
	icon: Icon,
	title,
	body,
	action,
	className,
}: {
	icon?: LucideIcon;
	title: ReactNode;
	body?: ReactNode;
	action?: { label: string; href?: string; onClick?: () => void };
	className?: string;
}) {
	return (
		<div
			className={cn(
				"grid justify-items-center gap-4 rounded-md border border-dashed border-nl-cacao/20 px-6 py-12 text-center md:py-16",
				className,
			)}
		>
			<div aria-hidden="true" className="relative h-[72px] w-14 overflow-hidden rounded-md bg-nl-pearl shadow-card">
				<div className="flex h-4 items-center justify-end bg-nl-cacao/20 px-1.5">
					<span className="h-1.5 w-1.5 rounded-full bg-nl-linen shadow-[inset_0_1px_1px_rgb(0_0_0/0.3)]" />
				</div>
				{Icon && (
					<div className="grid h-[56px] place-items-center text-nl-russet">
						<Icon className="h-5 w-5" strokeWidth={1.5} />
					</div>
				)}
			</div>
			<div className="grid max-w-[44ch] gap-1.5">
				<p className="m-0 font-display text-[17px] font-semibold tracking-[-0.01em] text-nl-cacao">{title}</p>
				{body && <p className="m-0 text-sm text-nl-russet">{body}</p>}
			</div>
			{action &&
				(action.href ? (
					<Button asChild variant="outline">
						<Link href={action.href}>{action.label}</Link>
					</Button>
				) : (
					<Button variant="outline" onClick={action.onClick}>
						{action.label}
					</Button>
				))}
		</div>
	);
}

/** Load failure with a retry. */
export function ErrorState({ onRetry, message }: { onRetry?: () => void; message?: ReactNode }) {
	const t = useTranslations("account");
	const tCommon = useTranslations("common");
	return (
		<div role="alert" className="grid justify-items-start gap-3 rounded-md border border-destructive/25 bg-destructive/[0.04] p-5">
			<p className="m-0 flex items-center gap-2 text-sm font-medium text-destructive">
				<AlertCircle className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
				{message ?? t("ui.loadFailed")}
			</p>
			{onRetry && (
				<Button variant="outline" size="sm" onClick={onRetry}>
					{tCommon("retry")}
				</Button>
			)}
		</div>
	);
}
