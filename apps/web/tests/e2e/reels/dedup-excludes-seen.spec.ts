import { test, expect } from "@playwright/test";

/**
 * M2 dedup E2E skeleton.
 *
 * Requires live stack (see feed-scroll-and-tap.spec.ts). Depends on the
 * ReelFeed component rendering `data-reel-id` on each section — add this
 * to reel-feed.tsx when enabling this test.
 *
 * Run locally with: REELS_E2E_STACK_UP=1 bun run test:e2e dedup-excludes-seen
 */
test.describe("Reels dedup excludes watched", () => {
  test.skip(
    !process.env.REELS_E2E_STACK_UP,
    "Requires REELS_E2E_STACK_UP=1 and a running dev stack",
  );

  test("watched reels do not resurface after reload", async ({ page }) => {
    await page.goto("/auth/login");
    await page.goto("/en/reels");

    const firstSection = page.locator("section[data-index='0']");
    await expect(firstSection).toBeVisible();
    const firstId = await firstSection.getAttribute("data-reel-id");

    // Trigger view event (wait past 60% of 30s = 18s)
    await page.waitForTimeout(15_000);

    await page.reload();
    const newFirstId = await page
      .locator("section[data-index='0']")
      .getAttribute("data-reel-id");
    expect(newFirstId).not.toBe(firstId);
  });
});
