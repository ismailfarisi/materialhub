import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TabList } from "../tab-list";
import type { HeaderNavTab } from "../types";

const tabs: HeaderNavTab[] = [
	{
		id: "t1",
		kind: "category",
		category_id: "cat-1",
		href_override: null,
		label: { en: "Makeup" },
		show_subcategories: true,
		enabled: true,
		position: 0,
		brand_list: {
			title: { en: "Brands" },
			see_all_href: "/brands",
			brand_ids: [],
		},
		promo_tiles: [],
	},
	{
		id: "t2",
		kind: "custom",
		category_id: null,
		href_override: "/offers",
		label: { en: "Offers" },
		show_subcategories: false,
		enabled: false,
		position: 1,
		brand_list: {
			title: { en: "Brands" },
			see_all_href: "/brands",
			brand_ids: [],
		},
		promo_tiles: [],
	},
];

describe("TabList", () => {
	it("renders one row per tab with EN labels", () => {
		render(
			<TabList
				tabs={tabs}
				selectedId={null}
				onSelect={() => {}}
				onToggleEnabled={() => {}}
				onReorder={() => {}}
			/>,
		);
		expect(screen.getByText("Makeup")).toBeInTheDocument();
		expect(screen.getByText("Offers")).toBeInTheDocument();
	});

	it("calls onSelect when a row is clicked", () => {
		const onSelect = vi.fn();
		render(
			<TabList
				tabs={tabs}
				selectedId={null}
				onSelect={onSelect}
				onToggleEnabled={() => {}}
				onReorder={() => {}}
			/>,
		);
		fireEvent.click(screen.getByText("Offers"));
		expect(onSelect).toHaveBeenCalledWith("t2");
	});
});
