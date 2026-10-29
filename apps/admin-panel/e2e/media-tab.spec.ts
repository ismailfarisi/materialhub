import { expect, test } from "@playwright/test";

const PRODUCT_ID = process.env.E2E_PRODUCT_ID ?? "00000000-0000-0000-0000-000000000000";

test.describe("Admin media tab", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill("input[name=email]", process.env.E2E_ADMIN_EMAIL ?? "");
    await page.fill("input[name=password]", process.env.E2E_ADMIN_PASSWORD ?? "");
    await page.click("button[type=submit]");
    await page.waitForURL(/\/(dashboard|catalog|$)/);
  });

  test("admin can drag-reorder product images", async ({ page }) => {
    await page.goto(`/catalog/products/${PRODUCT_ID}`);
    await page.getByRole("tab", { name: /media/i }).click();

    const tiles = page.locator('[role="button"][aria-label^="Image "]');
    await expect(tiles.first()).toBeVisible({ timeout: 10_000 });
    const count = await tiles.count();
    expect(count).toBeGreaterThanOrEqual(2);

    const firstId = await tiles.nth(0).getAttribute("aria-label");
    const last = tiles.nth(count - 1);
    const lastBox = await last.boundingBox();
    if (!lastBox) throw new Error("no bounding box");
    await tiles.nth(0).hover();
    await page.mouse.down();
    await page.mouse.move(lastBox.x + lastBox.width / 2, lastBox.y + lastBox.height / 2, {
      steps: 10,
    });
    await page.mouse.up();

    await page.reload();
    await page.getByRole("tab", { name: /media/i }).click();
    const tilesAfter = page.locator('[role="button"][aria-label^="Image "]');
    const firstIdAfter = await tilesAfter.nth(0).getAttribute("aria-label");
    expect(firstIdAfter).not.toBe(firstId);
  });

  test("admin can bulk-delete selected images", async ({ page }) => {
    await page.goto(`/catalog/products/${PRODUCT_ID}`);
    await page.getByRole("tab", { name: /media/i }).click();

    const tiles = page.locator('[role="button"][aria-label^="Image "]');
    const initialCount = await tiles.count();
    if (initialCount < 2) test.skip(true, "need ≥2 tiles to test bulk delete");

    await tiles.nth(0).click({ modifiers: ["Control"] });
    await tiles.nth(1).click({ modifiers: ["Control"] });

    page.on("dialog", (d) => d.accept());
    await page.getByRole("button", { name: /delete 2/i }).click();

    await expect(tiles).toHaveCount(initialCount - 2, { timeout: 10_000 });
  });
});
