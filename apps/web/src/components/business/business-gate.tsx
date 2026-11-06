"use client";

import {
	EmptyState,
	ErrorState,
	ListSkeleton,
	PageHeader,
} from "@/components/account/account-ui";
import type { BusinessMe } from "@/lib/business/types";
import { useBusiness } from "@/lib/queries/business";
import { Building2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { BusinessSubNav } from "./business-ui";

/**
 * Loads GET /auth/me/business once for every business section. With no
 * account, the sub-pages point back to setup instead of rendering empty.
 */
export function BusinessGate({
	title,
	description,
	children,
	allowNoAccount = false,
}: {
	title?: string;
	description?: (data: BusinessMe) => ReactNode;
	children: (data: BusinessMe) => ReactNode;
	allowNoAccount?: boolean;
}) {
	const t = useTranslations("business");
	const locale = useLocale();
	const q = useBusiness();

	if (q.isLoading) return <ListSkeleton rows={2} />;
	if (q.isError || !q.data) return <ErrorState onRetry={() => q.refetch()} />;
	const data = q.data;

	if (!data.account) {
		if (allowNoAccount) return <>{children(data)}</>;
		return (
			<EmptyState
				icon={Building2}
				title={t("noAccount.title")}
				body={t("noAccount.body")}
				action={{
					label: t("noAccount.action"),
					href: `/${locale}/account/business`,
				}}
			/>
		);
	}

	return (
		<div>
			<BusinessSubNav />
			{title && <PageHeader title={title} description={description?.(data)} />}
			{children(data)}
		</div>
	);
}
