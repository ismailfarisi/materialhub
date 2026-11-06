"use client";

import {
	EmptyState,
	ErrorState,
	Field,
	FormMessage,
	Input,
	ListSkeleton,
	Panel,
	PanelHead,
	Select,
	StatusBadge,
} from "@/components/account/account-ui";
import { Button } from "@/components/swatch";
import { apiErrorCode } from "@/lib/business/net-terms";
import type { BusinessMe, BusinessRole, Member } from "@/lib/business/types";
import {
	useInviteMember,
	useMembers,
	useRemoveMember,
	useUpdateMemberRole,
} from "@/lib/queries/business";
import { formatDate } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import { UserPlus, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { RoleBadge } from "./business-ui";

const ROLES: BusinessRole[] = ["admin", "approver", "buyer"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function MembersPanel({ data }: { data: BusinessMe }) {
	const t = useTranslations("business");
	const isAdmin = data.membership?.role === "admin";
	const members = useMembers(!!data.account);
	const list = members.data ?? [];

	return (
		<div className="grid gap-4">
			{isAdmin ? (
				<InviteForm />
			) : (
				<p className="m-0 text-[13.5px] text-nl-russet">
					{t("members.readOnly")}
				</p>
			)}

			{members.isLoading ? (
				<ListSkeleton rows={3} />
			) : members.isError ? (
				<ErrorState onRetry={() => members.refetch()} />
			) : (
				<>
					<MemberList members={list} isAdmin={isAdmin} />
					{isAdmin && list.length <= 1 && (
						<EmptyState
							icon={Users}
							title={t("members.emptyTitle")}
							body={t("members.emptyBody")}
						/>
					)}
				</>
			)}
		</div>
	);
}

function InviteForm() {
	const t = useTranslations("business");
	const invite = useInviteMember();
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<BusinessRole>("buyer");
	const [msg, setMsg] = useState<{
		tone: "success" | "error";
		text: string;
	} | null>(null);

	async function submit(e: FormEvent) {
		e.preventDefault();
		if (!EMAIL.test(email.trim()))
			return setMsg({ tone: "error", text: t("errors.email") });
		try {
			await invite.mutateAsync({ email: email.trim(), role });
			setMsg({
				tone: "success",
				text: t("members.invited", { email: email.trim() }),
			});
			setEmail("");
		} catch (err) {
			const code = apiErrorCode(err);
			setMsg({
				tone: "error",
				text:
					code === "BUSINESS_ROLE_REQUIRED" || code === "ALREADY_IN_BUSINESS"
						? t(`errors.${code}`)
						: t("errors.generic"),
			});
		}
	}

	return (
		<Panel>
			<PanelHead title={t("members.inviteTitle")} />
			<form noValidate className="grid gap-4 p-4 md:p-5" onSubmit={submit}>
				<div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_200px]">
					<Field label={t("members.email")}>
						{(p) => (
							<Input
								{...p}
								type="email"
								dir="ltr"
								autoComplete="off"
								placeholder="buyer@gulfrigidbox.ae"
								className="rtl:text-end"
								value={email}
								onChange={(e) => {
									setEmail(e.target.value);
									setMsg(null);
								}}
							/>
						)}
					</Field>
					<Field label={t("members.role")}>
						{(p) => (
							<Select
								{...p}
								value={role}
								onChange={(e) => setRole(e.target.value as BusinessRole)}
							>
								{ROLES.map((r) => (
									<option key={r} value={r}>
										{t(`roles.${r}`)}
									</option>
								))}
							</Select>
						)}
					</Field>
				</div>
				<ul className="m-0 grid list-none gap-1.5 p-0 text-[13px]">
					{ROLES.map((r) => (
						<li key={r} className="flex gap-2">
							<span
								className={
									r === role
										? "w-20 shrink-0 font-medium text-nl-cacao"
										: "w-20 shrink-0 text-nl-russet"
								}
							>
								{t(`roles.${r}`)}
							</span>
							<span className={r === role ? "text-nl-cacao" : "text-nl-russet"}>
								{t(`roleHints.${r}`)}
							</span>
						</li>
					))}
				</ul>
				<div className="flex flex-wrap items-center gap-3">
					<Button type="submit" variant="primary" disabled={invite.isPending}>
						<UserPlus
							className="h-4 w-4"
							strokeWidth={1.75}
							aria-hidden="true"
						/>
						{invite.isPending ? t("members.inviting") : t("members.invite")}
					</Button>
					{msg && <FormMessage tone={msg.tone}>{msg.text}</FormMessage>}
				</div>
			</form>
		</Panel>
	);
}

function MemberList({
	members,
	isAdmin,
}: { members: Member[]; isAdmin: boolean }) {
	const t = useTranslations("business");
	const locale = useLocale();
	const me = useAuthStore((s) => s.user);
	const updateRole = useUpdateMemberRole();
	const remove = useRemoveMember();
	const [error, setError] = useState<{ id: string; text: string } | null>(null);

	const fail = (id: string) => (err: unknown) => {
		const code = apiErrorCode(err);
		setError({
			id,
			text:
				code === "LAST_ADMIN" ? t("errors.LAST_ADMIN") : t("errors.generic"),
		});
	};

	return (
		<Panel>
			<PanelHead
				title={t("members.listTitle")}
				meta={
					<span className="text-[13px] tabular-nums text-nl-russet">
						{t("members.count", { count: members.length })}
					</span>
				}
			/>
			<ul className="m-0 grid list-none divide-y divide-nl-cacao/10 p-0">
				{members.map((m) => {
					const isMe = !!me && (m.user_id === me.id || m.email === me.email);
					const display = m.name || m.email;
					const busy =
						(updateRole.isPending && updateRole.variables?.id === m.id) ||
						(remove.isPending && remove.variables === m.id);
					return (
						<li
							key={m.id}
							className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:px-5"
						>
							<div className="grid min-w-0 gap-0.5">
								<p className="m-0 flex flex-wrap items-center gap-2 text-[14.5px] font-medium text-nl-cacao">
									<span className="break-words">{display}</span>
									{isMe && (
										<span className="text-[13px] font-normal text-nl-russet">
											({t("members.you")})
										</span>
									)}
									{m.status === "invited" && (
										<StatusBadge tone="warning">
											{t("members.statusInvited")}
										</StatusBadge>
									)}
								</p>
								{m.name && (
									<p
										dir="ltr"
										className="m-0 break-all text-[13px] text-nl-russet rtl:text-end"
									>
										{m.email}
									</p>
								)}
								<p className="m-0 text-[13px] text-nl-russet">
									{m.status === "active" && m.joined_at
										? t("members.joined", {
												date: formatDate(m.joined_at, locale),
											})
										: t("members.invitedOn", {
												date: formatDate(m.invited_at, locale),
											})}
								</p>
								{error?.id === m.id && (
									<FormMessage tone="error">{error.text}</FormMessage>
								)}
							</div>
							{isAdmin ? (
								<div className="flex items-center gap-2">
									<label className="sr-only" htmlFor={`role-${m.id}`}>
										{t("members.roleFor", { name: display })}
									</label>
									<Select
										id={`role-${m.id}`}
										className="h-10 w-auto min-w-[9rem]"
										value={m.role}
										disabled={busy}
										onChange={(e) => {
											setError(null);
											updateRole.mutate(
												{ id: m.id, role: e.target.value as BusinessRole },
												{ onError: fail(m.id) },
											);
										}}
									>
										{ROLES.map((r) => (
											<option key={r} value={r}>
												{t(`roles.${r}`)}
											</option>
										))}
									</Select>
									<Button
										variant="ghost"
										size="sm"
										className="text-nl-russet hover:text-destructive"
										disabled={busy}
										onClick={() => {
											if (
												!confirm(t("members.removeConfirm", { name: display }))
											)
												return;
											setError(null);
											remove.mutate(m.id, { onError: fail(m.id) });
										}}
									>
										{m.status === "invited"
											? t("members.cancelInvite")
											: t("members.remove")}
									</Button>
								</div>
							) : (
								<RoleBadge role={m.role} />
							)}
						</li>
					);
				})}
			</ul>
		</Panel>
	);
}
