/**
 * Where to send the user after sign-in. Accepts `returnTo` (and the older
 * `next`) but only same-origin absolute paths, so a crafted link cannot bounce
 * a vendor to another site after login.
 */
export function safeReturnTo(params: { get(name: string): string | null }): string {
	const raw = params.get("returnTo") ?? params.get("next") ?? "";
	if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
	return raw;
}

/** Login URL that brings the user back to `path` afterwards. */
export function loginUrl(path: string, reason?: string): string {
	const q = new URLSearchParams({ returnTo: path });
	if (reason) q.set("reason", reason);
	return `/login?${q.toString()}`;
}
