import { describe, expect, it, mock } from "bun:test";
import type { PostDeliveryNudgeService } from "../post-delivery-nudge.service.ts";
import { NUDGE_JOB_NAMES, NudgeEventJobs } from "./send-post-delivery-nudge.job.ts";

function makeJobs(svc: Partial<PostDeliveryNudgeService>): NudgeEventJobs {
  return new NudgeEventJobs("redis://test", svc as PostDeliveryNudgeService);
}

describe("NudgeEventJobs.handle", () => {
  it("dispatches sendPostDeliveryReelNudge to nudgeService.sendIfEligible", async () => {
    const sendIfEligible = mock(async (_args: { orderId: string; userId: string }) => undefined);
    const jobs = makeJobs({ sendIfEligible });
    await jobs.handle({
      name: NUDGE_JOB_NAMES.sendPostDeliveryReelNudge,
      data: { orderId: "o1", userId: "u1" },
    });
    expect(sendIfEligible).toHaveBeenCalledTimes(1);
    expect(sendIfEligible.mock.calls[0]![0]).toEqual({
      orderId: "o1",
      userId: "u1",
    });
  });

  it("no-ops when payload is missing orderId or userId", async () => {
    const sendIfEligible = mock(async () => undefined);
    const jobs = makeJobs({ sendIfEligible });
    await jobs.handle({
      name: NUDGE_JOB_NAMES.sendPostDeliveryReelNudge,
      data: { orderId: "", userId: "u1" },
    });
    await jobs.handle({
      name: NUDGE_JOB_NAMES.sendPostDeliveryReelNudge,
      data: { orderId: "o1", userId: "" },
    });
    expect(sendIfEligible).not.toHaveBeenCalled();
  });

  it("silently ignores unknown job names", async () => {
    const sendIfEligible = mock(async () => undefined);
    const jobs = makeJobs({ sendIfEligible });
    await jobs.handle({
      name: "someFutureJobName",
      data: { orderId: "o1", userId: "u1" },
    });
    expect(sendIfEligible).not.toHaveBeenCalled();
  });
});
