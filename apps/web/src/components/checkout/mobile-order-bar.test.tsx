import type { CheckoutQuote } from "@/lib/queries/checkout-quote";
import { fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileOrderBar } from "./mobile-order-bar";

vi.mock("next-intl", () => ({
	useLocale: () => "en",
	useTranslations: () => (key: string) => key,
}));

vi.mock("next/image", () => ({
	default: ({ alt, ...props }: { alt: string }) => createElement("img", { alt, ...props }),
}));

const store = vi.hoisted(() => ({
	state: {
		isMobileSummaryOpen: false,
		setMobileSummaryOpen: vi.fn(),
		isPlacing: false,
		paymentMethod: "card" as string,
		error: "",
	},
}));

vi.mock("@/stores/checkout", () => ({
	useCheckoutStore: (selector?: (s: typeof store.state) => unknown) =>
		selector ? selector(store.state) : store.state,
}));

const quote: CheckoutQuote = {
	schema_version: 1,
	quote_token: "quote",
	issued_at: new Date().toISOString(),
	expires_at: new Date(Date.now() + 60_000).toISOString(),
	currency: "AED",
	requires_address: false,
	fx_snapshot: { base: "AED", rate: 1, captured_at: new Date().toISOString() },
	totals: {
		subtotal_fils: 123_456,
		shipping_fils: 0,
		discount_fils: 0,
		vat_fils: 0,
		vat_rate_bps: 500,
		surcharge_fils: 0,
		grand_total_fils: 123_456,
		default_selection: { payment_method_id: "card", shipping_by_group: {} },
	},
	shipping: null,
	payment_methods: [
		{ id: "card", available: true, surcharge_fils: 0, surcharge_type: "fixed", reason_key: null },
		{ id: "tamara", available: true, surcharge_fils: 0, surcharge_type: "fixed", reason_key: null },
		{ id: "cod", available: true, surcharge_fils: 1_000, surcharge_type: "fixed", reason_key: null },
	],
	compatibility: {},
	notices: [],
};

describe("MobileOrderBar", () => {
	beforeEach(() => {
		store.state.isMobileSummaryOpen = false;
		store.state.isPlacing = false;
		store.state.paymentMethod = "card";
		store.state.error = "";
		store.state.setMobileSummaryOpen.mockClear();
	});

	it("keeps the fixed footer inside the viewport on mobile only", () => {
		render(<MobileOrderBar items={[]} quote={quote} canOrder onPlaceOrder={vi.fn()} />);
		const bar = screen.getByTestId("mobile-order-bar");
		expect(bar.className).toContain("inset-x-0");
		expect(bar.className).toContain("max-w-full");
		expect(bar.className).toContain("lg:hidden");
		const row = bar.lastElementChild as HTMLElement;
		expect(row.className).toContain("grid-cols-[minmax(0,1fr)_auto]");
		expect(screen.getByRole("button", { name: /payNow/ }).className).toContain("max-w-[56vw]");
	});

	it("names the action after the payment method", () => {
		const { rerender } = render(<MobileOrderBar items={[]} quote={quote} canOrder onPlaceOrder={vi.fn()} />);
		expect(screen.getByRole("button", { name: /payNow/ })).toBeInTheDocument();

		store.state.paymentMethod = "tamara";
		rerender(<MobileOrderBar items={[]} quote={quote} canOrder onPlaceOrder={vi.fn()} />);
		expect(screen.getByRole("button", { name: /continueToTamara/ })).toBeInTheDocument();

		store.state.paymentMethod = "cod";
		rerender(<MobileOrderBar items={[]} quote={quote} canOrder onPlaceOrder={vi.fn()} />);
		expect(screen.getByRole("button", { name: /placeOrderCta/ })).toBeInTheDocument();
	});

	it("disables the action until the order can be placed", () => {
		const onPlaceOrder = vi.fn();
		render(<MobileOrderBar items={[]} quote={quote} canOrder={false} onPlaceOrder={onPlaceOrder} />);
		const button = screen.getByRole("button", { name: /payNow/ });
		expect(button).toBeDisabled();
		fireEvent.click(button);
		expect(onPlaceOrder).not.toHaveBeenCalled();
	});

	it("shows a payment error right above the action", () => {
		store.state.error = "Your card was declined.";
		render(<MobileOrderBar items={[]} quote={quote} canOrder onPlaceOrder={vi.fn()} />);
		expect(screen.getByRole("alert")).toHaveTextContent("Your card was declined.");
	});

	it("opens the summary sheet from the total", () => {
		render(<MobileOrderBar items={[]} quote={quote} canOrder onPlaceOrder={vi.fn()} />);
		fireEvent.click(screen.getByRole("button", { name: "showOrderSummary" }));
		expect(store.state.setMobileSummaryOpen).toHaveBeenCalledWith(true);
	});
});
