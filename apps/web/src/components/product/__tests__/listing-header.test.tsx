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
	it("renders the title with the amber-period motif", () => {
		render(
			<ListingHeader
				breadcrumbItems={[{ name: "Fragrance" }]}
				title="Fragrance"
			/>,
		);
		const heading = screen.getByRole("heading", { level: 1 });
		expect(heading).toHaveTextContent("Fragrance.");
		expect(heading).toHaveClass("text-[clamp(2.5rem,6vw,5.25rem)]");
	});

	it("renders subcategory pills, marking the active one", () => {
		render(
			<ListingHeader
				breadcrumbItems={[{ name: "Fragrance" }]}
				title="Fragrance"
				pills={[
					{ name: "Oud", href: "/en/c/oud", active: true },
					{ name: "Floral", href: "/en/c/floral" },
				]}
			/>,
		);
		expect(screen.getByRole("link", { name: "Oud" })).toHaveClass(
			"bg-nl-amber",
		);
		expect(screen.getByRole("link", { name: "Floral" })).not.toHaveClass(
			"bg-nl-amber",
		);
		expect(screen.getByText("Browse").nextElementSibling).toHaveClass(
			"scrollbar-nl",
			"grid-rows-2",
			"overflow-x-auto",
		);
	});

	it("omits the pill row when there are no pills", () => {
		render(
			<ListingHeader breadcrumbItems={[{ name: "Search" }]} title="oud" />,
		);
		expect(screen.queryByText("Browse")).not.toBeInTheDocument();
	});

	it("renders the intro when provided", () => {
		render(
			<ListingHeader
				breadcrumbItems={[{ name: "Fragrance" }]}
				title="Fragrance"
				intro="312 results"
			/>,
		);
		expect(screen.getByText("312 results")).toBeInTheDocument();
	});
});
