import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { BackgroundVideo } from "./background-video";

/**
 * jsdom implements neither the media pipeline nor matchMedia, so both are
 * stubbed. The stub is the point of most of these tests: loading is gated in
 * JS, and the only way to prove a mobile or reduced-motion visitor downloads
 * nothing is to drive the media queries directly.
 */
function stubMatchMedia({
  desktop,
  reducedMotion,
}: {
  desktop: boolean;
  reducedMotion: boolean;
}) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("prefers-reduced-motion") ? reducedMotion : desktop,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

const DESKTOP = { desktop: true, reducedMotion: false };
const MOBILE = { desktop: false, reducedMotion: false };
const REDUCED_MOTION = { desktop: true, reducedMotion: true };

let play: ReturnType<typeof vi.spyOn>;
let pause: ReturnType<typeof vi.spyOn>;
let load: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  load = vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
});

afterEach(() => {
  play.mockRestore();
  pause.mockRestore();
  load.mockRestore();
  // biome-ignore lint/performance/noDelete: restoring the jsdom default (absent)
  delete (window as { matchMedia?: unknown }).matchMedia;
});

const video = () => screen.getByTestId("background-video") as HTMLVideoElement;

describe("BackgroundVideo", () => {
  test("is muted, looping and inline — never interactive", () => {
    stubMatchMedia(DESKTOP);
    render(<BackgroundVideo src="https://cdn/v.mp4" poster="https://cdn/p.jpg" />);
    expect(video().muted).toBe(true);
    expect(video().loop).toBe(true);
    expect(video()).toHaveAttribute("playsinline");
    expect(video()).not.toHaveAttribute("controls");
  });

  test("uses the banner image as its poster so failure looks like today", () => {
    stubMatchMedia(DESKTOP);
    render(<BackgroundVideo src="https://cdn/v.mp4" poster="https://cdn/p.jpg" />);
    expect(video()).toHaveAttribute("poster", "https://cdn/p.jpg");
  });

  test("is hidden below md and under reduced motion in CSS too", () => {
    stubMatchMedia(DESKTOP);
    render(<BackgroundVideo src="https://cdn/v.mp4" poster="https://cdn/p.jpg" />);
    const cls = video().className;
    expect(cls).toContain("hidden");
    expect(cls).toContain("md:block");
    expect(cls).toContain("md:motion-reduce:hidden");
  });

  test("never carries the autoplay attribute — autoplay would override preload=none", () => {
    stubMatchMedia(DESKTOP);
    render(<BackgroundVideo src="https://cdn/v.mp4" poster="https://cdn/p.jpg" />);
    expect(video()).not.toHaveAttribute("autoplay");
    expect(video().autoplay).toBe(false);
    expect(video()).toHaveAttribute("preload", "none");
  });
});

describe("BackgroundVideo loading gate", () => {
  test("assigns src and plays on a desktop viewport without reduced motion", () => {
    stubMatchMedia(DESKTOP);
    render(<BackgroundVideo src="https://cdn/v.mp4" poster="https://cdn/p.jpg" />);
    expect(video()).toHaveAttribute("src", "https://cdn/v.mp4");
    expect(play).toHaveBeenCalled();
  });

  test("downloads nothing below the md breakpoint", () => {
    stubMatchMedia(MOBILE);
    render(<BackgroundVideo src="https://cdn/v.mp4" poster="https://cdn/p.jpg" />);
    expect(video()).not.toHaveAttribute("src");
    expect(play).not.toHaveBeenCalled();
  });

  test("downloads nothing under prefers-reduced-motion", () => {
    stubMatchMedia(REDUCED_MOTION);
    render(<BackgroundVideo src="https://cdn/v.mp4" poster="https://cdn/p.jpg" />);
    expect(video()).not.toHaveAttribute("src");
    expect(play).not.toHaveBeenCalled();
  });

  test("downloads nothing when matchMedia is unavailable", () => {
    // biome-ignore lint/performance/noDelete: emulate an environment without matchMedia
    delete (window as { matchMedia?: unknown }).matchMedia;
    render(<BackgroundVideo src="https://cdn/v.mp4" poster="https://cdn/p.jpg" />);
    expect(video()).not.toHaveAttribute("src");
    expect(play).not.toHaveBeenCalled();
  });

  test("stays unloaded while inactive, even on desktop", () => {
    stubMatchMedia(DESKTOP);
    render(<BackgroundVideo src="https://cdn/v.mp4" poster="https://cdn/p.jpg" active={false} />);
    expect(video()).not.toHaveAttribute("src");
    expect(play).not.toHaveBeenCalled();
  });

  test("unloads and pauses when it stops being active", () => {
    stubMatchMedia(DESKTOP);
    const { rerender } = render(
      <BackgroundVideo src="https://cdn/v.mp4" poster="https://cdn/p.jpg" active />,
    );
    expect(video()).toHaveAttribute("src", "https://cdn/v.mp4");

    rerender(
      <BackgroundVideo src="https://cdn/v.mp4" poster="https://cdn/p.jpg" active={false} />,
    );
    expect(video()).not.toHaveAttribute("src");
    expect(pause).toHaveBeenCalled();
    // The poster survives the unload, so the slide never goes blank.
    expect(video()).toHaveAttribute("poster", "https://cdn/p.jpg");
  });

  test("reloads and replays when it becomes active again", () => {
    stubMatchMedia(DESKTOP);
    const { rerender } = render(
      <BackgroundVideo src="https://cdn/v.mp4" poster="https://cdn/p.jpg" active={false} />,
    );
    expect(play).not.toHaveBeenCalled();

    rerender(<BackgroundVideo src="https://cdn/v.mp4" poster="https://cdn/p.jpg" active />);
    expect(video()).toHaveAttribute("src", "https://cdn/v.mp4");
    expect(play).toHaveBeenCalled();
  });
});
