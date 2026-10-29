import { fileTypeFromBuffer } from "file-type";

import { UnsafeUrlError, assertSafeUrl } from "./image-fetch.ssrf.ts";

const MAX_BYTES = 10 * 1024 * 1024;

const DRIVE_FILE_PATH = /^https?:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i;
const DRIVE_OPEN_OR_UC =
  /^https?:\/\/drive\.google\.com\/(?:open|uc)\?(?:.*?&)?id=([a-zA-Z0-9_-]+)/i;

// Google Drive "/file/d/{ID}/view" share links return an HTML preview, not the
// image bytes. Rewrite to lh3.googleusercontent.com which serves the file with
// a real image/* content-type.
export function normalizeImageUrl(url: string): string {
  const filePath = url.match(DRIVE_FILE_PATH);
  if (filePath?.[1]) return `https://lh3.googleusercontent.com/d/${filePath[1]}=w2000`;
  const openOrUc = url.match(DRIVE_OPEN_OR_UC);
  if (openOrUc?.[1]) return `https://lh3.googleusercontent.com/d/${openOrUc[1]}=w2000`;
  return url;
}

export interface DownloadedImage {
  buffer: Buffer;
  contentType: string;
  byteSize: number;
}

export class ImageFetchError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function downloadImage(url: string, redirectDepth = 0): Promise<DownloadedImage> {
  if (redirectDepth > 3) throw new ImageFetchError("too_many_redirects", "");
  const fetchUrl = redirectDepth === 0 ? normalizeImageUrl(url) : url;
  await assertSafeUrl(fetchUrl).catch((err) => {
    if (err instanceof UnsafeUrlError) throw new ImageFetchError("ssrf_blocked", err.reason);
    throw err;
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(fetchUrl, {
      redirect: "manual",
      signal: controller.signal,
      headers: { "User-Agent": "MaterialHubBulkImport/1.0 (+https://materialhub.example)" },
    });

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new ImageFetchError("redirect_without_location", "");
      return downloadImage(new URL(loc, fetchUrl).toString(), redirectDepth + 1);
    }
    if (res.status < 200 || res.status >= 300) {
      throw new ImageFetchError("bad_http_status", `HTTP ${res.status}`);
    }
    const contentLengthHeader = res.headers.get("content-length");
    if (contentLengthHeader && Number(contentLengthHeader) > MAX_BYTES) {
      throw new ImageFetchError("too_large", "content-length exceeds cap");
    }

    const rawContentType = res.headers.get("content-type") ?? "";
    const contentType = (rawContentType.split(";")[0] ?? "").trim().toLowerCase();
    if (!contentType.startsWith("image/")) {
      throw new ImageFetchError("wrong_content_type", contentType);
    }

    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = res.body?.getReader();
    if (!reader) throw new ImageFetchError("no_body", "");
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_BYTES) throw new ImageFetchError("too_large", "body exceeded cap mid-stream");
      chunks.push(value);
    }
    const buf = Buffer.concat(chunks);
    const detected = await fileTypeFromBuffer(buf);
    if (!detected || !detected.mime.startsWith("image/")) {
      throw new ImageFetchError("magic_bytes_mismatch", detected?.mime ?? "unknown");
    }

    return { buffer: buf, contentType: detected.mime, byteSize: buf.byteLength };
  } finally {
    clearTimeout(timer);
  }
}
