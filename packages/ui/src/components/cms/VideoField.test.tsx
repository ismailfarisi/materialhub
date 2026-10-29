import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { LayoutVideo, S3UploadClient } from "../../hooks/use-s3-upload";
import { VideoField } from "./VideoField";

function makeClient(overrides: Partial<S3UploadClient> = {}): S3UploadClient {
	return {
		presign: vi.fn(),
		putToS3: vi.fn().mockResolvedValue(undefined),
		processAsset: vi.fn(),
		presignLayoutVideo: vi.fn().mockResolvedValue({ uploadUrl: "https://s3/put", key: "raw-video/layout/platform/a.mp4" }),
		processLayoutVideo: vi.fn().mockResolvedValue({ id: "vid-1", status: "processing" }),
		getLayoutVideo: vi.fn().mockResolvedValue({
			id: "vid-1", status: "ready", url: "https://cdn/v.mp4", poster_url: "https://cdn/p.jpg", duration_seconds: 9,
		}),
		deleteLayoutVideo: vi.fn().mockResolvedValue(undefined),
		...overrides,
	} as S3UploadClient;
}

/** jsdom has no media pipeline; fake the metadata probe the component relies on. */
function stubDuration(seconds: number) {
	Object.defineProperty(HTMLMediaElement.prototype, "duration", {
		configurable: true,
		get: () => seconds,
	});
	// Fire loadedmetadata as soon as a src is assigned.
	Object.defineProperty(HTMLMediaElement.prototype, "src", {
		configurable: true,
		set(this: HTMLMediaElement) {
			setTimeout(() => this.dispatchEvent(new Event("loadedmetadata")), 0);
		},
	});
}

function pick(file: File) {
	const input = screen.getByTestId("video-file-input") as HTMLInputElement;
	fireEvent.change(input, { target: { files: [file] } });
}

const mp4 = (size: number) =>
	new File([new Uint8Array(Math.min(size, 1024))], "clip.mp4", { type: "video/mp4" });

describe("VideoField", () => {
	beforeEach(() => {
		vi.useRealTimers();
		stubDuration(9);
	});

	test("renders nothing when the client cannot upload video", () => {
		const { container } = render(
			<VideoField value={null} onChange={vi.fn()} client={makeClient({ presignLayoutVideo: undefined })} />,
		);
		expect(container).toBeEmptyDOMElement();
	});

	test("rejects a file over 25MB before uploading", async () => {
		const client = makeClient();
		render(<VideoField value={null} onChange={vi.fn()} client={client} />);
		const big = mp4(1024);
		Object.defineProperty(big, "size", { value: 26 * 1024 * 1024 });
		pick(big);
		expect(await screen.findByText(/25 ?MB/i)).toBeInTheDocument();
		expect(client.presignLayoutVideo).not.toHaveBeenCalled();
	});

	test("rejects a clip longer than 15s before uploading", async () => {
		stubDuration(22);
		const client = makeClient();
		render(<VideoField value={null} onChange={vi.fn()} client={client} />);
		pick(mp4(1024));
		expect(await screen.findByText(/15 seconds/i)).toBeInTheDocument();
		expect(client.presignLayoutVideo).not.toHaveBeenCalled();
	});

	test("commits the video only once the transcode reports ready", async () => {
		const onChange = vi.fn();
		const client = makeClient();
		render(<VideoField value={null} onChange={onChange} client={client} />);
		pick(mp4(1024));

		await waitFor(() => expect(client.processLayoutVideo).toHaveBeenCalled());
		// Not committed while processing.
		expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ id: "vid-1" }));

		await waitFor(() =>
			expect(onChange).toHaveBeenCalledWith({
				id: "vid-1",
				url: "https://cdn/v.mp4",
				poster_url: "https://cdn/p.jpg",
				duration_seconds: 9,
			}),
		);
	});

	test("surfaces a failed transcode and commits nothing", async () => {
		const onChange = vi.fn();
		const client = makeClient({
			getLayoutVideo: vi.fn().mockResolvedValue({
				id: "vid-1", status: "failed", url: "", poster_url: "", duration_seconds: 1,
			}),
		});
		render(<VideoField value={null} onChange={onChange} client={client} />);
		pick(mp4(1024));
		expect(await screen.findByText(/could not be processed/i)).toBeInTheDocument();
		expect(onChange).not.toHaveBeenCalled();
	});

	const existing = {
		id: "vid-9",
		url: "https://cdn/v.mp4",
		poster_url: "https://cdn/p.jpg",
		duration_seconds: 8,
	};

	test("remove deletes server-side and clears the value", async () => {
		const onChange = vi.fn();
		const client = makeClient();
		render(<VideoField value={existing} onChange={onChange} client={client} />);
		fireEvent.click(screen.getByRole("button", { name: /remove/i }));
		await waitFor(() => expect(client.deleteLayoutVideo).toHaveBeenCalledWith("vid-9"));
		expect(onChange).toHaveBeenCalledWith(null);
	});

	// Clearing optimistically would orphan the row: unreachable from the block,
	// but still holding one of the vendor's ten quota slots.
	test("remove keeps the value and surfaces an error when the delete fails", async () => {
		const onChange = vi.fn();
		const client = makeClient({
			deleteLayoutVideo: vi.fn().mockRejectedValue(new Error("boom")),
		});
		render(<VideoField value={existing} onChange={onChange} client={client} />);
		fireEvent.click(screen.getByRole("button", { name: /remove/i }));

		expect(await screen.findByText(/couldn't remove that video/i)).toBeInTheDocument();
		expect(onChange).not.toHaveBeenCalled();
		// Still removable — the control is not disabled by the failure.
		expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument();
	});

	test("remove treats a 404 as success — the row is already gone", async () => {
		const onChange = vi.fn();
		const client = makeClient({
			deleteLayoutVideo: vi.fn().mockRejectedValue({ response: { status: 404 } }),
		});
		render(<VideoField value={existing} onChange={onChange} client={client} />);
		fireEvent.click(screen.getByRole("button", { name: /remove/i }));

		await waitFor(() => expect(onChange).toHaveBeenCalledWith(null));
		expect(screen.queryByText(/couldn't remove that video/i)).toBeNull();
	});

	test("a retry after a rejection is possible — the file input is reset", async () => {
		const client = makeClient();
		render(<VideoField value={null} onChange={vi.fn()} client={client} />);
		const input = screen.getByTestId("video-file-input") as HTMLInputElement;

		// `<input type="file">` only fires change when its value differs, so the
		// handler must clear it or re-picking the same file is a silent no-op.
		const valueAssignments: string[] = [];
		Object.defineProperty(input, "value", {
			configurable: true,
			get: () => "",
			set: (v: string) => {
				valueAssignments.push(v);
			},
		});

		const big = mp4(1024);
		Object.defineProperty(big, "size", { value: 26 * 1024 * 1024 });
		fireEvent.change(input, { target: { files: [big] } });

		expect(await screen.findByText(/25 ?MB/i)).toBeInTheDocument();
		expect(valueAssignments).toContain("");
	});

	test("a transient poll failure does not abandon the transcode", async () => {
		const onChange = vi.fn();
		const getLayoutVideo = vi
			.fn()
			.mockRejectedValueOnce(new Error("network blip"))
			.mockResolvedValue({
				id: "vid-1",
				status: "ready",
				url: "https://cdn/v.mp4",
				poster_url: "https://cdn/p.jpg",
				duration_seconds: 9,
			});
		render(
			<VideoField value={null} onChange={onChange} client={makeClient({ getLayoutVideo })} />,
		);
		pick(mp4(1024));

		await waitFor(() => expect(getLayoutVideo).toHaveBeenCalledTimes(2));
		await waitFor(() =>
			expect(onChange).toHaveBeenCalledWith({
				id: "vid-1",
				url: "https://cdn/v.mp4",
				poster_url: "https://cdn/p.jpg",
				duration_seconds: 9,
			}),
		);
		// The blip must not be reported as a dead end.
		expect(screen.queryByText(/upload failed/i)).toBeNull();
	});

	test("a file whose metadata never arrives fails with a message instead of hanging", async () => {
		vi.useFakeTimers();
		try {
			// Silent src setter: neither loadedmetadata nor error is ever fired.
			Object.defineProperty(HTMLMediaElement.prototype, "src", {
				configurable: true,
				set() {},
			});
			const client = makeClient();
			render(<VideoField value={null} onChange={vi.fn()} client={client} />);
			pick(mp4(1024));

			await act(async () => {
				await vi.advanceTimersByTimeAsync(10_000);
			});
			expect(screen.getByText(/could not read that video file/i)).toBeInTheDocument();
			expect(client.presignLayoutVideo).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});

	test("does not commit if the component unmounts while the transcode check is in flight", async () => {
		const onChange = vi.fn();
		let resolveGetLayoutVideo: (value: LayoutVideo) => void = () => {};
		const getLayoutVideo = vi.fn(
			() =>
				new Promise<LayoutVideo>((resolve) => {
					resolveGetLayoutVideo = resolve;
				}),
		);
		const client = makeClient({ getLayoutVideo });
		const { unmount } = render(<VideoField value={null} onChange={onChange} client={client} />);
		pick(mp4(1024));

		// Wait until the poll's getLayoutVideo request has actually gone out.
		await waitFor(() => expect(getLayoutVideo).toHaveBeenCalled());

		// Unmount while that request is still in flight, then let it resolve "ready".
		unmount();
		resolveGetLayoutVideo({
			id: "vid-1",
			status: "ready",
			url: "https://cdn/v.mp4",
			poster_url: "https://cdn/p.jpg",
			duration_seconds: 9,
		});

		// Give the resolved promise's continuation a turn to run.
		await new Promise((r) => setTimeout(r, 0));
		expect(onChange).not.toHaveBeenCalled();
	});
});
