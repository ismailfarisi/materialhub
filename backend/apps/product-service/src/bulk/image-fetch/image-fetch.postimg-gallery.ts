/**
 * postimg.cc gallery URL expansion for bulk catalog import.
 *
 * Vendors paste https://postimg.cc/gallery/{ID} URLs into the image_urls
 * column. postimg has no public API, so we fetch the gallery page and extract
 * each image's full-resolution direct link from its PhotoSwipe attribute
 * (data-pswp-src="https://i.postimg.cc/..."), in gallery display order. The
 * resulting i.postimg.cc URLs flow through the existing image-fetch pipeline
 * (SSRF guard + size cap + magic-byte check).
 *
 * NOTE: each gallery card also has a thumbnail <img src="i.postimg.cc/..."> with
 * a DIFFERENT id — we deliberately target data-pswp-src (full resolution).
 */

import { type BulkErrorCode, BulkErrorCodes } from "@materialhub/bulk-jobs";

const POSTIMG_GALLERY_REGEX = /^https?:\/\/postimg\.cc\/gallery\/([a-zA-Z0-9]+)/i;
const PSWP_SRC_REGEX = /data-pswp-src="(https:\/\/i\.postimg\.cc\/[^"]+)"/gi;
const POSTIMG_TIMEOUT_MS = 15_000;
const MAX_GALLERY_BYTES = 10 * 1024 * 1024;

export function isPostimgGalleryUrl(url: string): string | null {
  const match = url.match(POSTIMG_GALLERY_REGEX);
  return match?.[1] ?? null;
}

function unescapeHtml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#0?38;/g, "&");
}

export function extractGalleryImageUrls(html: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of html.matchAll(PSWP_SRC_REGEX)) {
    const url = unescapeHtml(m[1]!);
    if (!seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  }
  return out;
}

export class PostimgGalleryError extends Error {
  constructor(
    public readonly code: BulkErrorCode,
    message?: string,
  ) {
    super(message ?? code);
  }
}

function statusToErrorCode(status: number): BulkErrorCode {
  if (status === 404) return BulkErrorCodes.POSTIMG_GALLERY_NOT_FOUND;
  if (status === 403) return BulkErrorCodes.POSTIMG_GALLERY_INACCESSIBLE;
  return BulkErrorCodes.POSTIMG_FETCH_ERROR;
}

async function readGalleryBody(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_GALLERY_BYTES) {
      throw new PostimgGalleryError(
        BulkErrorCodes.POSTIMG_FETCH_ERROR,
        "postimg_fetch_error: gallery page too large",
      );
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function listPostimgGalleryImages(galleryId: string): Promise<string[]> {
  const url = `https://postimg.cc/gallery/${galleryId}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), POSTIMG_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "MaterialHubBulkImport/1.0 (+https://materialhub.example)",
      },
    });
  } catch (err) {
    throw new PostimgGalleryError(
      BulkErrorCodes.POSTIMG_FETCH_ERROR,
      `postimg_fetch_error: ${(err as Error).message}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new PostimgGalleryError(statusToErrorCode(res.status));
  }

  const contentLengthHeader = res.headers.get("content-length");
  if (contentLengthHeader && Number(contentLengthHeader) > MAX_GALLERY_BYTES) {
    throw new PostimgGalleryError(
      BulkErrorCodes.POSTIMG_FETCH_ERROR,
      "postimg_fetch_error: gallery page too large",
    );
  }

  const html = await readGalleryBody(res);
  const images = extractGalleryImageUrls(html);
  if (images.length === 0) {
    throw new PostimgGalleryError(BulkErrorCodes.POSTIMG_GALLERY_EMPTY);
  }
  return images;
}

export async function expandPostimgGalleries(urls: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const url of urls) {
    const galleryId = isPostimgGalleryUrl(url);
    if (!galleryId) {
      out.push(url);
      continue;
    }
    const images = await listPostimgGalleryImages(galleryId);
    out.push(...images);
  }
  return out;
}
