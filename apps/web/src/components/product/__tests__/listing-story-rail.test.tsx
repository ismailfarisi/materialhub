import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ListingStoryRail } from "../listing-story-rail";

vi.mock("next-intl", () => ({
	useTranslations: () => (key: string) => key,
	useLocale: () => "en",
}));

vi.mock("../../reels/reel-feed", () => ({
	// biome-ignore lint/suspicious/noExplicitAny: test mock
	ReelFeed: ({ seedReelId, categorySlug }: any) => (
		<div data-testid="reel-feed" data-category={categorySlug}>
			{seedReelId ?? "none"}
		</div>
	),
}));

const reels = [
	{
		id: "r1",
		creator: { displayName: "Aisha", avatarUrl: "https://x/a.jpg" },
		thumbnailUrl: "https://x/t1.jpg",
		videoPlaybackUrl: "https://x/v1.m3u8",
	},
	{
		id: "r2",
		creator: { displayName: "Maya", avatarUrl: "https://x/b.jpg" },
		thumbnailUrl: "https://x/t2.jpg",
		videoPlaybackUrl: "https://x/v2.m3u8",
	},
];

describe("ListingStoryRail", () => {
	it("renders nothing when reels is empty", () => {
		const { container } = render(<ListingStoryRail reels={[]} />);
		expect(container).toBeEmptyDOMElement();
	});

	it("renders one circle per reel using creator displayName", () => {
		render(<ListingStoryRail reels={reels} />);
		expect(screen.getByText("Aisha")).toBeInTheDocument();
		expect(screen.getByText("Maya")).toBeInTheDocument();
	});

	it("opens the shared feed seeded to the chosen reel on click", () => {
		render(<ListingStoryRail reels={reels} categorySlug="makeup" />);
		expect(screen.queryByTestId("reel-feed")).toBeNull();

		fireEvent.click(screen.getByLabelText(/Watch Maya/));

		const feed = screen.getByTestId("reel-feed");
		expect(feed.textContent).toBe("r2");
		expect(feed.getAttribute("data-category")).toBe("makeup");
	});

	it("closes the feed overlay when the close button is clicked", () => {
		render(<ListingStoryRail reels={reels} />);
		fireEvent.click(screen.getByLabelText(/Watch Aisha/));
		expect(screen.getByTestId("reel-feed")).toBeInTheDocument();

		fireEvent.click(screen.getByLabelText("close"));
		expect(screen.queryByTestId("reel-feed")).toBeNull();
	});
});
