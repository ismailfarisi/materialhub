import { NextResponse } from "next/server";

// Liveness probe for the Docker healthcheck on the prod frontend box.
export const dynamic = "force-dynamic";

export function GET() {
	return NextResponse.json({ ok: true });
}
