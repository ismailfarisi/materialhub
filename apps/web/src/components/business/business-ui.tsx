"use client";

import { StatusBadge, type Tone } from "@/components/account/account-ui";
import { formatFils } from "@/components/swatch";
import { type MeterTone, creditUsedRatio } from "@/lib/business/net-terms";
import type { BusinessRole, VerificationStatus } from "@/lib/business/types";
import { cn } from "@/lib/utils";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useId } from "react";

/**
 * Business-account primitives on Swatch Book tokens (Operate surface).
 * Promote-to-swatch candidates: Amount, SpecValue, Toggle, CreditMeter, SegmentedFilter.
 */

/** "AED 1,234.50" as a spec value: mono, tabular, left-to-right inside Arabic. */
export function Amount({
	fils,
	className,
}: { fils: number; className?: string }) {
	const locale = useLocale();
	return (
		<bdi
			dir="ltr"
			className={cn(
				"justify-self-start whitespace-nowrap font-mono tabular-nums",
				className,
			)}
		>
			<span className="text-[0.9em] text-nl-russet">AED</span>{" "}
			{formatFils(fils, locale)}
		</bdi>
	);
}

/** Plain-text money for use inside translated sentences. */
export function useAmountText() {
	const locale = useLocale();
	// LRI … PDI isolates the amount inside Arabic sentences; the no-break space keeps "AED" with its number.
	return (fils: number) => `\u2066AED\u00a0${formatFils(fils, locale)}\u2069`;
}

/** A measured or coded value (TRN, invoice number, Peppol ID): mono, LTR-isolated. */
export function SpecValue({
	children,
	className,
}: { children: ReactNode; className?: string }) {
	return (
		<bdi
			dir="ltr"
			className={cn(
				"justify-self-start font-mono text-[13.5px] tabular-nums text-nl-cacao [overflow-wrap:anywhere]",
				className,
			)}
		>
			{children}
		</bdi>
	);
}

/** Label above value, for the company profile. */
export function InfoRow({
	label,
	children,
	className,
}: { label: ReactNode; children: ReactNode; className?: string }) {
	return (
		<div className={cn("grid content-start gap-1", className)}>
			<dt className="text-[13px] text-nl-russet">{label}</dt>
			<dd className="m-0 min-w-0 break-words text-[14.5px] text-nl-cacao">
				{children}
			</dd>
		</div>
	);
}

/* --------------------------- sub navigation --------------------------- */

const SECTIONS = [
	{ key: "company", href: "/account/business", exact: true },
	{ key: "members", href: "/account/business/members" },
	{ key: "approvals", href: "/account/business/approvals" },
	{ key: "invoices", href: "/account/business/invoices" },
	{ key: "terms", href: "/account/business/terms" },
] as const;

/**
 * Local navigation for the business sections. A ruled row of text tabs with
 * an ink underline, distinct from the account's orange-underlined tabs above
 * it on phones; scrolls sideways at 390px.
 */
export function BusinessSubNav() {
	const t = useTranslations("business.subnav");
	const locale = useLocale();
	const pathname = usePathname();
	return (
		<nav aria-label={t("label")} className="mb-6 border-b border-nl-cacao/12">
			<ul className="scrollbar-hide -mb-px m-0 flex list-none gap-5 overflow-x-auto p-0">
				{SECTIONS.map((s) => {
					const full = `/${locale}${s.href}`;
					const active =
						"exact" in s && s.exact
							? pathname === full
							: pathname.startsWith(full);
					return (
						<li key={s.key} className="shrink-0">
							<Link
								href={full}
								aria-current={active ? "page" : undefined}
								className={cn(
									"inline-flex h-10 items-center whitespace-nowrap border-b-2 text-[14px] transition-colors",
									active
										? "border-nl-cacao font-medium text-nl-cacao"
										: "border-transparent text-nl-russet hover:text-nl-cacao",
								)}
							>
								{t(s.key)}
							</Link>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}

/* ------------------------------ status ------------------------------- */

const VERIFICATION_TONE: Record<VerificationStatus, Tone> = {
	pending: "warning",
	verified: "success",
	rejected: "error",
};

export function VerificationBadge({ status }: { status: VerificationStatus }) {
	const t = useTranslations("business.verification");
	return (
		<StatusBadge tone={VERIFICATION_TONE[status]}>{t(status)}</StatusBadge>
	);
}

export function RoleBadge({ role }: { role: BusinessRole }) {
	const t = useTranslations("business.roles");
	return (
		<span className="mill-label inline-flex h-6 items-center rounded-sm bg-nl-linen px-2 text-nl-cacao">
			{t(role)}
		</span>
	);
}

/* ------------------------------ controls ----------------------------- */

/** On/off switch: native checkbox with role="switch", ink when on. */
export function Toggle({
	checked,
	onChange,
	label,
	hint,
	disabled,
	id,
}: {
	checked: boolean;
	onChange: (v: boolean) => void;
	label: ReactNode;
	hint?: ReactNode;
	disabled?: boolean;
	id: string;
}) {
	return (
		<div className="flex items-start justify-between gap-4">
			<div className="grid gap-0.5">
				<label
					htmlFor={id}
					className="cursor-pointer text-[14px] font-medium text-nl-cacao"
				>
					{label}
				</label>
				{hint && (
					<p
						id={`${id}-hint`}
						className="m-0 max-w-[60ch] text-[13px] text-nl-russet"
					>
						{hint}
					</p>
				)}
			</div>
			<span className="relative inline-flex shrink-0">
				<input
					id={id}
					type="checkbox"
					role="switch"
					aria-checked={checked}
					checked={checked}
					disabled={disabled}
					aria-describedby={hint ? `${id}-hint` : undefined}
					onChange={(e) => onChange(e.target.checked)}
					className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
				/>
				<span
					aria-hidden="true"
					className={cn(
						"relative inline-block h-7 w-12 rounded-md border transition-colors duration-150 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-nl-amber",
						checked
							? "border-nl-cacao bg-nl-cacao"
							: "border-nl-cacao/25 bg-nl-linen",
						disabled && "opacity-50",
					)}
				>
					<span
						className={cn(
							"absolute top-[3px] h-5 w-5 rounded-sm bg-nl-pearl shadow-card transition-[inset-inline-start] duration-150 motion-reduce:transition-none",
							checked ? "start-[23px]" : "start-[3px]",
						)}
					/>
				</span>
			</span>
		</div>
	);
}

/** A row of mutually exclusive filters (radio semantics), wraps on phones. */
export function SegmentedFilter<T extends string>({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: T;
	options: { value: T; label: string }[];
	onChange: (v: T) => void;
}) {
	const name = useId();
	return (
		<div
			role="radiogroup"
			aria-label={label}
			className="flex flex-wrap gap-1.5"
		>
			{options.map((o) => {
				const active = o.value === value;
				return (
					<label
						key={o.value}
						className={cn(
							"inline-flex h-9 cursor-pointer items-center rounded-md border px-3 text-[13.5px] transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-nl-amber",
							active
								? "border-nl-cacao bg-nl-cacao font-medium text-white"
								: "border-nl-cacao/20 bg-nl-pearl text-nl-cacao hover:border-nl-cacao/50",
						)}
					>
						<input
							type="radio"
							name={name}
							value={o.value}
							checked={active}
							onChange={() => onChange(o.value)}
							className="sr-only"
						/>
						{o.label}
					</label>
				);
			})}
		</div>
	);
}

/* ------------------------------- meter ------------------------------- */

const METER_FILL: Record<MeterTone, string> = {
	normal: "bg-nl-cacao",
	warning: "bg-status-warning",
	error: "bg-status-error",
};
const METER_TRACK: Record<MeterTone, string> = {
	normal: "bg-nl-cacao/10",
	warning: "bg-status-warning/15",
	error: "bg-status-error/15",
};

/**
 * One ratio against a limit (dataviz "meter"): the fill carries severity,
 * the track is a lighter step of the same hue. Figures sit beside it in text,
 * so the bar itself carries no numbers.
 */
export function CreditMeter({
	limitFils,
	usedFils,
	tone,
	label,
	valueText,
}: {
	limitFils: number;
	usedFils: number;
	tone: MeterTone;
	label: string;
	valueText: string;
}) {
	const ratio = creditUsedRatio({
		credit_limit_fils: limitFils,
		outstanding_fils: usedFils,
	});
	const pct = Math.round(ratio * 1000) / 10;
	return (
		<div
			role="meter"
			aria-label={label}
			aria-valuemin={0}
			aria-valuemax={limitFils / 100}
			aria-valuenow={Math.min(usedFils, limitFils) / 100}
			aria-valuetext={valueText}
			className={cn(
				"h-2 w-full overflow-hidden rounded-[4px]",
				METER_TRACK[tone],
			)}
		>
			<div
				className={cn(
					"h-full rounded-[4px] transition-[width] duration-300 ease-out motion-reduce:transition-none",
					METER_FILL[tone],
				)}
				style={{ width: `${pct}%`, minWidth: usedFils > 0 ? 4 : 0 }}
			/>
		</div>
	);
}
