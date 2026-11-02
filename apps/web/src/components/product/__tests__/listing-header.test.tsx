import { STOCKS } from "@/components/swatch";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ListingHeader } from "../listing-header";

vi.mock("next-intl", () => ({
	useLocale: () => "en",
	useTranslations: () => (key: string) => key,
}));
vi.mock("next/link", () => ({
	// biome-ignore lint/suspicious/noExplicitAny: test stub for next/link
	default: ({ href, children, ...props }: any) => (
		<a href={href} {...props}>
			{children}
		</a>
	),
}));

describe("ListingHeader", () => {
	it("renders a plain header without a stock", () => {
		const { container } = render(
			<ListingHeader breadcrumbItems={[{ name: "Search" }]} title="kraft paper" />,
		);
		expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("kraft paper");
		expect(container.querySelector("[data-stock]")).toBeNull();
	});

	it("renders the category band in the category's stock colour", () => {
		const { container } = render(
			<ListingHeader
				breadcrumbItems={[{ name: "Papers & Boards" }]}
				title="Papers & Boards"
				stock={STOCKS.paper}
			/>,
		);
		const band = container.querySelector("[data-stock]") as HTMLElement;
		expect(band.dataset.stock).toBe("paper");
		expect(band.style.getPropertyValue("--stock")).toBe(STOCKS.paper.color);
		expect(screen.getByRole("heading", { level: 1 })).toHaveClass("font-display", "font-expanded");
	});

	it("renders subcategory chips at rounded-sm, marking the active one", () => {
		render(
			<ListingHeader
				breadcrumbItems={[{ name: "Papers & Boards" }]}
				title="Papers & Boards"
				stock={STOCKS.paper}
				pillsLabel="Subcategories"
				pills={[
					{ name: "Art Papers", href: "/en/c/art-papers", active: true },
					{ name: "Kraft Papers", href: "/en/c/kraft-papers" },
				]}
			/>,
		);
		const active = screen.getByRole("link", { name: "Art Papers" });
		expect(active).toHaveAttribute("aria-current", "page");
		expect(active).toHaveClass("rounded-sm", "bg-white");
		expect(screen.getByRole("link", { name: "Kraft Papers" })).not.toHaveAttribute("aria-current");
		expect(screen.getByRole("navigation", { name: "Subcategories" })).toBeInTheDocument();
	});

	it("omits the chip row when there are no subcategories", () => {
		render(
			<ListingHeader
				breadcrumbItems={[{ name: "Hinges" }]}
				title="Hinges"
				stock={STOCKS.hardware}
				pillsLabel="Subcategories"
			/>,
		);
		expect(screen.queryByRole("navigation", { name: "Subcategories" })).not.toBeInTheDocument();
	});

	it("renders live facts in mono", () => {
		render(
			<ListingHeader
				breadcrumbItems={[{ name: "Papers & Boards" }]}
				title="Papers & Boards"
				stock={STOCKS.paper}
				facts={[
					{ label: "Products", value: "128" },
					{ label: "From", value: "AED 4.80" },
				]}
			/>,
		);
		expect(screen.getByText("AED 4.80")).toHaveClass("font-mono");
		expect(screen.getByText("Products")).toHaveClass("mill-label");
	});

	it("renders the intro when provided", () => {
		render(
			<ListingHeader
				breadcrumbItems={[{ name: "Papers & Boards" }]}
				title="Papers & Boards"
				intro="Art, kraft and speciality papers by the sheet and ream."
			/>,
		);
		expect(
			screen.getByText("Art, kraft and speciality papers by the sheet and ream."),
		).toBeInTheDocument();
	});
});
