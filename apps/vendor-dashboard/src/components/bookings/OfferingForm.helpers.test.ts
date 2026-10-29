import { describe, expect, test } from "vitest";
import {
	depositValueToFormUnits,
	depositValueToPayloadUnits,
} from "./OfferingForm.helpers";

describe("depositValueToPayloadUnits", () => {
	test("converts a fixed AED deposit to fils", () => {
		// A vendor typing 50 under the "Deposit (AED)" label means AED 50.00,
		// which the backend must read as 5000 fils.
		expect(depositValueToPayloadUnits("fixed", 50)).toBe(5000);
	});

	test("handles AED decimals on a fixed deposit", () => {
		expect(depositValueToPayloadUnits("fixed", 12.5)).toBe(1250);
		expect(depositValueToPayloadUnits("fixed", 0.99)).toBe(99);
	});

	test("leaves a percent deposit unscaled", () => {
		expect(depositValueToPayloadUnits("percent", 25)).toBe(25);
		expect(depositValueToPayloadUnits("percent", 100)).toBe(100);
	});

	test("zero round-trips in both modes", () => {
		expect(depositValueToPayloadUnits("fixed", 0)).toBe(0);
		expect(depositValueToPayloadUnits("percent", 0)).toBe(0);
	});
});

describe("depositValueToFormUnits", () => {
	test("converts stored fils back to AED for a fixed deposit", () => {
		expect(depositValueToFormUnits("fixed", 5000)).toBe(50);
		expect(depositValueToFormUnits("fixed", 1250)).toBe(12.5);
	});

	test("leaves a percent deposit unscaled", () => {
		expect(depositValueToFormUnits("percent", 25)).toBe(25);
	});
});

describe("deposit value round-trip", () => {
	test("load → submit is lossless for fixed deposits", () => {
		for (const fils of [0, 99, 1250, 5000, 123_45]) {
			expect(
				depositValueToPayloadUnits("fixed", depositValueToFormUnits("fixed", fils)),
			).toBe(fils);
		}
	});

	test("load → submit is lossless for percent deposits", () => {
		for (const pct of [0, 10, 25, 100]) {
			expect(
				depositValueToPayloadUnits(
					"percent",
					depositValueToFormUnits("percent", pct),
				),
			).toBe(pct);
		}
	});
});
