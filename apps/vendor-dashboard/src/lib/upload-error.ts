/**
 * A message a vendor can act on for a failed file upload. API errors carry a
 * readable `message`; the storage PUT (S3 presigned URL) only gives a status
 * or a network failure, which reads as noise ("S3 PUT failed: 403",
 * "Network Error", "Failed to fetch"), so those become one plain sentence.
 */
export const STORAGE_UNAVAILABLE =
	"The file could not be uploaded to storage. Check your connection and try again; if it keeps failing, uploads may be unavailable right now.";

export function uploadErrorMessage(err: unknown): string {
	const apiMessage = (err as { response?: { data?: { message?: unknown } } })?.response?.data
		?.message;
	if (typeof apiMessage === "string" && apiMessage.trim()) return apiMessage;
	const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
	if (/s3|upload failed|network|failed to fetch|load failed|cors|status code \d+/i.test(raw) || !raw) {
		return STORAGE_UNAVAILABLE;
	}
	return raw;
}
