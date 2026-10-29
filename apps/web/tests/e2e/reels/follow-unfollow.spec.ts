import { test, expect } from "@playwright/test";

/**
 * M2 follow toggle E2E skeleton.
 *
 * Requires live stack. Uses the /users/[userId] page (UUID-based, not handle-based
 * — see M2 Task 11/15 for why).
 *
 * Run locally with: REELS_E2E_STACK_UP=1 bun run test:e2e follow-unfollow
 */
test.describe("Reels follow toggle", () => {
  test.skip(
    !process.env.REELS_E2E_STACK_UP,
    "Requires REELS_E2E_STACK_UP=1 and a running dev stack",
  );

  test("follow toggles label between Follow and Following", async ({ page }) => {
    await page.goto("/auth/login");
    // TODO(M2): seed a known creator UUID into the fixture
    const creatorUuid = process.env.REELS_E2E_CREATOR_UUID ?? "00000000-0000-0000-0000-000000000000";
    await page.goto(`/en/users/${creatorUuid}`);

    const button = page.getByRole("button", { name: /follow/i });
    await expect(button).toBeVisible();

    const initial = await button.textContent();
    await button.click();
    await expect(button).not.toHaveText(initial ?? "");
  });
});
