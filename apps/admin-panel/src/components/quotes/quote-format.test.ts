import type { AdminQuoteDetail } from "@/lib/queries/quotes";
import { describe, expect, it } from "vitest";
import { aed, buyerName, day, historyLines } from "./quote-format";

const detail = {
	buyer: {
		id: "u1",
		email: "buyer@materialhub.test",
		first_name: "Sara",
		last_name: "Khan",
	},
	suppliers: [
		{
			id: "s1",
			vendor: {
				id: "v1",
				name: "Alpha Board Trading",
				slug: "alpha",
				logo_url: null,
			},
		},
	],
	history: [
		{
			id: "h1",
			quote_request_vendor_id: null,
			subject: "request",
			from_status: null,
			to_status: "open",
			actor_role: "buyer",
			note: null,
			created_at: "2026-11-06T08:00:00Z",
		},
		{
			id: "h2",
			quote_request_vendor_id: "s1",
			subject: "vendor",
			from_status: "pending",
			to_status: "vendor_declined",
			actor_role: "vendor",
			note: "Out of 2.0 mm",
			created_at: "2026-11-06T09:00:00Z",
		},
		{
			id: "h3",
			quote_request_vendor_id: "s1",
			subject: "response",
			from_status: "submitted",
			to_status: "superseded",
			actor_role: "vendor",
			note: null,
			created_at: "2026-11-06T10:00:00Z",
		},
	],
} as unknown as AdminQuoteDetail;

describe("admin quote formatting", () => {
	it("formats fils as AED", () => {
		expect(aed(365)).toBe("AED 3.65");
		expect(aed(365_000)).toBe("AED 3,650.00");
	});

	it("formats calendar dates without timezone drift", () => {
		expect(day("2026-11-20")).toBe("20 Nov 2026");
	});

	it("shows buyer name and email for support", () => {
		expect(buyerName(detail.buyer)).toBe("Sara Khan (buyer@materialhub.test)");
	});

	it("writes readable history lines naming the supplier", () => {
		const lines = historyLines(detail).map((l) => l.text);
		expect(lines[0]).toBe("Request: open, by buyer");
		expect(lines[1]).toBe(
			"Alpha Board Trading: vendor declined (was pending), by vendor: “Out of 2.0 mm”",
		);
		expect(lines[2]).toBe(
			"Alpha Board Trading: quote superseded (was submitted), by vendor",
		);
	});
});
