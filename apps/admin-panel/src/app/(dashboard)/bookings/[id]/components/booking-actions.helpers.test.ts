import { describe, expect, it } from "vitest";
import { availableActions } from "./booking-actions.helpers";

describe("availableActions", () => {
  it("offers all three actions on a confirmed booking", () => {
    expect(availableActions("confirmed")).toEqual(["complete", "cancel", "no_show"]);
  });

  it("offers nothing while awaiting payment (reaper expires it, no admin cancel edge)", () => {
    expect(availableActions("pending_payment")).toEqual([]);
  });

  it("offers nothing on a rescheduled booking (only outgoing edge is back to confirmed)", () => {
    expect(availableActions("rescheduled")).toEqual([]);
  });

  it("offers nothing on a completed booking", () => {
    expect(availableActions("completed")).toEqual([]);
  });

  it("offers nothing on a cancelled booking", () => {
    expect(availableActions("cancelled")).toEqual([]);
  });

  it("offers nothing on a no-show booking", () => {
    expect(availableActions("no_show")).toEqual([]);
  });

  it("offers nothing on an expired booking", () => {
    expect(availableActions("expired")).toEqual([]);
  });

  it("offers nothing for an unknown status", () => {
    expect(availableActions("something_new")).toEqual([]);
  });
});
