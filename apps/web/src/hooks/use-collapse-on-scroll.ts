"use client";

import { useEffect, useState } from "react";

/** Ignore sub-pixel drift and rubber-band jitter so the chrome doesn't flicker. */
const DELTA_THRESHOLD = 8;
/** Near the top of the page the chrome is always shown, regardless of direction. */
const ALWAYS_OPEN_ABOVE = 64;

/**
 * Tracks scroll direction and reports whether page chrome should collapse.
 *
 * Collapses on scroll down, reveals on scroll up. Stays open near the top of
 * the document and at the very end, so the header is present on arrival and
 * the tab bar never leaves a dead gap above the footer.
 */
export function useCollapseOnScroll(): boolean {
	const [collapsed, setCollapsed] = useState(false);

	useEffect(() => {
		let lastY = window.scrollY;
		let frame = 0;
		// Guarded separately from `frame` so the hook cannot wedge if the
		// callback runs synchronously — assigning the frame id after the fact
		// would otherwise leave the guard permanently set.
		let ticking = false;

		const update = () => {
			ticking = false;
			const y = window.scrollY;
			const doc = document.documentElement;
			const atEnd = y + window.innerHeight >= doc.scrollHeight - 2;

			if (y < ALWAYS_OPEN_ABOVE || atEnd) {
				lastY = y;
				setCollapsed(false);
				return;
			}

			const delta = y - lastY;
			// Below the threshold we deliberately keep lastY so small movements
			// accumulate into one decisive flip instead of being discarded.
			if (Math.abs(delta) < DELTA_THRESHOLD) return;

			lastY = y;
			setCollapsed(delta > 0);
		};

		const onScroll = () => {
			if (ticking) return;
			ticking = true;
			frame = requestAnimationFrame(update);
		};

		window.addEventListener("scroll", onScroll, { passive: true });
		return () => {
			window.removeEventListener("scroll", onScroll);
			if (frame) cancelAnimationFrame(frame);
		};
	}, []);

	return collapsed;
}
