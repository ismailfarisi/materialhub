import { describe, expect, test } from "bun:test";
import { CancellationChecker } from "../../src/worker-base/cancellation.ts";

describe("CancellationChecker", () => {
  test("honors cancellation", async () => {
    let cancelled = false;
    const checker = new CancellationChecker(async () => cancelled, 0);
    expect(await checker.isCancelled()).toBe(false);
    cancelled = true;
    expect(await checker.isCancelled()).toBe(true);
  });

  test("caches for throttleMs to avoid DB thrash", async () => {
    let calls = 0;
    const checker = new CancellationChecker(async () => {
      calls++;
      return false;
    }, 50);
    await checker.isCancelled();
    await checker.isCancelled();
    await checker.isCancelled();
    expect(calls).toBe(1);
    await new Promise((r) => setTimeout(r, 60));
    await checker.isCancelled();
    expect(calls).toBe(2);
  });
});
