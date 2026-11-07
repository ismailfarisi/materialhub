"use client";

import { MagicLinkRequestFlow } from "@/components/auth/email-link-flows";
import { Suspense } from "react";

export default function Page() {
	return (
		<Suspense>
			<MagicLinkRequestFlow />
		</Suspense>
	);
}
