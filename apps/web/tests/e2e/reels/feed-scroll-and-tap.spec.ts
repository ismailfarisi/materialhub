import { test, expect } from "@playwright/test";

/**
 * M2 feed scroll + tag tap E2E skeleton.
 *
 * Requires a live stack:
 *   - docker compose up (postgres, redis, all backend services)
 *   - apps/web dev server on http://localhost:3000
 *   - Seeded cohort with at least 2 approved reels for the test user's language/country
 *
 * Run locally with: REELS_E2E_STACK_UP=1 bun run test:e2e feed-scroll-and-tap
 */
test.describe("Reels feed scroll + product drawer", () => {
  test.skip(
    !process.env.REELS_E2E_STACK_UP,
    "Requires REELS_E2E_STACK_UP=1 and a running dev stack",
  );

  test("scrolls feed and opens product drawer on tag tap", async ({ page }) => {
    await page.goto("/auth/login");
    // TODO(M2): fill login fixture once auth helper exists.
    await page.goto("/en/reels");

    const first = page.locator("section[data-index='0']");
    await expect(first).toBeVisible();

    // Scroll to next reel via keyboard
    await first.press("PageDown");
    await expect(page.locator("section[data-index='1']")).toBeVisible();

    // Click the first tag chip in the visible reel
    await page.locator("section[data-index='1'] button").first().click();

    // Product drawer should appear
    await expect(page.locator("text=/view product/i")).toBeVisible();
  });
});
