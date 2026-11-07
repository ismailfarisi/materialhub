/**
 * A post-login redirect target taken from the URL is attacker-controlled
 * (`/auth/login?returnTo=https://evil.example`). Only same-site paths are
 * allowed: a single leading "/" (not "//" or "/\", which browsers treat as
 * protocol-relative), no scheme, no control characters. Anything else falls
 * back to `fallback`.
 */
export function safeReturnTo(raw: string | null | undefined, fallback: string): string {
	if (!raw) return fallback;
	const value = raw.trim();
	if (!value.startsWith("/")) return fallback;
	if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
	// biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters is the point
	if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
	try {
		const url = new URL(value, "https://materialhub.invalid");
		if (url.origin !== "https://materialhub.invalid") return fallback;
		return url.pathname + url.search + url.hash;
	} catch {
		return fallback;
	}
}
