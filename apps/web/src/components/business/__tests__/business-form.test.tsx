import type { BusinessMe, CreditAccount } from "@/lib/business/types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BusinessForm } from "../business-form";
import { NetTermsPanel } from "../net-terms-panel";

vi.mock("next-intl", () => ({
	useLocale: () => "en",
	useTranslations:
		(ns = "") =>
		(key: string, values?: Record<string, unknown>) =>
			`${ns}.${key}${values ? ` ${JSON.stringify(values)}` : ""}`,
}));
vi.mock("next/link", () => ({
	default: ({
		href,
		children,
	}: { href: string; children: React.ReactNode }) => (
		<a href={href}>{children}</a>
	),
}));
vi.mock("@/lib/queries/business", () => ({
	useUploadLicence: () => ({ mutateAsync: vi.fn(), isPending: false }),
	useApplyNetTerms: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

describe("BusinessForm TRN field", () => {
	const renderForm = (onSubmit = vi.fn()) =>
		render(
			<BusinessForm
				submitLabel="Create"
				busyLabel="…"
				busy={false}
				onSubmit={onSubmit}
			/>,
		);

	it("counts digits live and confirms at 15", () => {
		renderForm();
		const trn = screen.getByLabelText("business.form.trn");
		expect(screen.getByText("business.form.trnHint")).toBeInTheDocument();
		fireEvent.change(trn, { target: { value: "1002 3456" } });
		expect(
			screen.getByText('business.form.trnCount {"count":8}'),
		).toBeInTheDocument();
		fireEvent.change(trn, { target: { value: "100234567800003" } });
		expect(screen.getByText("business.form.trnValid")).toBeInTheDocument();
	});

	it("blocks submit with a short TRN and sends a normalised one", async () => {
		const onSubmit = vi.fn().mockResolvedValue(undefined);
		renderForm(onSubmit);
		const fill = (label: string, value: string) =>
			fireEvent.change(screen.getByLabelText(new RegExp(label)), {
				target: { value },
			});
		fill("form.legalName", "Gulf Rigid Box Workshop LLC");
		fill("form.licenceNumber", "DED-1048821");
		fill("form.licenceExpiry", "2030-03-31");
		fill("form.line1", "Warehouse 14, Street 7, Al Quoz 3");
		fill("form.city", "Dubai");
		fill("form.emirate", "Dubai");
		fill("form\\.trn$", "1002345678");
		fireEvent.click(screen.getByRole("button", { name: "Create" }));
		expect(
			await screen.findByText("business.errors.TRN_INVALID"),
		).toBeInTheDocument();
		expect(onSubmit).not.toHaveBeenCalled();

		fill("form\\.trn$", "100-2345-6780-0003");
		fireEvent.click(screen.getByRole("button", { name: "Create" }));
		await waitFor(() => expect(onSubmit).toHaveBeenCalled());
		expect(onSubmit.mock.calls[0][0]).toMatchObject({
			trn: "100234567800003",
			vat_registered: true,
			billing_address: { emirate: "Dubai", country_code: "AE" },
		});
	});

	it("drops the TRN when the company isn't VAT registered", () => {
		renderForm();
		fireEvent.click(screen.getByRole("checkbox", { name: /vatRegistered/ }));
		expect(
			screen.queryByLabelText("business.form.trn"),
		).not.toBeInTheDocument();
	});
});

const credit = (over: Partial<CreditAccount> = {}): CreditAccount => ({
	status: "approved",
	terms: "net_30",
	requested_limit_fils: 10_000_000,
	credit_limit_fils: 7_500_000,
	outstanding_fils: 3_250_000,
	available_fils: 4_250_000,
	overdue_count: 0,
	overdue_fils: 0,
	applied_at: "2026-10-01T08:00:00Z",
	decided_at: "2026-10-03T08:00:00Z",
	decision_note: null,
	...over,
});

const me = (
	over: Partial<BusinessMe> & {
		verified?: boolean;
		role?: "admin" | "buyer";
	} = {},
): BusinessMe => ({
	account: {
		verification_status: over.verified === false ? "pending" : "verified",
	} as BusinessMe["account"],
	membership: { id: "m1", role: over.role ?? "admin", status: "active" },
	credit: over.credit ?? null,
	invites: [],
});

describe("NetTermsPanel", () => {
	it("shows the credit meter for approved terms", () => {
		render(<NetTermsPanel data={me({ credit: credit() })} />);
		const meter = screen.getByRole("meter");
		expect(meter).toHaveAttribute("aria-valuenow", "32500");
		expect(meter).toHaveAttribute("aria-valuemax", "75000");
		expect(screen.getByText("43%")).toBeInTheDocument();
	});

	it("flags overdue invoices", () => {
		render(
			<NetTermsPanel
				data={me({
					credit: credit({ overdue_count: 1, overdue_fils: 1_150_000 }),
				})}
			/>,
		);
		expect(screen.getByRole("status")).toHaveTextContent(
			"business.terms.overdueBody",
		);
		expect(screen.getByRole("link", { name: /viewOverdue/ })).toHaveAttribute(
			"href",
			"/en/account/business/invoices?status=overdue",
		);
	});

	it("only lets admins of verified businesses apply", () => {
		const { rerender } = render(
			<NetTermsPanel data={me({ verified: false })} />,
		);
		expect(
			screen.getByText("business.terms.needsVerified"),
		).toBeInTheDocument();
		rerender(<NetTermsPanel data={me({ role: "buyer" })} />);
		expect(screen.getByText("business.terms.adminOnly")).toBeInTheDocument();
		rerender(<NetTermsPanel data={me()} />);
		expect(
			screen.getByRole("button", { name: "business.terms.apply" }),
		).toBeInTheDocument();
	});
});
