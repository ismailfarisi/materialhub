"use client";

import { ResetPasswordFlow } from "@/components/auth/email-link-flows";
import { Suspense } from "react";

export default function Page() {
	return (
		<Suspense>
			<ResetPasswordFlow />
		</Suspense>
	);
}
