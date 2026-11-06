"use client";

import {
	FormMessage,
	PageHeader,
	Panel,
	PanelHead,
} from "@/components/account/account-ui";
import { Button } from "@/components/swatch";
import type { Invite } from "@/lib/business/types";
import { useCreateBusiness, useRespondToInvite } from "@/lib/queries/business";
import { formatDate } from "@/lib/utils";
import { FileCheck2, Receipt, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { BusinessForm } from "./business-form";

/** No business yet: pending invitations, what the account gives, and the setup form. */
export function BusinessSetup({ invites }: { invites: Invite[] }) {
	const t = useTranslations("business");
	const create = useCreateBusiness();

	const benefits = [
		{ icon: Receipt, title: t("setup.vatTitle"), body: t("setup.vatBody") },
		{ icon: Users, title: t("setup.teamTitle"), body: t("setup.teamBody") },
		{
			icon: FileCheck2,
			title: t("setup.termsTitle"),
			body: t("setup.termsBody"),
		},
	];

	return (
		<div className="grid gap-6">
			<PageHeader title={t("setup.title")} description={t("setup.intro")} />

			{invites.length > 0 && <InviteList invites={invites} />}

			<section aria-label={t("setup.benefitsLabel")}>
				<ul className="m-0 grid list-none divide-y divide-nl-cacao/10 border-y border-nl-cacao/12 p-0 md:grid-cols-3 md:divide-x md:divide-y-0 rtl:md:divide-x-reverse">
					{benefits.map(({ icon: Icon, title, body }) => (
						<li
							key={title}
							className="flex gap-3 py-4 md:px-5 md:first:ps-0 md:last:pe-0"
						>
							<Icon
								className="mt-0.5 h-5 w-5 shrink-0 text-nl-cacao"
								strokeWidth={1.5}
								aria-hidden="true"
							/>
							<div className="grid gap-1">
								<p className="m-0 font-display text-[15.5px] font-semibold leading-snug tracking-[-0.01em] text-nl-cacao">
									{title}
								</p>
								<p className="m-0 text-[13.5px] leading-relaxed text-nl-russet">
									{body}
								</p>
							</div>
						</li>
					))}
				</ul>
			</section>

			<Panel>
				<PanelHead title={t("setup.formTitle")} />
				<div className="grid gap-5 p-4 md:p-5">
					<p className="m-0 max-w-[65ch] text-[13.5px] text-nl-russet">
						{t("setup.formIntro")}
					</p>
					<BusinessForm
						submitLabel={t("setup.submit")}
						busyLabel={t("setup.creating")}
						busy={create.isPending}
						onSubmit={async (input) => {
							await create.mutateAsync(input);
						}}
					/>
				</div>
			</Panel>
		</div>
	);
}

function InviteList({ invites }: { invites: Invite[] }) {
	const t = useTranslations("business");
	const locale = useLocale();
	const respond = useRespondToInvite();
	const [failed, setFailed] = useState<string | null>(null);

	return (
		<Panel>
			<PanelHead title={t("invites.title")} />
			<ul className="m-0 grid list-none divide-y divide-nl-cacao/10 p-0">
				{invites.map((inv) => {
					const busy = respond.isPending && respond.variables?.id === inv.id;
					return (
						<li
							key={inv.id}
							className="grid gap-3 px-4 py-4 sm:flex sm:items-center sm:justify-between md:px-5"
						>
							<div className="grid min-w-0 gap-0.5">
								<p className="m-0 break-words text-[14.5px] text-nl-cacao">
									{t("invites.body", {
										company: inv.legal_name,
										role: t(`roles.${inv.role}`),
									})}
								</p>
								<p className="m-0 text-[13px] text-nl-russet">
									{t("invites.invitedOn", {
										date: formatDate(inv.invited_at, locale),
									})}
								</p>
								{failed === inv.id && (
									<FormMessage tone="error">{t("invites.failed")}</FormMessage>
								)}
							</div>
							<div className="flex shrink-0 gap-2">
								<Button
									variant="primary"
									size="sm"
									disabled={busy}
									onClick={() =>
										respond.mutate(
											{ id: inv.id, action: "accept" },
											{ onError: () => setFailed(inv.id) },
										)
									}
								>
									{t("invites.accept")}
								</Button>
								<Button
									variant="ghost"
									size="sm"
									disabled={busy}
									onClick={() =>
										respond.mutate(
											{ id: inv.id, action: "decline" },
											{ onError: () => setFailed(inv.id) },
										)
									}
								>
									{t("invites.decline")}
								</Button>
							</div>
						</li>
					);
				})}
			</ul>
		</Panel>
	);
}
