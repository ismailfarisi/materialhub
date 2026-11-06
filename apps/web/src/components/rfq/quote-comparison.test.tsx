import type {
	QuoteRequestDetail,
	QuoteResponse,
	QuoteSupplier,
} from "@/lib/queries/rfq";
import en from "@/messages/en.json";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { QuoteComparison } from "./quote-comparison";
import {
	dubaiTodayIso,
	formatQuoteDate,
	requestTone,
	supplierTone,
} from "./status";

vi.mock("next/link", () => ({
	default: ({
		href,
		children,
		...rest
	}: { href: string; children: React.ReactNode }) => (
		<a href={href} {...rest}>
			{children}
		</a>
	),
}));

function response(over: Partial<QuoteResponse> = {}): QuoteResponse {
	return {
		id: "r1",
		status: "submitted",
		display_state: "live",
		unit_price: 365,
		currency: "AED",
		moq: 500,
		lead_time_days: 5,
		valid_until: "2026-11-20",
		notes: null,
		order_quantity: 1000,
		total: 365_000,
		product: {
			id: "p1",
			name: "Greyboard 2.0 mm 70 × 100 cm",
			slug: "greyboard-2mm",
			price: 480,
			image_url: null,
		},
		variant: null,
		created_at: "2026-11-06T08:00:00Z",
		...over,
	};
}

function supplier(
	id: string,
	name: string,
	over: Partial<QuoteSupplier> = {},
): QuoteSupplier {
	return {
		id,
		status: "responded",
		decline_reason: null,
		vendor: { id: `v-${id}`, name, slug: name.toLowerCase(), logo_url: null },
		current_response: response({ id: `r-${id}` }),
		previous_responses: [],
		messages: [],
		can_accept: true,
		can_decline: true,
		can_message: true,
		...over,
	};
}

function request(suppliers: QuoteSupplier[]): QuoteRequestDetail {
	return {
		id: "q1",
		request_number: "RFQ-2026-000042",
		title: "Greyboard 2.0 mm",
		quantity: 1000,
		unit: "sheet",
		need_by: "2026-11-30",
		delivery_emirate: "Dubai",
		status: "quoted",
		accepted_response_id: null,
		created_at: "2026-11-06T08:00:00Z",
		specification: "Greyboard 2.0 mm, 70 × 100 cm",
		attachments: [],
		product: null,
		variant: null,
		can_cancel: true,
		suppliers,
		history: [],
	};
}

function renderIt(
	req: QuoteRequestDetail,
	actions = {
		onAccept: vi.fn(async () => {}),
		onDecline: vi.fn(async () => {}),
		busy: false,
	},
) {
	render(
		<NextIntlClientProvider locale="en" messages={en}>
			<QuoteComparison request={req} actions={actions} />
		</NextIntlClientProvider>,
	);
	return actions;
}

// The table (md+) is the first rendering; scope queries to it.
const table = () => screen.getByRole("table");

describe("QuoteComparison", () => {
	it("lines suppliers up as columns and marks the lowest price and fastest lead time", () => {
		renderIt(
			request([
				supplier("a", "Alpha Board", {
					current_response: response({
						id: "ra",
						unit_price: 365,
						lead_time_days: 7,
					}),
				}),
				supplier("b", "Beta Paper", {
					current_response: response({
						id: "rb",
						unit_price: 420,
						lead_time_days: 3,
						moq: 1200,
						order_quantity: 1200,
						total: 504_000,
					}),
				}),
			]),
		);
		const cols = within(table()).getAllByRole("columnheader");
		expect(cols.map((c) => c.textContent)).toEqual([
			expect.stringContaining("Alpha Board"),
			expect.stringContaining("Beta Paper"),
		]);
		expect(within(table()).getAllByText("Lowest price")).toHaveLength(1);
		expect(within(table()).getAllByText("Fastest")).toHaveLength(1);
		// MOQ above the requested 1,000 raises the order quantity and says so.
		expect(
			within(table()).getByText("Raised to the minimum order"),
		).toBeTruthy();
		expect(
			within(table()).getAllByText("1,200 sheets").length,
		).toBeGreaterThanOrEqual(1);
		// Prices name their unit.
		expect(within(table()).getAllByText("/ sheet").length).toBe(2);
	});

	it("asks for confirmation before accepting, then calls onAccept with the supplier", async () => {
		const actions = renderIt(request([supplier("a", "Alpha Board")]));
		fireEvent.click(within(table()).getByRole("button", { name: "Accept" }));
		expect(
			within(table()).getByText(
				"Add 1,000 sheets to your cart at AED 3.65 each?",
			),
		).toBeTruthy();
		fireEvent.click(
			within(table()).getByRole("button", { name: "Accept and add to cart" }),
		);
		await vi.waitFor(() => expect(actions.onAccept).toHaveBeenCalledWith("a"));
	});

	it("doesn't offer accept on an expired quote", () => {
		renderIt(
			request([
				supplier("a", "Alpha Board", {
					can_accept: false,
					current_response: response({
						display_state: "expired",
						valid_until: "2026-11-01",
					}),
				}),
			]),
		);
		expect(
			within(table()).queryByRole("button", { name: "Accept" }),
		).toBeNull();
		expect(within(table()).getByText("Expired")).toBeTruthy();
		expect(within(table()).getByText(/This quote has expired/)).toBeTruthy();
	});

	it("shows a waiting supplier and a declined one without quote rows", () => {
		renderIt(
			request([
				supplier("a", "Alpha Board", {
					status: "pending",
					current_response: null,
					can_accept: false,
					can_decline: false,
				}),
				supplier("b", "Beta Paper", {
					status: "vendor_declined",
					decline_reason: "Out of 2.0 mm",
					current_response: null,
					can_accept: false,
					can_decline: false,
				}),
			]),
		);
		expect(within(table()).getByText("Waiting for a quote")).toBeTruthy();
		expect(within(table()).getByText(/Out of 2.0 mm/)).toBeTruthy();
	});
});

describe("rfq status helpers", () => {
	it("maps statuses to state tones, never stocks", () => {
		expect(requestTone("accepted")).toBe("success");
		expect(requestTone("open")).toBe("warning");
		expect(supplierTone("vendor_declined")).toBe("error");
	});

	it("formats Dubai calendar dates without timezone drift", () => {
		expect(formatQuoteDate("2026-11-20", "en")).toBe("20 Nov 2026");
		expect(dubaiTodayIso(new Date("2026-11-06T21:30:00Z"))).toBe("2026-11-07");
	});
});
