import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCollapseOnScroll } from "../use-collapse-on-scroll";

/** Drive the hook the way a real scroll would: move scrollY, then fire the event. */
function scrollTo(y: number) {
	act(() => {
		window.scrollY = y;
		window.dispatchEvent(new Event("scroll"));
	});
}

/** Total document height; innerHeight is 768 below, so 5000 leaves plenty of runway. */
function setDocumentHeight(height: number) {
	vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(height);
}

beforeEach(() => {
	// jsdom never actually scrolls, so scrollY has to be writable.
	Object.defineProperty(window, "scrollY", { value: 0, writable: true, configurable: true });
	Object.defineProperty(window, "innerHeight", { value: 768, writable: true, configurable: true });
	setDocumentHeight(5000);
	// Run rAF callbacks synchronously so assertions don't need to await a frame.
	vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
		cb(0);
		return 1;
	});
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("useCollapseOnScroll", () => {
	it("starts expanded", () => {
		const { result } = renderHook(() => useCollapseOnScroll());
		expect(result.current).toBe(false);
	});

	it("collapses on scroll down past the always-open zone", () => {
		const { result } = renderHook(() => useCollapseOnScroll());
		scrollTo(400);
		expect(result.current).toBe(true);
	});

	it("reveals again on scroll up", () => {
		const { result } = renderHook(() => useCollapseOnScroll());
		scrollTo(400);
		expect(result.current).toBe(true);

		scrollTo(300);
		expect(result.current).toBe(false);
	});

	it("stays expanded near the top of the document", () => {
		const { result } = renderHook(() => useCollapseOnScroll());
		// Downward, but still inside the 64px always-open zone.
		scrollTo(40);
		expect(result.current).toBe(false);
	});

	it("ignores jitter below the delta threshold", () => {
		const { result } = renderHook(() => useCollapseOnScroll());
		scrollTo(400);
		scrollTo(300);
		expect(result.current).toBe(false);

		// A 4px nudge down is under the 8px threshold — must not flip the state.
		scrollTo(304);
		expect(result.current).toBe(false);
	});

	it("accumulates sub-threshold movement instead of discarding it", () => {
		const { result } = renderHook(() => useCollapseOnScroll());
		scrollTo(400);
		scrollTo(300);
		expect(result.current).toBe(false);

		// Two 5px nudges are each under the threshold, but together they clear it.
		scrollTo(305);
		expect(result.current).toBe(false);
		scrollTo(310);
		expect(result.current).toBe(true);
	});

	it("stays expanded at the very end of the document", () => {
		const { result } = renderHook(() => useCollapseOnScroll());
		scrollTo(400);
		expect(result.current).toBe(true);

		// Scrolling down, but the viewport bottom now reaches the document end,
		// so the tab bar must not leave a gap above the footer.
		scrollTo(5000 - 768);
		expect(result.current).toBe(false);
	});

	it("detaches its scroll listener on unmount", () => {
		const removeSpy = vi.spyOn(window, "removeEventListener");
		const { unmount } = renderHook(() => useCollapseOnScroll());
		unmount();
		expect(removeSpy).toHaveBeenCalledWith("scroll", expect.any(Function));
	});
});
