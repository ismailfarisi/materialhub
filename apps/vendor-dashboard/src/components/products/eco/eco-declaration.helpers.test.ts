import { describe, expect, test } from "bun:test";
import {
	DECLARATION_TEXT,
	type EcoDeclaration,
	REVIEW_DISCLAIMER,
	STATUS_META,
	buildDeclarationPayload,
	declarationErrorMessage,
	validateCertificateFile,
	willResetApproval,
} from "./eco-declaration.helpers";

const approved: EcoDeclaration = {
	id: "d1",
	product_id: "p1",
	status: "approved",
	statement: "Paper only",
	certificate_filename: "fsc.pdf",
	has_certificate: true,
	submitted_at: "2026-11-01T08:00:00Z",
	reviewed_at: "2026-11-02T08:00:00Z",
	rejection_reason: null,
};

describe("buildDeclarationPayload", () => {
	test("omits the certificate when kept, so the server keeps it", () => {
		const p = buildDeclarationPayload({ statement: "  Paper  ", confirm: true, certificate: { kind: "keep" } });
		expect(p).toEqual({ confirm: true, statement: "Paper" });
		expect("certificate_key" in p).toBe(false);
	});
	test("sends null to remove, and the new key to replace", () => {
		expect(
			buildDeclarationPayload({ statement: "", confirm: true, certificate: { kind: "remove" } }),
		).toEqual({ confirm: true, statement: null, certificate_key: null, certificate_filename: null });
		expect(
			buildDeclarationPayload({
				statement: "x",
				confirm: true,
				certificate: { kind: "new", key: "private/eco-certificates/v/a/c.pdf", filename: "c.pdf" },
			}),
		).toMatchObject({ certificate_key: "private/eco-certificates/v/a/c.pdf", certificate_filename: "c.pdf" });
	});
});

describe("willResetApproval", () => {
	test("only when an approved declaration actually changes", () => {
		const same = { statement: "Paper only ", confirm: true, certificate: { kind: "keep" as const } };
		expect(willResetApproval(approved, same)).toBe(false);
		expect(willResetApproval(approved, { ...same, statement: "Paper and glue" })).toBe(true);
		expect(willResetApproval(approved, { ...same, certificate: { kind: "remove" } })).toBe(true);
		expect(willResetApproval({ ...approved, status: "pending" }, { ...same, statement: "x" })).toBe(false);
		expect(willResetApproval(null, same)).toBe(false);
	});
});

describe("validateCertificateFile", () => {
	test("accepts PDF, JPG and PNG up to 10 MB", () => {
		expect(validateCertificateFile({ type: "application/pdf", size: 1024 })).toBeNull();
		expect(validateCertificateFile({ type: "image/png", size: 10 * 1024 * 1024 })).toBeNull();
	});
	test("rejects other types and large files", () => {
		expect(validateCertificateFile({ type: "image/gif", size: 10 })).toMatch(/PDF, JPG or PNG/);
		expect(validateCertificateFile({ type: "application/pdf", size: 10 * 1024 * 1024 + 1 })).toMatch(/10 MB/);
	});
});

describe("copy", () => {
	test("declaration names the banned items and never claims certification", () => {
		for (const item of ["cups", "lids", "cutlery", "plates", "straws", "stirrers", "foam food containers", "50 microns"]) {
			expect(DECLARATION_TEXT).toContain(item);
		}
		expect(REVIEW_DISCLAIMER).toContain("does not certify legal compliance");
		expect(STATUS_META.approved.help).toContain("you declared it and MaterialHub reviewed it");
	});
});

describe("declarationErrorMessage", () => {
	test("maps server codes", () => {
		expect(declarationErrorMessage({ response: { data: { code: "ECO_DECLARATION_UNCONFIRMED" } } })).toMatch(/Tick/);
		expect(declarationErrorMessage({ response: { data: { message: "Boom" } } })).toBe("Boom");
		expect(declarationErrorMessage(new Error("x"))).toMatch(/Could not save/);
	});
});
