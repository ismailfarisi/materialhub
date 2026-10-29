import { test, expect } from "@playwright/test";
import path from "node:path";

/**
 * M1 upload flow E2E skeleton.
 *
 * Requires a live stack:
 *   - docker compose up (postgres, redis, all backend services)
 *   - apps/web dev server on http://localhost:3000
 *   - A seeded test customer with a known delivered order
 *
 * Run locally with: `bun run test:e2e upload-flow`
 */

test.describe("Reels upload flow", () => {
  test.skip(
    !process.env.REELS_E2E_STACK_UP,
    "Requires REELS_E2E_STACK_UP=1 and a running dev stack",
  );

  test("uploads a portrait MP4 and shows progress", async ({ page }) => {
    // TODO(M1): replace with real fixture login.
    await page.goto("/auth/login");
    // fill login fixture...

    await page.goto("/reels/upload");
    const fixturePath = path.join(__dirname, "fixtures", "portrait-30s.mp4");
    await page.locator("input[type=file]").setInputFiles(fixturePath);
    await page.getByRole("button", { name: /upload/i }).click();

    // Progress bar eventually reaches 100%
    await expect(page.locator("text=100%")).toBeVisible({ timeout: 60_000 });
  });

  test("rejects landscape video at upload", async ({ page }) => {
    test.skip(
      !process.env.REELS_E2E_STACK_UP,
      "Requires REELS_E2E_STACK_UP=1 and a running dev stack",
    );
    await page.goto("/reels/upload");
    const fixturePath = path.join(__dirname, "fixtures", "landscape-10s.mp4");
    await page.locator("input[type=file]").setInputFiles(fixturePath);
    // The client-side rejects by type; the Cloudflare webhook rejects by aspect.
    // Either path should surface an error to the user.
    await page.getByRole("button", { name: /upload/i }).click();
    await expect(page.locator("text=/aspect|portrait|landscape/i")).toBeVisible({ timeout: 60_000 });
  });
});
