import { expect, test } from "@playwright/test";

/**
 * Payouts list page E2E skeleton.
 *
 * Requires a live stack (Next.js dev server at http://localhost:4002) and a
 * logged-in admin session.  Gate with:
 *
 *   PAYOUTS_E2E_STACK_UP=1 bun run test:e2e payouts/list
 *
 * The tests do NOT depend on any seeded payout data — they only assert static
 * UI landmarks (heading, filter bar) that render regardless of the data set.
 */

test.describe("Payouts list page", () => {
	test.skip(
		!process.env.PAYOUTS_E2E_STACK_UP,
		"Requires PAYOUTS_E2E_STACK_UP=1 and a running dev stack",
	);

	test("shows the Payouts heading", async ({ page }) => {
		// TODO: replace with a real admin login fixture once one exists.
		// For now we navigate directly — assumes the dev stack skips auth in e2e mode
		// or that a session cookie is injected via storageState.
		await page.goto("/auth/login");
		// Placeholder: if a no-auth dev flag is available, navigate straight to /payouts.
		await page.goto("/payouts");

		await expect(page.getByRole("heading", { name: /payouts/i })).toBeVisible();
	});

	test("renders the status filter dropdown", async ({ page }) => {
		await page.goto("/payouts");

		// FiltersBar renders a <select> or combobox labelled "Status".
		// We look for a visible element containing the word "Status".
		const statusFilter = page.getByText(/status/i).first();
		await expect(statusFilter).toBeVisible();
	});

	test("renders the Generate Payout button", async ({ page }) => {
		await page.goto("/payouts");

		await expect(
			page.getByRole("button", { name: /generate payout/i }),
		).toBeVisible();
	});

	test("shows an empty state or data table when no filters are applied", async ({
		page,
	}) => {
		await page.goto("/payouts");

		// Either the DataTable or the EmptyState ("No payouts found") must be present.
		const tableOrEmpty = page
			.locator('table, [data-testid="empty-state"], text=No payouts found')
			.first();
		await expect(tableOrEmpty).toBeVisible({ timeout: 15_000 });
	});

	test("summary stat cards render", async ({ page }) => {
		await page.goto("/payouts");

		// The four StatCards have fixed titles regardless of data.
		await expect(page.getByText(/total pending/i)).toBeVisible({
			timeout: 15_000,
		});
		await expect(page.getByText(/paid this month/i)).toBeVisible();
	});
});
