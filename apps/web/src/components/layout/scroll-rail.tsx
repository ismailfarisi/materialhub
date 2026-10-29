"use client";

import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

interface ScrollRailProps {
	children: React.ReactNode;
	className?: string;
}

/**
 * Horizontal scroll container that fades its trailing edge as a scrollability
 * hint, then drops the fade once the user reaches the end.
 *
 * RTL note: scrollLeft sign varies by browser, so we compare against the
 * absolute distance from the start. WebKit reports negative scrollLeft in RTL;
 * Blink/Gecko report positive. Math.abs(scrollLeft) handles both.
 */
export function ScrollRail({ children, className }: ScrollRailProps) {
	const ref = useRef<HTMLDivElement>(null);
	const [atEnd, setAtEnd] = useState(false);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;

		// In RTL, ensure the rail starts at the right edge so first items are visible.
		if (
			getComputedStyle(el).direction === "rtl" &&
			Math.abs(el.scrollLeft) < 4
		) {
			el.scrollLeft = el.scrollWidth - el.clientWidth;
		}

		function update() {
			if (!el) return;
			const max = el.scrollWidth - el.clientWidth;
			if (max <= 0) {
				setAtEnd(true);
				return;
			}
			setAtEnd(Math.abs(el.scrollLeft) >= max - 4);
		}

		update();
		el.addEventListener("scroll", update, { passive: true });
		const ro = new ResizeObserver(update);
		ro.observe(el);
		return () => {
			el.removeEventListener("scroll", update);
			ro.disconnect();
		};
	}, []);

	return (
		<div
			ref={ref}
			className={cn(className, !atEnd && "scroll-fade-r")}
			data-scroll-end={atEnd ? "true" : "false"}
		>
			{children}
		</div>
	);
}
