/**
 * Cloudflare Stream direct upload client.
 *
 * The server calls `POST /accounts/{id}/stream/direct_upload` which returns a
 * one-time upload URL pointing at `https://upload.cloudflarestream.com/<id>`.
 * That endpoint expects a simple `multipart/form-data` POST with the file in
 * a `file` field — NOT a tus resumable upload session.
 *
 * We use XMLHttpRequest because fetch() can't report upload progress.
 * If we ever switch to Cloudflare's tus endpoint (`/stream?direct_user=true`
 * for resumable uploads >100MB), swap this back to tus-js-client and update
 * the server to create the session.
 */

export interface UploadProgress {
  bytesUploaded: number;
  bytesTotal: number;
  percent: number;
}

export interface UploadCallbacks {
  onProgress?: (p: UploadProgress) => void;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export interface UploadOptions extends UploadCallbacks {
  file: File;
  uploadUrl: string;
}

export interface UploadHandle {
  abort: () => void;
}

export function uploadToCloudflareStream(opts: UploadOptions): UploadHandle {
  const xhr = new XMLHttpRequest();
  const form = new FormData();
  form.append("file", opts.file, opts.file.name);

  xhr.upload.addEventListener("progress", (event) => {
    if (!event.lengthComputable || !opts.onProgress) return;
    opts.onProgress({
      bytesUploaded: event.loaded,
      bytesTotal: event.total,
      percent: event.total > 0 ? Math.round((event.loaded / event.total) * 100) : 0,
    });
  });

  xhr.addEventListener("load", () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      opts.onSuccess?.();
    } else {
      opts.onError?.(
        new Error(
          `Cloudflare upload failed: HTTP ${xhr.status} — ${xhr.responseText || xhr.statusText}`,
        ),
      );
    }
  });

  xhr.addEventListener("error", () => {
    opts.onError?.(new Error("Network error during Cloudflare upload"));
  });

  xhr.addEventListener("abort", () => {
    opts.onError?.(new Error("Upload aborted"));
  });

  xhr.open("POST", opts.uploadUrl);
  xhr.send(form);

  return {
    abort: () => xhr.abort(),
  };
}
