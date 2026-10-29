/**
 * Pins the only wiring between what the CMS editor writes into a layout block
 * and what the storefront renders: `block.data.video.url`.
 *
 * That path is two unguarded property reads off an `any`-typed block —
 * `layout-renderer.tsx` line ~154 (hero) and ~758 (promotional banner). There
 * is no schema and nothing else references either line, so deleting one would
 * silently kill the feature while every other test stayed green. These tests
 * render the real adapters over a realistic block fixture and assert a real
 * <video> comes out with the right src.
 */
import { render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { HeroBannerAdapter, PromotionalBannerAdapter } from "../layout-renderer";

vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
  getTranslations: async () => (key: string) => key,
}));

vi.mock("next-intl", () => ({ useLocale: () => "en" }));

vi.mock("next/image", () => ({
  default: ({
    alt = "",
    fill: _fill,
    priority: _priority,
    sizes: _sizes,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & {
    fill?: boolean;
    priority?: boolean;
  }) => (
    // biome-ignore lint/a11y/useAltText: alt is supplied by the component under test.
    <img alt={alt} {...props} />
  ),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("embla-carousel-autoplay", () => ({ default: () => ({}) }));
vi.mock("embla-carousel-react", () => ({ default: () => [vi.fn(), undefined] }));

/** The exact shape VideoField commits, alongside the image block it layers over. */
function blockWithVideo(overrides: Record<string, unknown> = {}) {
  return {
    id: "block-1",
    type: "banner",
    data: {
      image: {
        desktop: { url: "https://cdn/desktop.jpg" },
        mobile: { url: "https://cdn/mobile.jpg" },
        focal_point: { x: 0.5, y: 0.4 },
        alt: { en: "Alt" },
      },
      video: {
        id: "vid-1",
        url: "https://cdn/clip.mp4",
        poster_url: "https://cdn/poster.jpg",
        duration_seconds: 12,
      },
      title: { en: "Winter Edit" },
      cta_text: { en: "Shop now" },
      cta_link: "/en/collections/winter",
      ...overrides,
    },
  };
}

function blockWithoutVideo() {
  const block = blockWithVideo();
  const data = { ...block.data } as Record<string, unknown>;
  delete data.video;
  return { ...block, data };
}

let play: ReturnType<typeof vi.spyOn>;
let pause: ReturnType<typeof vi.spyOn>;
let load: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  load = vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  window.matchMedia = ((query: string) => ({
    matches: !query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  play.mockRestore();
  pause.mockRestore();
  load.mockRestore();
  // biome-ignore lint/performance/noDelete: restoring the jsdom default (absent)
  delete (window as { matchMedia?: unknown }).matchMedia;
});

describe("promotional_banner block → storefront video", () => {
  test("data.video.url reaches a rendered background video", async () => {
    render(await PromotionalBannerAdapter({ settings: {}, data: { blocks: [blockWithVideo()] } }));

    const video = screen.getByTestId("background-video") as HTMLVideoElement;
    expect(video).toHaveAttribute("src", "https://cdn/clip.mp4");
    // The banner image, not the transcode's blind t=1s grab, is the poster.
    expect(video).toHaveAttribute("poster", "https://cdn/desktop.jpg");
  });

  test("a block with no video renders no video element", async () => {
    render(
      await PromotionalBannerAdapter({ settings: {}, data: { blocks: [blockWithoutVideo()] } }),
    );
    expect(screen.queryByTestId("background-video")).toBeNull();
  });

  test("a video without a desktop image renders nothing — the image is the fallback", async () => {
    const block = blockWithVideo();
    const data = { ...block.data, image: {} };
    render(await PromotionalBannerAdapter({ settings: {}, data: { blocks: [{ ...block, data }] } }));
    expect(screen.queryByTestId("background-video")).toBeNull();
  });
});

describe("hero_carousel block → storefront video", () => {
  test("data.video.url reaches the selected slide's background video", async () => {
    render(
      await HeroBannerAdapter({
        settings: { autoplay: false },
        data: { blocks: [blockWithVideo()] },
      }),
    );

    const video = screen.getByTestId("background-video") as HTMLVideoElement;
    expect(video).toHaveAttribute("src", "https://cdn/clip.mp4");
    expect(video).toHaveAttribute("poster", "https://cdn/desktop.jpg");
  });

  test("only the selected slide's video is loaded when several carry one", async () => {
    const first = blockWithVideo();
    const second = {
      ...blockWithVideo(),
      id: "block-2",
      data: {
        ...blockWithVideo().data,
        video: {
          id: "vid-2",
          url: "https://cdn/clip-2.mp4",
          poster_url: "https://cdn/poster-2.jpg",
          duration_seconds: 8,
        },
      },
    };

    render(
      await HeroBannerAdapter({
        settings: { autoplay: false },
        data: { blocks: [first, second] },
      }),
    );

    const videos = screen.getAllByTestId("background-video");
    expect(videos).toHaveLength(2);
    expect(videos[0]).toHaveAttribute("src", "https://cdn/clip.mp4");
    expect(videos[1]).not.toHaveAttribute("src");
  });

  test("a slide with no video renders no video element", async () => {
    render(
      await HeroBannerAdapter({
        settings: { autoplay: false },
        data: { blocks: [blockWithoutVideo()] },
      }),
    );
    expect(screen.queryByTestId("background-video")).toBeNull();
  });
});
