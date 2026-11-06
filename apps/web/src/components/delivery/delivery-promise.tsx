"use client";

import { UAE_EMIRATES } from "@/lib/emirates";
import { cn } from "@/lib/utils";
import { ChevronDown, Clock, Truck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { type DeliveryEstimate, useDeliveryEstimate } from "./delivery-api";
import {
	COUNTDOWN_MAX_MINUTES,
	formatCount,
	formatDeliveryDate,
	headlineFor,
	minutesLeft,
	splitMinutes,
} from "./delivery-format";
import { useCheckoutEmirate, useDeliveryEmirate } from "./use-delivery-emirate";

/** Re-render every 30 s so the countdown and "today" stay true. */
function useNow(intervalMs = 30_000): Date {
	const [now, setNow] = useState(() => new Date());
	useEffect(() => {
		const id = setInterval(() => setNow(new Date()), intervalMs);
		return () => clearInterval(id);
	}, [intervalMs]);
	return now;
}

interface BaseProps {
	vendorId?: string | null;
	/** Products in this supplier's group; a made-to-order item lengthens handling. */
	productIds?: (string | null | undefined)[];
	className?: string;
}

/**
 * "Get it by Tue, 12 Nov · Order within 3 h 20 m", per supplier.
 *
 * `variant="panel"` (product page) is a block with the emirate picker.
 * `variant="inline"` (cart supplier group) is a single compact line; the
 * picker still sits at the end so the buyer can see and change the destination.
 */
export function DeliveryPromise({
	vendorId,
	productIds,
	variant = "panel",
	className,
}: BaseProps & { variant?: "panel" | "inline" }) {
	const { emirate, setEmirate } = useDeliveryEmirate();
	const ids = (productIds ?? []).filter((id): id is string => !!id);
	const query = useDeliveryEstimate({
		vendorId: vendorId ?? undefined,
		emirate,
		productIds: ids,
	});
	if (!vendorId) return null;
	return (
		<DeliveryPromiseView
			estimate={query.data ?? null}
			isLoading={query.isLoading}
			isError={query.isError || (query.isSuccess && !query.data)}
			emirate={emirate}
			onEmirateChange={setEmirate}
			variant={variant}
			className={className}
		/>
	);
}

/**
 * Checkout, next to the delivery method: destination is the selected address
 * and transit follows the chosen method, so no picker is shown.
 */
export function CheckoutDeliveryPromise({
	vendorId,
	productIds,
	method,
	supplierName,
	className,
}: BaseProps & { method?: string | null; supplierName?: string | null }) {
	const emirate = useCheckoutEmirate();
	const ids = (productIds ?? []).filter((id): id is string => !!id);
	const query = useDeliveryEstimate({
		vendorId: vendorId ?? undefined,
		emirate: emirate ?? undefined,
		productIds: ids,
		method: method ?? null,
	});
	if (!vendorId || !emirate) return null;
	return (
		<DeliveryPromiseView
			estimate={query.data ?? null}
			isLoading={query.isLoading}
			isError={query.isError || (query.isSuccess && !query.data)}
			emirate={emirate}
			variant="inline"
			supplierName={supplierName}
			className={className}
		/>
	);
}

export interface DeliveryPromiseViewProps {
	estimate: DeliveryEstimate | null;
	isLoading?: boolean;
	isError?: boolean;
	emirate: string;
	/** When set, the destination is a picker. */
	onEmirateChange?: (emirate: string) => void;
	variant?: "panel" | "inline";
	supplierName?: string | null;
	/** Injected clock for tests and screenshots. */
	now?: Date;
	className?: string;
}

/** Presentational promise. Exported for tests and the vendor-settings preview. */
export function DeliveryPromiseView({
	estimate,
	isLoading,
	isError,
	emirate,
	onEmirateChange,
	variant = "panel",
	supplierName,
	now: nowProp,
	className,
}: DeliveryPromiseViewProps) {
	const t = useTranslations("delivery");
	const tEmirates = useTranslations("emirates");
	const locale = useLocale();
	const liveNow = useNow();
	const now = nowProp ?? liveNow;
	const emirateLabel = (value: string) => {
		const known = UAE_EMIRATES.find((e) => e.value === value);
		return known ? tEmirates(known.labelKey) : value;
	};

	const inline = variant === "inline";
	const shell = inline
		? "flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-nl-russet"
		: "grid gap-1.5 rounded-md border border-nl-cacao/12 bg-nl-pearl px-4 py-3 text-[13px] text-nl-russet";

	const destination = onEmirateChange ? (
		<EmiratePicker
			value={emirate}
			onChange={onEmirateChange}
			label={emirateLabel}
		/>
	) : (
		<span className="text-nl-cacao">{emirateLabel(emirate)}</span>
	);

	if (isLoading) {
		return (
			<div className={cn(shell, className)} aria-busy="true">
				<span className="sr-only">{t("loading")}</span>
				<span
					aria-hidden="true"
					className="h-4 w-40 rounded-sm bg-nl-cacao/[0.07] animate-pulse motion-reduce:animate-none"
				/>
				{!inline && (
					<span
						aria-hidden="true"
						className="h-3.5 w-56 rounded-sm bg-nl-cacao/[0.07] animate-pulse motion-reduce:animate-none"
					/>
				)}
			</div>
		);
	}

	if (isError || !estimate) {
		return (
			<div className={cn(shell, className)}>
				<span className="inline-flex items-center gap-2">
					<Truck
						className="h-4 w-4 shrink-0 text-nl-cacao"
						strokeWidth={1.75}
						aria-hidden="true"
					/>
					{t("unavailable")}
				</span>
				{onEmirateChange && (
					<span className="inline-flex items-center gap-1.5">
						{t("deliverTo")} {destination}
					</span>
				)}
			</div>
		);
	}

	const head = headlineFor(estimate, now);
	const date = formatDeliveryDate(head.date, locale);
	const headline =
		head.kind === "today"
			? t("getItToday")
			: head.kind === "tomorrow"
				? t("getItTomorrow", { date })
				: t("getItBy", { date });
	const showEarliest =
		head.kind === "by" && estimate.earliest !== estimate.latest;
	const left = minutesLeft(estimate.cutoffAt, now);
	const showCountdown = left > 0 && left <= COUNTDOWN_MAX_MINUTES;
	const { hours, minutes } = splitMinutes(left);
	const time =
		hours > 0
			? t("hoursMinutes", {
					hours: formatCount(hours, locale),
					minutes: formatCount(minutes, locale),
				})
			: t("minutesOnly", { minutes: formatCount(minutes, locale) });
	const badge =
		estimate.speed === "same_day"
			? t("sameDay")
			: estimate.speed === "next_day"
				? t("nextDay")
				: null;

	const headlineEl = (
		<span
			className={cn(
				"inline-flex min-w-0 items-center gap-2 text-nl-cacao",
				!inline && "font-display text-[15px] font-semibold tracking-[-0.01em]",
			)}
		>
			<Truck
				className="h-4 w-4 shrink-0"
				strokeWidth={1.75}
				aria-hidden="true"
			/>
			<span className={cn(inline && "font-medium")}>{headline}</span>
			{badge && (
				<span className="mill-label inline-flex h-5 items-center rounded-sm border border-nl-cacao/25 px-1.5 text-[10.5px] text-nl-cacao">
					{badge}
				</span>
			)}
		</span>
	);

	const countdown = showCountdown && (
		<span className="inline-flex items-center gap-1.5">
			<Clock
				className="h-3.5 w-3.5 shrink-0 text-nl-cacao"
				strokeWidth={1.75}
				aria-hidden="true"
			/>
			{t.rich("orderWithin", {
				time,
				b: (chunks) => (
					<span className="font-medium tabular-nums text-nl-cacao">
						{chunks}
					</span>
				),
			})}
		</span>
	);

	if (inline) {
		return (
			<div className={cn(shell, className)}>
				{supplierName && (
					<span className="basis-full text-[12.5px] text-nl-russet">
						{supplierName}
					</span>
				)}
				{headlineEl}
				{countdown}
				<span className="inline-flex items-center gap-1">
					{t("estimatedToLabel")} {destination}
				</span>
			</div>
		);
	}

	return (
		<div className={cn(shell, className)}>
			<div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
				{headlineEl}
				{countdown}
			</div>
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
				<span className="inline-flex flex-wrap items-center gap-1">
					{t("estimatedToLabel")} {destination}
				</span>
				{showEarliest && (
					<span className="tabular-nums">
						{t("earliest", {
							date: formatDeliveryDate(estimate.earliest, locale),
						})}
					</span>
				)}
			</div>
			{estimate.dependsOnEstimatedHoliday && (
				<p className="m-0 text-[12.5px]">{t("holidayNote")}</p>
			)}
		</div>
	);
}

/** Native select styled as inline text: keyboard, screen-reader and phone friendly. */
function EmiratePicker({
	value,
	onChange,
	label,
}: {
	value: string;
	onChange: (v: string) => void;
	label: (v: string) => string;
}) {
	const t = useTranslations("delivery");
	const id = useId();
	return (
		<span className="relative inline-flex items-center">
			<label htmlFor={id} className="sr-only">
				{t("deliverTo")}
			</label>
			<select
				id={id}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className="h-8 cursor-pointer appearance-none [field-sizing:content] rounded-sm border-0 bg-transparent py-0 pe-5 ps-0 text-[13px] font-medium text-nl-cacao underline decoration-nl-cacao/30 underline-offset-4 hover:decoration-nl-cacao focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber"
			>
				{UAE_EMIRATES.map((e) => (
					<option key={e.value} value={e.value}>
						{label(e.value)}
					</option>
				))}
			</select>
			<ChevronDown
				className="pointer-events-none absolute end-0 h-3.5 w-3.5 text-nl-russet"
				strokeWidth={1.75}
				aria-hidden="true"
			/>
		</span>
	);
}
