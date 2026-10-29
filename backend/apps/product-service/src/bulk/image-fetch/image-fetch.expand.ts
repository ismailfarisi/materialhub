/**
 * Single entry point for expanding source image URLs in catalog import.
 * Composes host-specific expanders: Google Drive folders, then postimg
 * galleries. Each expander is a no-op for URLs it does not recognize, so any
 * pipe-mixed combination of plain / Drive / postimg URLs resolves correctly.
 * This is the one place new image hosts get wired in.
 */

import { expandDriveFolders } from "./image-fetch.drive-folder.ts";
import { expandPostimgGalleries } from "./image-fetch.postimg-gallery.ts";

export async function expandSourceUrls(
  urls: string[],
  ctx: { googleDriveApiKey: string | null },
): Promise<string[]> {
  const afterDrive = await expandDriveFolders(urls, ctx.googleDriveApiKey);
  return expandPostimgGalleries(afterDrive);
}
