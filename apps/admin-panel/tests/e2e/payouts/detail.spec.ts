import { expect, test } from "@playwright/test";

/**
 * Payout detail page E2E skeleton.
 *
 * Requires:
 *   1. A live stack (PAYOUTS_E2E_STACK_UP=1).
 *   2. At least one payout row in the database — set PAYOUT_E2E_ID to an
 *      existing payout UUID so the detail page can be loaded directly:
 *
 *        PAYOUTS_E2E_STACK_UP=1 PAYOUT_E2E_ID=<uuid> bun run test:e2e payouts/detail
 *
 * Tests that only need the list-to-detail navigation are gated on
 * PAYOUTS_E2E_STACK_UP; tests that need a specific record are additionally
 * gated on PAYOUT_E2E_ID.
 */

const PAYOUT_ID = process.env.PAYOUT_E2E_ID ?? "";

test.describe("Payout detail page", () => {
	test.skip(
		!process.env.PAYOUTS_E2E_STACK_UP,
		"Requires PAYOUTS_E2E_STACK_UP=1 and a running dev stack",
	);

	test("clicking a payout reference in the list navigates to the detail page", async ({
		page,
	}) => {
		await page.goto("/payouts");

		// Wait for the table to load (or skip if the list is empty).
		await page
			.waitForSelector("table tbody tr", { timeout: 15_000 })
			.catch(() => null);
		const rows = await page.locator("table tbody tr").count();
		test.skip(rows === 0, "No payout rows to click — seed test data first");

		// Click the first reference link (font-mono anchor inside the first row).
		const firstRef = page.locator("table tbody tr").first().getByRole("button");
		await firstRef.click();

		// After navigation the breadcrumb "Payouts / <ref>" should be visible.
		await expect(page.getByText("Payouts")).toBeVisible({ timeout: 10_000 });
		// The Commissions tab must be present on the detail page.
		await expect(page.getByRole("tab", { name: /commissions/i })).toBeVisible();
	});

	test("detail page shows Commissions and Timeline tabs", async ({ page }) => {
		test.skip(
			!PAYOUT_ID,
			"Set PAYOUT_E2E_ID=<uuid> to run detail page tests against a real record",
		);

		await page.goto(`/payouts/${PAYOUT_ID}`);

		await expect(page.getByRole("tab", { name: /commissions/i })).toBeVisible({
			timeout: 15_000,
		});
		await expect(page.getByRole("tab", { name: /timeline/i })).toBeVisible();
	});

	test("detail page shows the Add Note button", async ({ page }) => {
		test.skip(
			!PAYOUT_ID,
			"Set PAYOUT_E2E_ID=<uuid> to run detail page tests against a real record",
		);

		await page.goto(`/payouts/${PAYOUT_ID}`);

		await expect(page.getByRole("button", { name: /add note/i })).toBeVisible({
			timeout: 15_000,
		});
	});

	test("Timeline tab renders after switching tabs", async ({ page }) => {
		test.skip(
			!PAYOUT_ID,
			"Set PAYOUT_E2E_ID=<uuid> to run detail page tests against a real record",
		);

		await page.goto(`/payouts/${PAYOUT_ID}`);

		await page.getByRole("tab", { name: /timeline/i }).click();

		// The PayoutTimeline renders a list or an empty message — either is acceptable.
		const timelineContent = page
			.locator('[role="tabpanel"]')
			.filter({ hasText: /timeline|no events|audit/i })
			.first();
		await expect(timelineContent).toBeVisible({ timeout: 10_000 });
	});
});
