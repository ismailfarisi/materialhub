/**
 * Drive folder URL expansion for bulk catalog import.
 *
 * Vendors paste /drive/folders/{ID} URLs into the image_urls column. We list
 * the folder via Drive API v3 (public API key auth), sort by filename, and
 * emit per-file lh3.googleusercontent.com URLs that flow through the existing
 * image-fetch pipeline (SSRF guard + magic-byte check).
 */

import { type BulkErrorCode, BulkErrorCodes } from "@materialhub/bulk-jobs";

const DRIVE_FOLDER_REGEX = /^https?:\/\/drive\.google\.com\/drive\/folders\/([a-zA-Z0-9_-]+)/i;

export function isDriveFolderUrl(url: string): string | null {
  const match = url.match(DRIVE_FOLDER_REGEX);
  return match?.[1] ?? null;
}

export function buildDriveFileUrl(fileId: string): string {
  return `https://lh3.googleusercontent.com/d/${fileId}=w2000`;
}

const FILE_NAME_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export interface DriveFile {
  id: string;
  name: string;
}

export function sortFilesByName(files: DriveFile[]): DriveFile[] {
  return [...files].sort((a, b) => FILE_NAME_COLLATOR.compare(a.name, b.name));
}

export class DriveFolderError extends Error {
  constructor(
    public readonly code: BulkErrorCode,
    message?: string,
  ) {
    super(message ?? code);
  }
}

const DRIVE_API_TIMEOUT_MS = 15_000;

function statusToErrorCode(status: number): BulkErrorCode {
  if (status === 404) return BulkErrorCodes.DRIVE_FOLDER_NOT_FOUND;
  if (status === 403) return BulkErrorCodes.DRIVE_FOLDER_INACCESSIBLE;
  return BulkErrorCodes.DRIVE_API_ERROR;
}

export async function listDriveFolderImages(
  folderId: string,
  apiKey: string,
): Promise<DriveFile[]> {
  const all: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and mimeType contains 'image/' and trashed=false`,
      fields: "nextPageToken,files(id,name)",
      pageSize: "1000",
      key: apiKey,
    });
    if (pageToken) params.set("pageToken", pageToken);

    // URLSearchParams encodes spaces as '+'; Drive API expects percent-encoding
    const url = `https://www.googleapis.com/drive/v3/files?${params.toString().replace(/\+/g, "%20")}`;

    let res: Response;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DRIVE_API_TIMEOUT_MS);
    try {
      res = await fetch(url, { signal: controller.signal });
    } catch (err) {
      throw new DriveFolderError(
        BulkErrorCodes.DRIVE_API_ERROR,
        `drive_api_error: ${(err as Error).message}`,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      throw new DriveFolderError(statusToErrorCode(res.status));
    }

    const body = (await res.json()) as {
      files?: unknown;
      nextPageToken?: string;
    };
    if (!Array.isArray(body.files)) {
      throw new DriveFolderError(
        BulkErrorCodes.DRIVE_API_ERROR,
        "drive_api_error: unexpected response shape",
      );
    }
    all.push(...(body.files as Array<{ id: string; name: string }>));
    pageToken = body.nextPageToken;
  } while (pageToken);

  return all;
}

export async function expandDriveFolders(urls: string[], apiKey: string | null): Promise<string[]> {
  const out: string[] = [];
  for (const url of urls) {
    const folderId = isDriveFolderUrl(url);
    if (!folderId) {
      out.push(url);
      continue;
    }
    if (!apiKey) {
      throw new DriveFolderError(BulkErrorCodes.DRIVE_API_NOT_CONFIGURED);
    }
    const files = await listDriveFolderImages(folderId, apiKey);
    for (const f of sortFilesByName(files)) {
      out.push(buildDriveFileUrl(f.id));
    }
  }
  return out;
}
