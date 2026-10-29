import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MediaTile } from "./MediaTile";
import type { ImageMediaItem } from "./types";

const baseImg: ImageMediaItem = {
  kind: "image",
  id: "i1",
  url: "https://x/img.webp",
  sort_order: 0,
};

const noOps = {
  select: () => {},
  expand: () => {},
  crop: () => {},
  replace: () => {},
  enhance: () => {},
  delete: () => {},
  saveAlt: () => {},
  revertAi: () => {},
};

describe("MediaTile", () => {
  it("shows Primary badge at sort_order 0", () => {
    render(<MediaTile item={baseImg} selected={false} caps={{}} on={noOps} />);
    expect(screen.getByText("Primary")).toBeTruthy();
  });

  it("hides Primary badge when sort_order > 0", () => {
    render(
      <MediaTile item={{ ...baseImg, sort_order: 2 }} selected={false} caps={{}} on={noOps} />,
    );
    expect(screen.queryByText("Primary")).toBeNull();
  });

  it("renders video duration chip", () => {
    render(
      <MediaTile
        item={{
          kind: "video",
          id: "v1",
          url: "u",
          poster_url: "p",
          duration_seconds: 75,
          sort_order: 1,
          status: "ready",
        }}
        selected={false}
        caps={{}}
        on={noOps}
      />,
    );
    expect(screen.getByText("1:15")).toBeTruthy();
  });
});
