"use client";

import type { NavTab } from "@/lib/api/navigation";
import { useEffect, useRef, useState } from "react";
import { MegaMenuPanel } from "./mega-menu-panel";

interface Props {
	tabs: NavTab[];
}

const OPEN_DELAY_MS = 100;
const CLOSE_DELAY_MS = 150;

export function MegaMenuRoot({ tabs }: Props) {
	const [openTabId, setOpenTabId] = useState<string | null>(null);
	const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const panelRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		function clear() {
			if (openTimer.current) clearTimeout(openTimer.current);
			if (closeTimer.current) clearTimeout(closeTimer.current);
		}
		function scheduleOpen(tabId: string) {
			clear();
			openTimer.current = setTimeout(() => setOpenTabId(tabId), OPEN_DELAY_MS);
		}
		function scheduleClose() {
			clear();
			closeTimer.current = setTimeout(() => setOpenTabId(null), CLOSE_DELAY_MS);
		}
		function onMouseEnter(e: MouseEvent) {
			const trigger = (e.target as HTMLElement).closest<HTMLElement>(
				"[data-mega-tab-trigger]",
			);
			if (!trigger) return;
			const tabId = trigger.getAttribute("data-tab-id");
			if (!tabId) return;
			scheduleOpen(tabId);
		}
		function onMouseLeave(e: MouseEvent) {
			const related = e.relatedTarget as Node | null;
			if (related && panelRef.current?.contains(related)) return;
			scheduleClose();
		}
		function onFocusIn(e: FocusEvent) {
			const trigger = (e.target as HTMLElement).closest<HTMLElement>(
				"[data-mega-tab-trigger]",
			);
			if (!trigger) return;
			const tabId = trigger.getAttribute("data-tab-id");
			if (!tabId) return;
			scheduleOpen(tabId);
		}
		function onKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") {
				clear();
				setOpenTabId(null);
			}
		}
		function onClick(e: MouseEvent) {
			const target = e.target as HTMLElement;
			if (panelRef.current?.contains(target)) return;
			if (target.closest("[data-mega-tab-trigger]")) return;
			clear();
			setOpenTabId(null);
		}

		const triggers = document.querySelectorAll("[data-mega-tab-trigger]");
		for (const t of Array.from(triggers)) {
			t.addEventListener("mouseenter", onMouseEnter as EventListener);
			t.addEventListener("mouseleave", onMouseLeave as EventListener);
		}
		document.addEventListener("focusin", onFocusIn);
		document.addEventListener("keydown", onKeyDown);
		document.addEventListener("click", onClick);

		return () => {
			clear();
			for (const t of Array.from(triggers)) {
				t.removeEventListener("mouseenter", onMouseEnter as EventListener);
				t.removeEventListener("mouseleave", onMouseLeave as EventListener);
			}
			document.removeEventListener("focusin", onFocusIn);
			document.removeEventListener("keydown", onKeyDown);
			document.removeEventListener("click", onClick);
		};
	}, []);

	const openTab = openTabId ? tabs.find((t) => t.id === openTabId) : null;
	if (!openTab) return null;

	const showPanel =
		openTab.subcategories.length > 0 ||
		openTab.brand_list.brands.length > 0 ||
		openTab.promo_tiles.length > 0;
	if (!showPanel) return null;

	return (
		<div
			ref={panelRef}
			role="menu"
			onMouseEnter={() => {
				if (closeTimer.current) clearTimeout(closeTimer.current);
			}}
			onMouseLeave={() => {
				closeTimer.current = setTimeout(
					() => setOpenTabId(null),
					CLOSE_DELAY_MS,
				);
			}}
			className="absolute inset-x-0 top-full z-50 bg-nl-linen border-t border-nl-cacao/10 shadow-[0_24px_60px_rgba(26,18,8,0.12)] animate-fade-in-up"
		>
			<div className="max-w-[1400px] mx-auto px-4 md:px-12">
				<MegaMenuPanel tab={openTab} />
			</div>
		</div>
	);
}
