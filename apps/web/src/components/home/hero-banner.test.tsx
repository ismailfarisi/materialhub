import { act, fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, test, vi } from "vitest";
import { HeroBanner } from "./hero-banner";

/** jsdom has no matchMedia; BackgroundVideo's loading gate reads it directly. */
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

const localeState = vi.hoisted(() => ({ locale: "ar" }));

vi.mock("next-intl", () => ({
	useLocale: () => localeState.locale,
}));

vi.mock("next/image", () => ({
	default: ({
		alt = "",
		fill: _fill,
		priority: _priority,
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

/** Records the options the component hands the Autoplay plugin. */
const autoplayOptions = vi.hoisted(() => [] as Record<string, unknown>[]);

vi.mock("embla-carousel-autoplay", () => ({
	default: (options: Record<string, unknown>) => {
		autoplayOptions.push(options);
		return {};
	},
}));

/** Most tests want no carousel API at all; the autoplay tests swap in a fake. */
const emblaState = vi.hoisted(() => ({ api: undefined as unknown }));

vi.mock("embla-carousel-react", () => ({
	default: () => [vi.fn(), emblaState.api],
}));

/**
 * Minimal stand-in for the bits of Embla the component touches, with a plugin
 * whose play/stop emit the same events the real Autoplay plugin does.
 */
function createFakeEmbla() {
	const listeners = new Map<string, (() => void)[]>();
	let playing = true;

	function emit(event: string) {
		for (const fn of listeners.get(event) ?? []) fn();
	}

	const plugin = {
		isPlaying: () => playing,
		play: () => {
			playing = true;
			emit("autoplay:play");
		},
		stop: () => {
			playing = false;
			emit("autoplay:stop");
		},
	};

	const api = {
		plugins: () => ({ autoplay: plugin }),
		selectedScrollSnap: () => 0,
		on: (event: string, fn: () => void) => {
			listeners.set(event, [...(listeners.get(event) ?? []), fn]);
			return api;
		},
		off: (event: string, fn: () => void) => {
			listeners.set(
				event,
				(listeners.get(event) ?? []).filter((f) => f !== fn),
			);
			return api;
		},
	};

	return { api, plugin };
}

describe("HeroBanner", () => {
	it("uses mirrored full-bleed positioning for RTL locales", () => {
		localeState.locale = "ar";

		render(
			<HeroBanner
				banners={[
					{
						id: "hero-1",
						title: "Summer",
						image_url: "/hero.jpg",
					},
				]}
			/>,
		);

		expect(screen.getByTestId("hero-carousel-section")).toHaveClass(
			"left-[calc(50%-50vw)]",
			"rtl:left-auto",
			"rtl:right-[calc(50%-50vw)]",
		);
	});
});

describe("HeroBanner autoplay configuration", () => {
	const twoSlides = [
		{ id: "a", title: "A", image_url: "https://cdn/a.jpg" },
		{ id: "b", title: "B", image_url: "https://cdn/b.jpg" },
	];

	beforeEach(() => {
		autoplayOptions.length = 0;
	});

	it("keeps hover and focus pauses temporary so the carousel keeps advancing", () => {
		render(<HeroBanner banners={twoSlides} />);

		// stopOnInteraction must stay false: it is what lets the plugin resume
		// after the pointer leaves. Flipping it to true makes the first hover a
		// permanent stop, which silently kills auto-advance on desktop.
		expect(autoplayOptions[0]).toMatchObject({
			stopOnInteraction: false,
			stopOnMouseEnter: true,
			stopOnFocusIn: true,
		});
	});

	it("forwards the configured interval as the autoplay delay", () => {
		render(<HeroBanner banners={twoSlides} interval={2500} />);

		expect(autoplayOptions[0]).toMatchObject({ delay: 2500 });
	});

	it("registers no autoplay plugin when autoplay is turned off", () => {
		render(<HeroBanner banners={twoSlides} autoplay={false} />);

		expect(autoplayOptions).toHaveLength(0);
	});

	describe("explicit pause versus the plugin's automatic resume", () => {
		beforeEach(() => {
			stubMatchMedia({ desktop: true, reducedMotion: false });
		});

		afterEach(() => {
			emblaState.api = undefined;
		});

		it("keeps the carousel stopped when the plugin resumes after a deliberate pause", () => {
			const { api, plugin } = createFakeEmbla();
			emblaState.api = api;

			render(<HeroBanner banners={twoSlides} />);
			fireEvent.click(
				screen.getByLabelText("Pause automatic slide rotation"),
			);
			expect(plugin.isPlaying()).toBe(false);

			// The pointer leaving the hero makes the real plugin call play() on
			// its own. The visitor's pause has to outrank that.
			act(() => plugin.play());

			expect(plugin.isPlaying()).toBe(false);
		});

		it("lets the carousel resume when the visitor never paused it", () => {
			const { api, plugin } = createFakeEmbla();
			emblaState.api = api;

			render(<HeroBanner banners={twoSlides} />);
			// A hover pause, then the pointer leaves again.
			act(() => plugin.stop());
			act(() => plugin.play());

			expect(plugin.isPlaying()).toBe(true);
		});

		it("resumes on demand after the visitor presses play again", () => {
			const { api, plugin } = createFakeEmbla();
			emblaState.api = api;

			render(<HeroBanner banners={twoSlides} />);
			fireEvent.click(
				screen.getByLabelText("Pause automatic slide rotation"),
			);
			fireEvent.click(
				screen.getByLabelText("Resume automatic slide rotation"),
			);

			expect(plugin.isPlaying()).toBe(true);

			// And the suppression is genuinely cleared, not merely overridden once.
			act(() => plugin.stop());
			act(() => plugin.play());
			expect(plugin.isPlaying()).toBe(true);
		});
	});
});

describe("HeroBanner background video", () => {
	const withVideo = [
		{ id: "a", title: "A", image_url: "https://cdn/a.jpg", video_url: "https://cdn/a.mp4" },
		{ id: "b", title: "B", image_url: "https://cdn/b.jpg", video_url: "https://cdn/b.mp4" },
		{ id: "c", title: "C", image_url: "https://cdn/c.jpg", video_url: "https://cdn/c.mp4" },
	];

	let play: ReturnType<typeof vi.spyOn>;
	let pause: ReturnType<typeof vi.spyOn>;
	let load: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
		pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
		load = vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
		stubMatchMedia({ desktop: true, reducedMotion: false });
	});

	afterEach(() => {
		play.mockRestore();
		pause.mockRestore();
		load.mockRestore();
		// biome-ignore lint/performance/noDelete: restoring the jsdom default (absent)
		delete (window as { matchMedia?: unknown }).matchMedia;
	});

	test("renders one video element per slide that has one", () => {
		render(<HeroBanner banners={withVideo} />);
		expect(screen.getAllByTestId("background-video")).toHaveLength(3);
	});

	test("slides without a video render none", () => {
		render(<HeroBanner banners={[{ id: "a", title: "A", image_url: "https://cdn/a.jpg" }]} />);
		expect(screen.queryByTestId("background-video")).toBeNull();
	});

	test("each video posters to its own slide image", () => {
		render(<HeroBanner banners={withVideo} />);
		const els = screen.getAllByTestId("background-video");
		expect(els[0]).toHaveAttribute("poster", "https://cdn/a.jpg");
		expect(els[1]).toHaveAttribute("poster", "https://cdn/b.jpg");
		expect(els[2]).toHaveAttribute("poster", "https://cdn/c.jpg");
	});

	// Embla mounts every slide at once. The whole point of gating on
	// `i === selectedIndex` is that only the visible one is ever fetched.
	test("only the selected slide loads a src", () => {
		render(<HeroBanner banners={withVideo} />);
		const els = screen.getAllByTestId("background-video");
		expect(els[0]).toHaveAttribute("src", "https://cdn/a.mp4");
		expect(els[1]).not.toHaveAttribute("src");
		expect(els[2]).not.toHaveAttribute("src");
		expect(play).toHaveBeenCalledTimes(1);
	});

	test("no slide loads anything on a mobile viewport", () => {
		stubMatchMedia({ desktop: false, reducedMotion: false });
		render(<HeroBanner banners={withVideo} />);
		for (const el of screen.getAllByTestId("background-video")) {
			expect(el).not.toHaveAttribute("src");
		}
		expect(play).not.toHaveBeenCalled();
	});

	test("no slide loads anything under prefers-reduced-motion", () => {
		stubMatchMedia({ desktop: true, reducedMotion: true });
		render(<HeroBanner banners={withVideo} />);
		for (const el of screen.getAllByTestId("background-video")) {
			expect(el).not.toHaveAttribute("src");
		}
		expect(play).not.toHaveBeenCalled();
	});
});
