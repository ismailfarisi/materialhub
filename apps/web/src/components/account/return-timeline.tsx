"use client";

import { useTranslations } from "next-intl";
import { StatusBadge } from "./account-ui";
import { StepTrack } from "./step-track";

const STATUSES = ["requested", "approved", "shipped_back", "received", "refunded"] as const;

export function ReturnTimeline({ currentStatus }: { currentStatus: string }) {
	const t = useTranslations("returns.statuses");
	const status = currentStatus?.toLowerCase() ?? "";

	if (status === "rejected") {
		return <StatusBadge tone="error">{t("rejected")}</StatusBadge>;
	}

	const index = STATUSES.indexOf(status as (typeof STATUSES)[number]);
	// Refunded closes the return: every milestone is complete.
	const current = index === STATUSES.length - 1 ? STATUSES.length : index;
	return <StepTrack current={current} steps={STATUSES.map((s) => ({ key: s, label: t(s) }))} />;
}
