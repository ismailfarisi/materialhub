"use client";

import { BusinessGate } from "@/components/business/business-gate";
import { InvoicesList } from "@/components/business/invoices-list";
import { useTranslations } from "next-intl";

export default function BusinessInvoicesPage() {
	const t = useTranslations("business.invoices");
	return (
		<BusinessGate title={t("title")} description={() => t("intro")}>
			{() => <InvoicesList />}
		</BusinessGate>
	);
}
