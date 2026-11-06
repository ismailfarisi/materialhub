import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EcoCardBadge } from "../eco-card-badge";
import { EcoCollectionIntro } from "../eco-collection-intro";
import { EcoComplianceBlock } from "../eco-compliance-block";
import { PlasticBanFilter } from "../plastic-ban-filter";

vi.mock("next-intl", () => ({
	useLocale: () => "en",
	useTranslations: () => (key: string, values?: Record<string, unknown>) =>
		values ? `${key}:${JSON.stringify(values)}` : key,
}));

const ecoProduct = (status?: string, extra: object[] = []) => ({
	ecoDeclaration: status ? { status, has_certificate: false } : null,
	attributeValues: [
		{ attribute: { slug: "recyclable" }, attributeValue: { slug: "yes", value: "Yes" } },
		{ attribute: { slug: "material-composition" }, attributeValue: { slug: "custom", value: "Sugarcane" } },
		...extra,
	],
});

describe("EcoCardBadge", () => {
	it("renders only for plastic-ban ready listings", () => {
		const { rerender, container } = render(<EcoCardBadge product={{ plastic_ban_ready: false }} />);
		expect(container).toBeEmptyDOMElement();
		rerender(<EcoCardBadge product={{ plastic_ban_ready: true }} />);
		expect(screen.getByText("badge")).toBeInTheDocument();
		expect(screen.getByTitle("badgeTitle")).toBeInTheDocument();
	});
});

describe("EcoComplianceBlock", () => {
	it("prints the compliance rows and the approved declaration", () => {
		render(<EcoComplianceBlock product={ecoProduct("approved")} />);
		expect(screen.getByRole("heading", { name: "complianceTitle" })).toBeInTheDocument();
		expect(screen.getByText("attributes.recyclable")).toBeInTheDocument();
		expect(screen.getByText("values.recyclable.yes")).toBeInTheDocument();
		// Unknown vendor values fall back to the API label.
		expect(screen.getByText("Sugarcane")).toBeInTheDocument();
		expect(screen.getByText("declarationApproved")).toBeInTheDocument();
		expect(screen.getByText("noteApproved")).toBeInTheDocument();
		expect(screen.getByText("badge")).toBeInTheDocument();
	});

	it("never shows the badge for a declaration that is not approved", () => {
		render(<EcoComplianceBlock product={ecoProduct("pending")} />);
		expect(screen.queryByText("badge")).not.toBeInTheDocument();
		expect(screen.getByText("declarationNone")).toBeInTheDocument();
		expect(screen.getByText("noteNotDeclared")).toBeInTheDocument();
	});

	it("warns when a bag is thinner than the 50 micron threshold", () => {
		render(
			<EcoComplianceBlock
				product={ecoProduct(undefined, [{ attribute: { slug: "bag-thickness-microns" }, text_value: "40" }])}
			/>,
		);
		expect(screen.getByText('micronsValue:{"value":"40"}')).toBeInTheDocument();
		expect(screen.getByText('thinBagNote:{"microns":50}')).toBeInTheDocument();
	});

	it("renders nothing without compliance data", () => {
		const { container } = render(<EcoComplianceBlock product={{ attributeValues: [] }} />);
		expect(container).toBeEmptyDOMElement();
	});
});

describe("PlasticBanFilter", () => {
	it("is hidden with no matching results and not active", () => {
		const { container } = render(<PlasticBanFilter count={0} draft={{}} setDraft={() => {}} />);
		expect(container).toBeEmptyDOMElement();
	});

	it("toggles the plastic_ban_ready param", () => {
		const setDraft = vi.fn();
		const { rerender } = render(<PlasticBanFilter count={4} draft={{ q: "cup" }} setDraft={setDraft} />);
		fireEvent.click(screen.getByRole("checkbox", { name: "filterLabel" }));
		expect(setDraft).toHaveBeenCalledWith({ q: "cup", plastic_ban_ready: "true" });
		rerender(<PlasticBanFilter count={0} draft={{ plastic_ban_ready: "true" }} setDraft={setDraft} />);
		fireEvent.click(screen.getByRole("checkbox", { name: "filterLabel" }));
		expect(setDraft).toHaveBeenLastCalledWith({});
	});
});

describe("EcoCollectionIntro", () => {
	it("renders only on the plastic-ban ready collection", () => {
		const { container, rerender } = render(<EcoCollectionIntro slug="new-arrivals" />);
		expect(container).toBeEmptyDOMElement();
		rerender(<EcoCollectionIntro slug="plastic-ban-ready-packaging" />);
		expect(screen.getByRole("heading", { name: "landingTitle" })).toBeInTheDocument();
		expect(screen.getAllByRole("listitem")).toHaveLength(8);
	});
});
