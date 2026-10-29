import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
	const secret = req.headers.get("x-revalidate-secret");
	if (secret !== process.env.REVALIDATE_SECRET) {
		return NextResponse.json({ error: "unauthorized" }, { status: 401 });
	}
	revalidateTag("header-navigation");
	return NextResponse.json({ revalidated: true, at: new Date().toISOString() });
}
