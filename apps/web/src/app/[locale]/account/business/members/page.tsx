"use client";

import { BusinessGate } from "@/components/business/business-gate";
import { MembersPanel } from "@/components/business/members-panel";
import { useTranslations } from "next-intl";

export default function BusinessMembersPage() {
	const t = useTranslations("business.members");
	return (
		<BusinessGate
			title={t("title")}
			description={(d) => t("intro", { company: d.account?.legal_name ?? "" })}
		>
			{(data) => <MembersPanel data={data} />}
		</BusinessGate>
	);
}
