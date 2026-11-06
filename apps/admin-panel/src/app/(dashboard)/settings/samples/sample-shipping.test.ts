import { describe, expect, it } from "vitest";
import { filsSettingToAed, parseAedToFils } from "./sample-shipping";

describe("sample shipping setting", () => {
	it("parses AED to fils", () => {
		expect(parseAedToFils("10")).toBe(1000);
		expect(parseAedToFils("7.50")).toBe(750);
		expect(parseAedToFils("0")).toBe(0);
		expect(parseAedToFils("-1")).toBeNull();
		expect(parseAedToFils("7.555")).toBeNull();
		expect(parseAedToFils("501")).toBeNull();
	});

	it("shows the stored fils as AED, defaulting when unreadable", () => {
		expect(filsSettingToAed("750")).toBe("7.5");
		expect(filsSettingToAed(undefined)).toBe("10");
	});
});
