"use client";

import type { CSSProperties } from "react";
import type { CalendarEngagement } from "@/lib/queries/calendar";
import {
	CONFLICTED_STYLE,
	KIND_STYLE,
	isDragAttemptable,
	statusBorderClass,
	statusOpacityClass,
} from "@/lib/booking/calendar-style";
import { formatTimeInZone } from "@/lib/booking/tz";
import { cn } from "@materialhub/ui";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
	ArrowsClockwise,
	Coffee,
	type Icon,
	PhoneCall,
	Prohibit,
	Storefront,
	UserCirclePlus,
	WarningCircle,
} from "@phosphor-icons/react";

const KIND_ICON: Record<CalendarEngagement["kind"], Icon> = {
	marketplace_booking: Storefront,
	walk_in: UserCirclePlus,
	phone: PhoneCall,
	external_import: ArrowsClockwise,
	manual_block: Prohibit,
	break: Coffee,
};

export function engagementLabel(e: CalendarEngagement): string {
	if (e.booking) {
		return e.booking.customer_name || e.booking.service_name || "Booking";
	}
	if (e.kind === "manual_block" || e.kind === "break") {
		return e.external_source || (e.kind === "break" ? "Break" : "Blocked");
	}
	return "Imported";
}

interface EngagementBlockProps {
	engagement: CalendarEngagement;
	timezone: string;
	top: number;
	height: number;
	left: string; // CSS percentage or value, lane-based
	width: string;
	canWrite: boolean;
	onClick: () => void;
}

export function EngagementBlock({
	engagement,
	timezone,
	top,
	height,
	left,
	width,
	canWrite,
	onClick,
}: EngagementBlockProps) {
	const kindStyle = KIND_STYLE[engagement.kind];
	const Icon = KIND_ICON[engagement.kind];
	const conflicted = engagement.status === "conflicted";
	const draggable = canWrite && isDragAttemptable(engagement.kind);

	const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
		id: engagement.id,
		data: { engagement },
		disabled: !draggable,
	});

	const style: CSSProperties = {
		top,
		height,
		left,
		width,
		transform: transform ? CSS.Translate.toString(transform) : undefined,
		zIndex: isDragging ? 30 : conflicted ? 20 : 10,
	};

	return (
		<button
			ref={setNodeRef}
			type="button"
			style={style}
			className={cn(
				"absolute rounded-xs px-1.5 py-1 text-left overflow-hidden shadow-none transition-shadow",
				"border-l-[3px]",
				conflicted ? CONFLICTED_STYLE.stripeClass : kindStyle.stripeClass,
				conflicted ? CONFLICTED_STYLE.fillClass : kindStyle.fillClass,
				statusBorderClass(engagement.status),
				statusOpacityClass(engagement.status),
				draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
				isDragging && "shadow-lg ring-2 ring-amber/50",
			)}
			onClick={onClick}
			{...listeners}
			{...attributes}
			aria-label={`${kindStyle.label} — ${engagementLabel(engagement)}, ${formatTimeInZone(
				engagement.starts_at,
				timezone,
			)} to ${formatTimeInZone(engagement.ends_at, timezone)}${conflicted ? " — conflicted, needs attention" : ""}`}
		>
			<div className="flex items-start gap-1">
				<Icon size={11} />
				{conflicted && (
					<WarningCircle size={12} weight="fill" className="text-russet shrink-0" />
				)}
				<span
					className={cn(
						"text-[11px] font-medium leading-tight truncate",
						conflicted ? CONFLICTED_STYLE.textClass : kindStyle.textClass,
					)}
				>
					{engagementLabel(engagement)}
				</span>
			</div>
			{height > 30 && (
				<p className="text-[10px] text-taupe leading-tight mt-0.5 truncate">
					{formatTimeInZone(engagement.starts_at, timezone)}–
					{formatTimeInZone(engagement.ends_at, timezone)}
				</p>
			)}
		</button>
	);
}
