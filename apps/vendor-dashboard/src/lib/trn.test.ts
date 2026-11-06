import { describe, expect, test } from "bun:test";
import { normalizeTrn, trnState, validateTrn } from "./trn";

describe("validateTrn", () => {
	test("accepts 15 digits, with pasted spaces or dashes", () => {
		expect(validateTrn("100234567800003")).toEqual({
			ok: true,
			value: "100234567800003",
		});
		expect(validateTrn(" 100-2345-6780-0003 ")).toEqual({
			ok: true,
			value: "100234567800003",
		});
		expect(normalizeTrn("100 234 567 800 003")).toBe("100234567800003");
	});

	test("empty clears the TRN", () => {
		expect(validateTrn("")).toEqual({ ok: true, value: null });
		expect(validateTrn("   ")).toEqual({ ok: true, value: null });
	});

	test("rejects letters and wrong lengths with a message", () => {
		expect(validateTrn("TRN100234567800")).toEqual({
			ok: false,
			error: "A TRN has digits only.",
		});
		expect(validateTrn("10023456780000")).toEqual({
			ok: false,
			error: "A TRN has 15 digits; this has 14.",
		});
		expect(validateTrn("1002345678000031").ok).toBe(false);
	});
});

describe("trnState", () => {
	test("missing, invalid, unverified, verified", () => {
		expect(trnState({ trn: null })).toBe("missing");
		expect(trnState({ trn: "12345", trn_format_valid: false })).toBe("invalid");
		expect(trnState({ trn: "100234567800003", trn_format_valid: true })).toBe(
			"unverified",
		);
		expect(
			trnState({
				trn: "100234567800003",
				trn_format_valid: true,
				trn_verified_at: "2026-10-12T09:00:00Z",
			}),
		).toBe("verified");
	});

	test("falls back to a local format check when the server omits trn_format_valid", () => {
		expect(trnState({ trn: "12345" })).toBe("invalid");
		expect(trnState({ trn: "100234567800003" })).toBe("unverified");
	});
});
