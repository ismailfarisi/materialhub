import { test, expect } from "@playwright/test";

/**
 * Listing redesign visual smoke E2E.
 *
 * Requires a live stack:
 *   - docker compose up
 *   - apps/web dev server on http://localhost:3000
 *   - At least one published category with seeded products + a few approved reels
 *
 * Run locally with:
 *   LISTING_E2E_STACK_UP=1 LISTING_CATEGORY_SLUG=skincare bun run test:e2e listing-redesign
 */
test.describe("Listing redesign", () => {
  test.skip(
    !process.env.LISTING_E2E_STACK_UP,
    "Requires LISTING_E2E_STACK_UP=1 and a running dev stack",
  );

  const slug = process.env.LISTING_CATEGORY_SLUG ?? "skincare";

  test("mobile: floating pill + sheet open with active filters", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/en/c/${slug}`);

    const pill = page.getByRole("button", { name: /filter & sort/i });
    await expect(pill).toBeVisible();

    await pill.click();
    await page.getByRole("dialog").waitFor();

    const firstBrand = page.locator("input[type='checkbox']").first();
    await firstBrand.check();
    await page.getByRole("button", { name: /show.*results/i }).click();

    await expect(page.getByTestId("active-filter-pills")).toBeVisible();
    await page.screenshot({ path: "test-results/listing-mobile-active.png", fullPage: true });
  });

  test("desktop: sticky sidebar + active pills", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/en/c/${slug}?brand=ouai&inStock=true`);

    await expect(page.getByRole("complementary", { name: /filters/i })).toBeVisible();
    await expect(page.getByTestId("active-filter-pills")).toBeVisible();
    await page.screenshot({ path: "test-results/listing-desktop-active.png", fullPage: true });
  });

  test("RTL Arabic mobile snapshot", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/ar/c/${slug}`);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await page.screenshot({ path: "test-results/listing-mobile-rtl.png", fullPage: true });
  });
});
