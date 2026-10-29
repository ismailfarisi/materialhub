export interface UploadProgress {
	bytesUploaded: number;
	bytesTotal: number;
	percent: number;
}

export interface UploadOptions {
	file: File;
	uploadUrl: string;
	onProgress?: (progress: UploadProgress) => void;
	onSuccess?: () => void;
	onError?: (error: Error) => void;
}

export interface UploadHandle {
	abort: () => void;
}

export function uploadToCloudflareStream(opts: UploadOptions): UploadHandle {
	const xhr = new XMLHttpRequest();
	const form = new FormData();
	form.append("file", opts.file, opts.file.name);

	xhr.upload.addEventListener("progress", (event) => {
		if (!event.lengthComputable) return;
		opts.onProgress?.({
			bytesUploaded: event.loaded,
			bytesTotal: event.total,
			percent:
				event.total > 0 ? Math.round((event.loaded / event.total) * 100) : 0,
		});
	});

	xhr.addEventListener("load", () => {
		if (xhr.status >= 200 && xhr.status < 300) {
			opts.onSuccess?.();
			return;
		}
		opts.onError?.(
			new Error(
				`Cloudflare upload failed: HTTP ${xhr.status} - ${xhr.responseText || xhr.statusText}`,
			),
		);
	});

	xhr.addEventListener("error", () =>
		opts.onError?.(new Error("Network error during upload")),
	);
	xhr.addEventListener("abort", () =>
		opts.onError?.(new Error("Upload aborted")),
	);
	xhr.open("POST", opts.uploadUrl);
	xhr.send(form);

	return { abort: () => xhr.abort() };
}
