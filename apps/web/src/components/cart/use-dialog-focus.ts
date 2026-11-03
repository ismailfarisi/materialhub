"use client";

import { type RefObject, useEffect } from "react";

const FOCUSABLE =
	'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal panel focus handling: locks page scroll, moves focus into the panel on
 * open, keeps Tab inside it, closes on Escape and returns focus to whatever
 * opened it.
 */
export function useDialogFocus(
	open: boolean,
	panelRef: RefObject<HTMLElement | null>,
	onClose: () => void,
) {
	useEffect(() => {
		if (!open) return;
		const panel = panelRef.current;
		const opener = document.activeElement as HTMLElement | null;
		const originalOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";

		const first = panel?.querySelector<HTMLElement>("[data-autofocus]") ?? panel?.querySelector<HTMLElement>(FOCUSABLE);
		first?.focus({ preventScroll: true });

		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.stopPropagation();
				onClose();
				return;
			}
			if (e.key !== "Tab" || !panel) return;
			const nodes = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null);
			if (nodes.length === 0) return;
			const firstNode = nodes[0];
			const lastNode = nodes[nodes.length - 1];
			if (e.shiftKey && document.activeElement === firstNode) {
				e.preventDefault();
				lastNode.focus();
			} else if (!e.shiftKey && document.activeElement === lastNode) {
				e.preventDefault();
				firstNode.focus();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => {
			document.body.style.overflow = originalOverflow;
			window.removeEventListener("keydown", onKey);
			opener?.focus?.({ preventScroll: true });
		};
	}, [open, panelRef, onClose]);
}
