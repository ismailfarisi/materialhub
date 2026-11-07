import { apiServer } from "@/lib/api-server";
import { cache } from "react";

export const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Per-request memoised: the segment layout (404 guard), metadata and page all
 * ask for the vendor, and this read is not in the data cache.
 */
export const fetchVendor = cache(async (slugOrId: string) => {
	const server = await apiServer();
	const path = UUID_RE.test(slugOrId)
		? `/vendors/${encodeURIComponent(slugOrId)}/profile`
		: `/vendors/by-slug/${encodeURIComponent(slugOrId)}`;
	try {
		const res = await server.get(path);
		return res.data?.data ?? null;
	} catch {
		return null;
	}
});
