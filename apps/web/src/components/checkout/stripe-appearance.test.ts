import { describe, expect, it } from "vitest";
import { swatchCardStyle, tokenHex } from "./stripe-appearance";

describe("Stripe appearance from Swatch Book tokens", () => {
	it("converts shadcn-style HSL token values to hex", () => {
		expect(tokenHex("222 18% 11%", "#000000")).toBe("#171A21");
		expect(tokenHex("16 90% 50%", "#000000")).toBe("#F24A0D");
		expect(tokenHex(" 0 0% 100% ", "#000000")).toBe("#FFFFFF");
	});

	it("falls back when the token is missing or unparseable", () => {
		expect(tokenHex("", "#123456")).toBe("#123456");
		expect(tokenHex("var(--x)", "#123456")).toBe("#123456");
	});

	it("never passes CSS variables into the Stripe iframe", () => {
		const style = JSON.stringify(swatchCardStyle());
		expect(style).not.toContain("var(");
	});
});
