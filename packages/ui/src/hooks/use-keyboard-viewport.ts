"use client";

import * as React from "react";

/**
 * How much shorter than the layout viewport the visual viewport has to be
 * before we treat the difference as an on-screen keyboard. Well under any real
 * keyboard (~260px+), high enough to ignore URL-bar collapse jitter.
 */
const KEYBOARD_INSET_THRESHOLD_PX = 100;

export type KeyboardViewport = {
	/** Distance from the layout viewport top to the top of the visible strip. */
	offsetTop: number;
	/** Height of the visible strip. */
	height: number;
};

/**
 * Tracks the visual viewport while an on-screen keyboard covers part of the
 * layout viewport; returns `null` whenever no keyboard is up.
 *
 * `position: fixed` elements are laid out against the *layout* viewport, which
 * iOS Safari never shrinks for the keyboard — so a vertically centered dialog
 * keeps centering against the full page height and its lower half (usually the
 * field the user just tapped) ends up behind the keyboard. Android is handled
 * by the `interactive-widget=resizes-content` viewport meta instead, which
 * shrinks the layout viewport too and therefore reports no inset here, leaving
 * this hook inert on that platform.
 */
export function useKeyboardViewport(): KeyboardViewport | null {
	const [viewport, setViewport] = React.useState<KeyboardViewport | null>(null);

	React.useEffect(() => {
		const visualViewport =
			typeof window === "undefined" ? undefined : window.visualViewport;
		if (!visualViewport) return;

		const read = () => {
			const inset = window.innerHeight - visualViewport.height;
			if (
				inset < KEYBOARD_INSET_THRESHOLD_PX &&
				visualViewport.offsetTop <= 0
			) {
				setViewport(null);
				return;
			}
			setViewport((previous) =>
				previous &&
				previous.offsetTop === visualViewport.offsetTop &&
				previous.height === visualViewport.height
					? previous
					: {
							offsetTop: visualViewport.offsetTop,
							height: visualViewport.height,
						},
			);
		};

		read();
		visualViewport.addEventListener("resize", read);
		visualViewport.addEventListener("scroll", read);
		return () => {
			visualViewport.removeEventListener("resize", read);
			visualViewport.removeEventListener("scroll", read);
		};
	}, []);

	return viewport;
}
