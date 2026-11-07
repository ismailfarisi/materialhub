import { describe, expect, it, mock } from "bun:test";
import { Job, type Queue } from "bullmq";
import { enqueueMembershipRefresh, membershipRefreshJobId } from "./collection-membership.job.ts";

const COLLECTION_ID = "8b2f6d1a-4c3e-4f7a-9b0d-1e2c3a4b5c6d";

describe("collection membership refresh jobId", () => {
  it("never contains ':' (BullMQ rejects custom ids with ':')", () => {
    expect(membershipRefreshJobId(COLLECTION_ID)).not.toContain(":");
  });

  it("is stable per collection so repeat enqueues dedupe", () => {
    expect(membershipRefreshJobId(COLLECTION_ID)).toBe(membershipRefreshJobId(COLLECTION_ID));
    expect(membershipRefreshJobId(COLLECTION_ID)).not.toBe(
      membershipRefreshJobId("0f9e8d7c-6b5a-4f3e-8d2c-1b0a9f8e7d6c"),
    );
  });

  it("passes BullMQ's own job-option validation", () => {
    // Job#validateOptions is the "Custom Id cannot contain :" check Queue.add
    // runs before talking to Redis; run it against bare job options.
    const validate = (Job.prototype as unknown as { validateOptions(d: unknown): void })
      .validateOptions;
    const build = (jobId: string) =>
      validate.call({ name: "refresh", opts: { jobId } }, { data: "{}" });
    expect(() => build(membershipRefreshJobId(COLLECTION_ID))).not.toThrow();
    expect(() => build(`refresh:${COLLECTION_ID}`)).toThrow("Custom Id cannot contain :");
  });

  it("enqueues a 'refresh' job keyed by the collection", async () => {
    const add = mock(async () => ({}));
    await enqueueMembershipRefresh({ add } as unknown as Queue, COLLECTION_ID);
    expect(add).toHaveBeenCalledWith(
      "refresh",
      { collectionId: COLLECTION_ID },
      expect.objectContaining({ jobId: membershipRefreshJobId(COLLECTION_ID) }),
    );
  });
});
