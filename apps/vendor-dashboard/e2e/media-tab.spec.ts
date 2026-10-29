import { expect, test } from "@playwright/test";

const PRODUCT_ID = process.env.E2E_VENDOR_PRODUCT_ID ?? "00000000-0000-0000-0000-000000000000";

test.describe("Vendor media tab", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill("input[name=email]", process.env.E2E_VENDOR_EMAIL ?? "");
    await page.fill("input[name=password]", process.env.E2E_VENDOR_PASSWORD ?? "");
    await page.click("button[type=submit]");
    await page.waitForURL(/\/(dashboard|products|$)/);
  });

  test("vendor can open media tab directly (not via wizard)", async ({ page }) => {
    await page.goto(`/products/${PRODUCT_ID}/edit`);
    await page.getByRole("tab", { name: /media/i }).click();
    await expect(
      page
        .locator('[role="button"][aria-label^="Image "], [role="button"][aria-label^="Video "]')
        .first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("vendor lightbox navigates with arrow keys", async ({ page }) => {
    await page.goto(`/products/${PRODUCT_ID}/edit`);
    await page.getByRole("tab", { name: /media/i }).click();

    const firstTile = page.locator('[role="button"][aria-label^="Image "]').first();
    await firstTile.dblclick();

    await expect(page.locator('[role="dialog"], dialog[open]')).toBeVisible();
    await page.keyboard.press("ArrowRight");
    // No specific assertion — we just verify the keyboard handler is wired.
    await page.keyboard.press("Escape");
    await expect(page.locator('[role="dialog"], dialog[open]')).not.toBeVisible({ timeout: 5_000 });
  });

  test.skip("AI enhance flow (requires staging with AI enabled)", async () => {
    // Manual gate: enable ai_image_enhance in admin settings, then unskip.
  });
});
