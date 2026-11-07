import { describe, expect, test } from "bun:test";
import { buildVendorApplyPayload, validateVendorApply } from "./vendor-apply";

const form = {
	storeName: "E2E fix Al Quoz Boards",
	email: "sales@alquozboards.example",
	phone: "+971 50 123 4567",
	street: "Warehouse 12, Al Quoz Industrial 3",
	city: "Dubai",
	emirate: "Dubai",
	trn: "",
};

describe("validateVendorApply", () => {
	test("a complete form with an uploaded licence has no errors", () => {
		expect(validateVendorApply(form, "private/business/u1/licence.pdf")).toEqual({});
	});

	test("flags missing licence, bad email, bad TRN and unknown emirate", () => {
		const e = validateVendorApply(
			{ ...form, email: "nope", trn: "1234", emirate: "Muscat" },
			null,
		);
		expect(Object.keys(e).sort()).toEqual(["email", "emirate", "licence", "trn"]);
	});
});

describe("buildVendorApplyPayload", () => {
	test("maps to the snake_case API body with the licence document", () => {
		const body = buildVendorApplyPayload(
			{ ...form, trn: "100-1234-5670-0003" },
			"private/business/u1/licence.pdf",
			"licence.pdf",
		);
		expect(body).toEqual({
			business_name: "E2E fix Al Quoz Boards",
			business_email: "sales@alquozboards.example",
			business_phone: "+971 50 123 4567",
			business_address: {
				street: "Warehouse 12, Al Quoz Industrial 3",
				city: "Dubai",
				state: "Dubai",
				country: "AE",
			},
			tax_registration_number: "100123456700003",
			documents: [
				{ type: "trade_license", s3_key: "private/business/u1/licence.pdf", file_name: "licence.pdf" },
			],
		});
	});

	test("omits the TRN when blank", () => {
		expect(buildVendorApplyPayload(form, "k", "f")).not.toHaveProperty("tax_registration_number");
	});
});
