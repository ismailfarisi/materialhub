import { describe, expect, it } from "vitest";
import { isValidTrn, normalizeTrn, peppolIdFromTrn, trnState } from "../trn";

describe("TRN helpers", () => {
	it("accepts exactly 15 digits", () => {
		expect(isValidTrn("100234567800003")).toBe(true);
		expect(isValidTrn("10023456780000")).toBe(false);
		expect(isValidTrn("1002345678000031")).toBe(false);
		expect(isValidTrn("")).toBe(false);
		expect(isValidTrn(null)).toBe(false);
	});

	it("strips spaces and dashes pasted from a VAT certificate", () => {
		expect(normalizeTrn("100-2345-6780-0003")).toBe("100234567800003");
		expect(normalizeTrn(" 100 234 567 800 003 ")).toBe("100234567800003");
		expect(isValidTrn("100 2345 6780 0003")).toBe(true);
	});

	it("reads Arabic-Indic digits", () => {
		expect(normalizeTrn("١٠٠٢٣٤٥٦٧٨٠٠٠٠٣")).toBe("100234567800003");
		expect(isValidTrn("۱۰۰۲۳۴۵۶۷۸۰۰۰۰۳")).toBe(true);
	});

	it("reports live progress toward 15 digits", () => {
		expect(trnState("")).toEqual({ state: "empty", digits: 0 });
		expect(trnState("1002345")).toEqual({ state: "short", digits: 7 });
		expect(trnState("100234567800003")).toEqual({ state: "valid", digits: 15 });
		expect(trnState("1002345678000039")).toEqual({ state: "long", digits: 16 });
	});

	it("derives the Peppol participant ID from the first 10 digits", () => {
		expect(peppolIdFromTrn("100234567800003")).toBe("0235:1002345678");
		expect(peppolIdFromTrn("12345")).toBeNull();
	});
});
