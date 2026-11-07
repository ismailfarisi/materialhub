import { acceptedRevalidateTags } from "@/lib/revalidate-tags";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

/**
 * POST { tags: string[] } with `x-revalidate-secret: $REVALIDATE_SECRET`.
 * Called by cms-service (pages) and product-service (categories) after admin
 * edits, so deleted, unpublished or disabled content stops rendering at once
 * instead of after its cache TTL.
 */
export async function POST(req: Request) {
	const expected = process.env.REVALIDATE_SECRET;
	if (!expected || req.headers.get("x-revalidate-secret") !== expected) {
		return NextResponse.json({ error: "unauthorized" }, { status: 401 });
	}
	const tags = acceptedRevalidateTags(await req.json().catch(() => null));
	if (!tags) return NextResponse.json({ error: "invalid tags" }, { status: 400 });
	// Admin edits must show at once, so expire the entries instead of serving them stale.
	for (const tag of tags) revalidateTag(tag, { expire: 0 });
	return NextResponse.json({ revalidated: tags, at: new Date().toISOString() });
}
