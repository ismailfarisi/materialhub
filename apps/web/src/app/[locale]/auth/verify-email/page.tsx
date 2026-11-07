"use client";

import { VerifyEmailFlow } from "@/components/auth/email-link-flows";
import { Suspense } from "react";

export default function Page() {
	return (
		<Suspense>
			<VerifyEmailFlow />
		</Suspense>
	);
}
