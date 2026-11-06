import { describe, expect, it } from "vitest";
import { toggleDeliverySpeed } from "../delivery-filter-group";
import {
	dubaiToday,
	formatDeliveryDate,
	headlineFor,
	minutesLeft,
	splitMinutes,
} from "../delivery-format";
import {
	FALLBACK_EMIRATE,
	canonicalEmirate,
	resolveEmirate,
} from "../use-delivery-emirate";

describe("delivery-format", () => {
	it("reads today's date in Dubai, not UTC", () => {
		expect(dubaiToday(new Date("2026-11-09T21:30:00Z"))).toBe("2026-11-10");
		expect(dubaiToday(new Date("2026-11-09T19:59:00Z"))).toBe("2026-11-09");
	});

	it("formats a delivery date like 'Tue, 12 Nov'", () => {
		expect(formatDeliveryDate("2026-11-10", "en")).toMatch(/Tue.*10.*Nov/);
		// Arabic weekday name, never English.
		expect(formatDeliveryDate("2026-11-10", "ar")).toMatch(/الثلاثاء/);
	});

	it("chooses today, tomorrow or 'by' the latest date", () => {
		const now = new Date("2026-11-09T10:00:00+04:00");
		expect(
			headlineFor({ earliest: "2026-11-09", latest: "2026-11-09" }, now),
		).toEqual({ kind: "today", date: "2026-11-09" });
		expect(
			headlineFor({ earliest: "2026-11-10", latest: "2026-11-10" }, now).kind,
		).toBe("tomorrow");
		expect(
			headlineFor({ earliest: "2026-11-10", latest: "2026-11-12" }, now),
		).toEqual({ kind: "by", date: "2026-11-12" });
		// A stale "today" estimate after midnight is no longer called today.
		expect(
			headlineFor(
				{ earliest: "2026-11-09", latest: "2026-11-09" },
				new Date("2026-11-10T00:30:00+04:00"),
			).kind,
		).toBe("by");
	});

	it("counts minutes to the cutoff from the live clock", () => {
		const cutoff = "2026-11-09T10:00:00.000Z"; // 14:00 Dubai
		expect(minutesLeft(cutoff, new Date("2026-11-09T10:40:00+04:00"))).toBe(
			200,
		);
		expect(minutesLeft(cutoff, new Date("2026-11-09T15:00:00+04:00"))).toBe(0);
		expect(splitMinutes(200)).toEqual({ hours: 3, minutes: 20 });
	});
});

describe("destination emirate", () => {
	it("canonicalises stored spellings", () => {
		expect(canonicalEmirate("abu_dhabi")).toBe("Abu Dhabi");
		expect(canonicalEmirate("Umm-al-Quwain")).toBe("Umm Al Quwain");
		expect(canonicalEmirate("Riyadh")).toBeNull();
	});

	it("prefers checkout address, then the picked emirate, then the default address", () => {
		const addresses = [
			{ id: "a", emirate: "Ajman" },
			{ id: "b", state: "sharjah", is_default: true },
		];
		expect(
			resolveEmirate({
				checkoutAddress: { emirate: "Fujairah" },
				preference: "Dubai",
				addresses,
			}),
		).toEqual({
			emirate: "Fujairah",
			source: "checkout_address",
		});
		expect(resolveEmirate({ preference: "Dubai", addresses }).source).toBe(
			"preference",
		);
		expect(resolveEmirate({ addresses })).toEqual({
			emirate: "Sharjah",
			source: "default_address",
		});
		expect(resolveEmirate({})).toEqual({
			emirate: FALLBACK_EMIRATE,
			source: "fallback",
		});
	});
});

describe("delivery filter draft", () => {
	it("sets and clears the speed with its emirate", () => {
		const on = toggleDeliverySpeed({ q: "kraft" }, "same_day", "Dubai");
		expect(on).toEqual({ q: "kraft", delivery: "same_day", emirate: "Dubai" });
		expect(toggleDeliverySpeed(on, "next_day", "Dubai").delivery).toBe(
			"next_day",
		);
		expect(toggleDeliverySpeed(on, "same_day", "Dubai")).toEqual({
			q: "kraft",
		});
	});
});
