import { test, expect } from "@playwright/test";

/**
 * M1 admin moderation queue E2E skeleton.
 *
 * Requires a live stack + at least one reel in `pending_review` status
 * (create via the web upload flow first, then come here).
 *
 * Run locally with: `bun run test:e2e moderation-queue`
 */

test.describe("Reels moderation queue", () => {
  test.skip(
    !process.env.REELS_E2E_STACK_UP,
    "Requires REELS_E2E_STACK_UP=1 and a running dev stack",
  );

  test("approves a pending reel and removes it from the queue", async ({ page }) => {
    // TODO(M1): replace with real admin login fixture.
    await page.goto("/auth/login");

    await page.goto("/reels");
    const initialRows = await page.locator("table tbody tr").count();
    test.skip(initialRows === 0, "No reels pending review");

    const firstReviewBtn = page.getByRole("button", { name: /review/i }).first();
    await firstReviewBtn.click();

    const approveBtn = page.getByRole("button", { name: /approve/i });
    await expect(approveBtn).toBeVisible();
    await approveBtn.click();

    // Queue should have one fewer row after approval.
    await expect(async () => {
      const rows = await page.locator("table tbody tr").count();
      expect(rows).toBeLessThan(initialRows);
    }).toPass({ timeout: 10_000 });
  });

  test("rejects a pending reel with a reason", async ({ page }) => {
    test.skip(
      !process.env.REELS_E2E_STACK_UP,
      "Requires REELS_E2E_STACK_UP=1 and a running dev stack",
    );
    await page.goto("/reels");
    const rows = await page.locator("table tbody tr").count();
    test.skip(rows === 0, "No reels pending review");

    await page.getByRole("button", { name: /review/i }).first().click();
    await page.locator("textarea").first().fill("off_topic");
    await page.getByRole("button", { name: /reject/i }).click();
    // Modal closes on success.
    await expect(page.locator("text=Review Reel")).not.toBeVisible();
  });
});
