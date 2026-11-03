"use client";

import { EmptyState, ErrorState, ListSkeleton, PageHeader, Panel, StatusBadge } from "@/components/account/account-ui";
import { statusLabel, ticketTone } from "@/components/account/status";
import { Button } from "@/components/swatch";
import { useMyTickets } from "@/lib/queries/support";
import { formatDate } from "@/lib/utils";
import { ChevronRight, LifeBuoy, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";

export default function SupportListPage() {
	const t = useTranslations("support");
	const locale = useLocale();
	const { data, isLoading, isError, refetch } = useMyTickets({ page: 1 });
	const tickets = data?.data ?? [];
	const tStatus = (k: string) => t(`statuses.${k}`);
	const newHref = `/${locale}/account/support/new`;

	return (
		<div>
			<PageHeader
				title={t("list.title")}
				description={t("list.intro")}
				action={
					tickets.length > 0 ? (
						<Button asChild>
							<Link href={newHref}>
								<Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
								{t("list.new")}
							</Link>
						</Button>
					) : null
				}
			/>

			{isLoading ? (
				<ListSkeleton rows={3} />
			) : isError ? (
				<ErrorState onRetry={() => refetch()} />
			) : tickets.length === 0 ? (
				<EmptyState icon={LifeBuoy} title={t("list.empty")} body={t("list.emptyBody")} action={{ label: t("list.new"), href: newHref }} />
			) : (
				<Panel as="div">
					<ul className="m-0 list-none divide-y divide-nl-cacao/10 p-0">
						{tickets.map((ticket) => (
							<li key={ticket.id}>
								<Link
									href={`/${locale}/account/support/${ticket.id}`}
									className="group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-nl-cacao/[0.025] md:px-5"
								>
									<span className="grid min-w-0 flex-1 gap-1">
										<span className="truncate text-[14.5px] font-medium text-nl-cacao">{ticket.subject}</span>
										<span className="font-mono text-[12.5px] tabular-nums text-nl-russet">
											{ticket.ticket_number}
											{ticket.created_at && ` · ${formatDate(ticket.created_at, locale)}`}
										</span>
									</span>
									<StatusBadge tone={ticketTone(ticket.status)}>{statusLabel(tStatus, ticket.status)}</StatusBadge>
									<ChevronRight
										className="hidden h-4 w-4 shrink-0 text-nl-russet transition-transform group-hover:translate-x-0.5 rtl:rotate-180 sm:block"
										strokeWidth={1.75}
										aria-hidden="true"
									/>
								</Link>
							</li>
						))}
					</ul>
				</Panel>
			)}
		</div>
	);
}
