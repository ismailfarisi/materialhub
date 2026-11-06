"use client";

import { PageHeader } from "@/components/account/account-ui";
import { QuoteRequestForm } from "@/components/rfq/quote-request-form";
import { useTranslations } from "next-intl";
import { Suspense } from "react";

export default function NewQuoteRequestPage() {
	const t = useTranslations("rfq.form");
	return (
		<div>
			<PageHeader title={t("title")} description={t("intro")} />
			<Suspense>
				<QuoteRequestForm />
			</Suspense>
		</div>
	);
}
