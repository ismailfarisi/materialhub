"use client";

import { ApprovalsList } from "@/components/business/approvals-list";
import { BusinessGate } from "@/components/business/business-gate";
import { useTranslations } from "next-intl";

export default function BusinessApprovalsPage() {
	const t = useTranslations("business.approvals");
	return (
		<BusinessGate title={t("title")}>
			{(data) => <ApprovalsList data={data} />}
		</BusinessGate>
	);
}
