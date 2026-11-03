"use client";

import { StepTrack } from "@/components/account/step-track";
import type { TicketStatus } from "@/lib/queries/support";
import { useTranslations } from "next-intl";

// "Awaiting your reply" is a detour inside "In progress", not a milestone of
// its own, so the track keeps four steps and the badge carries that state.
const STEPS: TicketStatus[] = ["open", "in_progress", "resolved", "closed"];
const STEP_OF: Record<TicketStatus, number> = {
	open: 0,
	in_progress: 1,
	waiting_customer: 1,
	resolved: 2,
	closed: 4,
};

export function TicketTimeline({ currentStatus }: { currentStatus: TicketStatus }) {
	const t = useTranslations("support.statuses");
	return <StepTrack current={STEP_OF[currentStatus] ?? 0} steps={STEPS.map((s) => ({ key: s, label: t(s) }))} />;
}
