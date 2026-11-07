import { describe, expect, test } from "bun:test";
import { getBreadcrumbs } from "./breadcrumbs";

describe("getBreadcrumbs", () => {
	test("no link to pages that don't exist", () => {
		expect(getBreadcrumbs("/products/3f2b1c9e-1111-4222-8333-444455556666/edit")).toEqual([
			{ label: "Dashboard", href: "/" },
			{ label: "Products", href: "/products" },
			{ label: "Details", href: undefined },
			{ label: "Edit", href: undefined },
		]);
		expect(getBreadcrumbs("/bulk/catalog")[1]).toEqual({ label: "Bulk", href: undefined });
		expect(getBreadcrumbs("/cms/storefront")[1]).toEqual({ label: "Storefront", href: undefined });
		expect(getBreadcrumbs("/products/groups/new")[2]).toEqual({
			label: "Colour families",
			href: undefined,
		});
	});

	test("links pages that exist", () => {
		expect(getBreadcrumbs("/integrations/abc-1/activity")[2]).toEqual({
			label: "Abc 1",
			href: "/integrations/abc-1",
		});
		expect(getBreadcrumbs("/settings/shipping-integrations/new")[2]).toEqual({
			label: "Shipping integrations",
			href: "/settings/shipping-integrations",
		});
	});

	test("root", () => {
		expect(getBreadcrumbs("/")).toEqual([{ label: "Dashboard" }]);
	});
});
