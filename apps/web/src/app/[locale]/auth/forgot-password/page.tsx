"use client";

import { ForgotPasswordFlow } from "@/components/auth/email-link-flows";
import { Suspense } from "react";

export default function Page() {
	return (
		<Suspense>
			<ForgotPasswordFlow />
		</Suspense>
	);
}
