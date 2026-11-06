import ar from "@/messages/ar.json";
import en from "@/messages/en.json";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
	type CartLineTrade,
	CartLineTradeNotes,
	cartStepQuantity,
} from "./cart-line-trade";
import { QuantityBreaks } from "./quantity-breaks";
import { TradeQuantityNote } from "./trade-quantity-note";
import { tradeTermsFor } from "./trade-terms";

function wrap(locale: "en" | "ar", ui: ReactNode) {
	return render(
		<NextIntlClientProvider
			locale={locale}
			messages={locale === "ar" ? ar : en}
		>
			{ui}
		</NextIntlClientProvider>,
	);
}

const terms = tradeTermsFor({
	price: 600,
	unit_of_measure: "sheet",
	min_order_quantity: 50,
	order_increment: 25,
	price_tiers: [
		{ min_quantity: 100, unit_price: 540 },
		{ min_quantity: 500, unit_price: 480 },
	],
});

describe("QuantityBreaks", () => {
	it("marks the band the quantity is in and sets quantity from a band", () => {
		const onSelect = vi.fn();
		wrap(
			"en",
			<QuantityBreaks terms={terms} quantity={150} onSelect={onSelect} />,
		);
		const rows = screen.getAllByRole("row");
		expect(rows).toHaveLength(4);
		expect(rows[2]?.getAttribute("aria-current")).toBe("true");
		expect(rows[2]?.textContent).toContain("100–499");
		expect(rows[3]?.textContent).toContain("−20%");
		fireEvent.click(screen.getByRole("button", { name: /500\+ sheet/ }));
		expect(onSelect).toHaveBeenCalledWith(500);
	});

	it("renders nothing without tiers", () => {
		const { container } = wrap(
			"en",
			<QuantityBreaks
				terms={tradeTermsFor({ price: 100 })}
				quantity={1}
				onSelect={() => {}}
			/>,
		);
		expect(container.textContent).toBe("");
	});

	it("speaks Arabic", () => {
		wrap(
			"ar",
			<QuantityBreaks terms={terms} quantity={50} onSelect={() => {}} />,
		);
		expect(screen.getByText("أسعار الكميات")).toBeTruthy();
		expect(screen.getByText("سعر الوحدة")).toBeTruthy();
	});
});

describe("TradeQuantityNote", () => {
	it("states the rule and offers the next tier", () => {
		const onSelect = vi.fn();
		wrap(
			"en",
			<TradeQuantityNote terms={terms} quantity={75} onSelect={onSelect} />,
		);
		expect(
			screen.getByText("Minimum order 50 sheets, then in steps of 25"),
		).toBeTruthy();
		expect(screen.getByText("Add 25 sheets for AED 5.40 each")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Add 25" }));
		expect(onSelect).toHaveBeenCalledWith(100);
	});

	it("uses Arabic plural forms", () => {
		wrap(
			"ar",
			<TradeQuantityNote terms={terms} quantity={75} onSelect={() => {}} />,
		);
		expect(screen.getByText(/الحد الأدنى للطلب/)).toBeTruthy();
	});
});

const trade: CartLineTrade = {
	unit: "sheet",
	units_per_pack: null,
	pack_contents_unit: null,
	min_order_quantity: 50,
	order_increment: 25,
	is_sample: false,
	max_quantity: null,
	base_unit_price: 600,
	live_unit_price: 540,
	price_source: "tier",
	tier: { min_quantity: 100, unit_price: 540 },
	savings_fils: 6000,
	next_tier: { min_quantity: 500, unit_price: 480, units_to_go: 400 },
	tiers: [
		{ min_quantity: 100, unit_price: 540 },
		{ min_quantity: 500, unit_price: 480 },
	],
	violation: null,
};

describe("CartLineTradeNotes", () => {
	it("shows the tier and its savings", () => {
		wrap(
			"en",
			<CartLineTradeNotes
				trade={trade}
				quantity={100}
				onSetQuantity={() => {}}
			/>,
		);
		expect(screen.getByText(/Tier price from 100 sheets/)).toBeTruthy();
		expect(screen.getByText(/You save AED 60/)).toBeTruthy();
	});

	it("explains a broken rule and fixes it in one click", () => {
		const onSet = vi.fn();
		wrap(
			"en",
			<CartLineTradeNotes
				trade={{
					...trade,
					violation: {
						code: "MIN_ORDER_QUANTITY",
						message: "x",
						suggested_quantity: 50,
					},
				}}
				quantity={20}
				onSetQuantity={onSet}
			/>,
		);
		expect(screen.getByRole("alert").textContent).toContain(
			"The minimum order is 50 sheets.",
		);
		fireEvent.click(
			screen.getByRole("button", { name: "Change to 50 sheets" }),
		);
		expect(onSet).toHaveBeenCalledWith(50);
	});

	it("badges samples", () => {
		wrap(
			"ar",
			<CartLineTradeNotes
				trade={{
					...trade,
					is_sample: true,
					price_source: "base",
					next_tier: null,
				}}
				quantity={1}
				onSetQuantity={() => {}}
			/>,
		);
		expect(screen.getByText("عيّنة")).toBeTruthy();
	});

	it("steps the cart quantity by the increment", () => {
		expect(cartStepQuantity(trade, 100, 101)).toBe(125);
		expect(cartStepQuantity(trade, 50, 49)).toBe(50);
		expect(
			cartStepQuantity(
				{
					...trade,
					is_sample: true,
					min_order_quantity: 1,
					order_increment: 1,
					max_quantity: 2,
				},
				2,
				3,
			),
		).toBe(2);
		expect(cartStepQuantity(null, 3, 4)).toBe(4);
	});
});
