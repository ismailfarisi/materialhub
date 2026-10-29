import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted before module-under-test imports — mock `next/navigation` so we
// can mutate the returned pathname between renders, and mock the channel
// events hook so we can spy on `fire`.
let mockPathname = "/en";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

const fireMock = vi.fn();
vi.mock("@/lib/channels/use-channel-events", () => ({
  useChannelEvents: () => ({ fire: fireMock }),
}));

import { PageViewFire } from "./page-view-fire";

describe("<PageViewFire />", () => {
  beforeEach(() => {
    fireMock.mockReset();
    mockPathname = "/en";
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("fires PageView on mount", () => {
    render(<PageViewFire />);
    expect(fireMock).toHaveBeenCalledTimes(1);
    expect(fireMock).toHaveBeenCalledWith("PageView");
  });

  it("fires PageView again when pathname changes", () => {
    const { rerender } = render(<PageViewFire />);
    expect(fireMock).toHaveBeenCalledTimes(1);

    mockPathname = "/en/product/some-slug";
    rerender(<PageViewFire />);
    expect(fireMock).toHaveBeenCalledTimes(2);
    expect(fireMock).toHaveBeenLastCalledWith("PageView");
  });

  it("does not re-fire on re-render when pathname is unchanged", () => {
    const { rerender } = render(<PageViewFire />);
    expect(fireMock).toHaveBeenCalledTimes(1);
    rerender(<PageViewFire />);
    rerender(<PageViewFire />);
    expect(fireMock).toHaveBeenCalledTimes(1);
  });

  it("renders nothing", () => {
    const { container } = render(<PageViewFire />);
    expect(container.firstChild).toBeNull();
  });
});
