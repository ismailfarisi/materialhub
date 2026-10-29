import { useCartStore } from "@/stores/cart";
import { afterEach, describe, expect, test, vi } from "vitest";
import { registerMaterialHubWebMcpTools } from "./webmcp";

describe("registerMaterialHubWebMcpTools", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		Reflect.deleteProperty(document, "modelContext");
		useCartStore.setState({ itemCount: 0, isSlideOverOpen: false });
	});

	test("does nothing when WebMCP is unavailable", () => {
		expect(registerMaterialHubWebMcpTools()).toBeUndefined();
	});

	test("registers storefront tools and aborts them during cleanup", () => {
		const registerTool = vi.fn();
		Object.defineProperty(document, "modelContext", {
			configurable: true,
			value: { registerTool },
		});

		const cleanup = registerMaterialHubWebMcpTools({ locale: "en" });

		expect(registerTool).toHaveBeenCalledTimes(3);
		expect(registerTool.mock.calls.map(([tool]) => tool.name)).toEqual([
			"materialhub.searchProducts",
			"materialhub.getCartSummary",
			"materialhub.openCart",
		]);

		const signals = registerTool.mock.calls.map(
			([, options]) => options.signal,
		);
		expect(signals.every((signal) => signal instanceof AbortSignal)).toBe(true);
		expect(signals.every((signal) => signal.aborted)).toBe(false);

		cleanup?.();

		expect(signals.every((signal) => signal.aborted)).toBe(true);
	});

	test("opens the cart and returns the current cart summary", async () => {
		const registerTool = vi.fn();
		Object.defineProperty(document, "modelContext", {
			configurable: true,
			value: { registerTool },
		});
		useCartStore.setState({ itemCount: 4, isSlideOverOpen: false });

		registerMaterialHubWebMcpTools({ locale: "en" });

		const summaryTool = registerTool.mock.calls[1][0];
		const openCartTool = registerTool.mock.calls[2][0];

		await expect(summaryTool.execute({})).resolves.toEqual({
			content: [{ type: "text", text: "Cart contains 4 items." }],
			structuredContent: { itemCount: 4, isOpen: false },
		});

		await expect(openCartTool.execute({})).resolves.toEqual({
			content: [{ type: "text", text: "Cart opened." }],
			structuredContent: { isOpen: true },
		});
		expect(useCartStore.getState().isSlideOverOpen).toBe(true);
	});
});
