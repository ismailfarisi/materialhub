"use client";

import { BusinessGate } from "@/components/business/business-gate";
import { NetTermsPanel } from "@/components/business/net-terms-panel";
import { useTranslations } from "next-intl";

export default function BusinessTermsPage() {
	const t = useTranslations("business.terms");
	return (
		<BusinessGate title={t("title")} description={() => t("intro")}>
			{(data) => <NetTermsPanel data={data} />}
		</BusinessGate>
	);
}
