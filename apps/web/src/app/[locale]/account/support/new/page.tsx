"use client";

import { apiErrorMessage } from "@/components/account/types";
import { Field, FieldError, Input, PageHeader, Panel, Select, Textarea } from "@/components/account/account-ui";
import { Button } from "@/components/swatch";
import { useCreateTicket } from "@/lib/queries/support";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

const CATEGORIES = ["order", "payment", "product", "account"] as const;

export default function NewTicketPage() {
	const t = useTranslations("support");
	const router = useRouter();
	const locale = useLocale();
	const create = useCreateTicket();
	const [subject, setSubject] = useState("");
	const [category, setCategory] = useState<(typeof CATEGORIES)[number] | "">("");
	const [message, setMessage] = useState("");
	const [error, setError] = useState<string | null>(null);

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		try {
			const ticket = await create.mutateAsync({ subject, category: category || null, message });
			router.push(`/${locale}/account/support/${ticket.id}`);
		} catch (err) {
			setError(apiErrorMessage(err, t("errors.submitFailed")));
		}
	}

	return (
		<div>
			<PageHeader title={t("list.new")} description={t("form.intro")} />
			<Panel className="max-w-[760px]">
				<form onSubmit={submit} className="grid gap-4 p-4 md:p-5">
					<div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_220px]">
						<Field label={t("form.subject")}>
							{(p) => <Input {...p} value={subject} onChange={(e) => setSubject(e.target.value)} required maxLength={200} />}
						</Field>
						<Field label={t("form.category")} optional>
							{(p) => (
								<Select {...p} value={category} onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number] | "")}>
									<option value="">{t("form.categoryNone")}</option>
									{CATEGORIES.map((c) => (
										<option key={c} value={c}>
											{t(`categories.${c}`)}
										</option>
									))}
								</Select>
							)}
						</Field>
					</div>
					<Field label={t("form.message")} hint={t("form.messageHint")}>
						{(p) => <Textarea {...p} rows={6} value={message} onChange={(e) => setMessage(e.target.value)} required />}
					</Field>
					{error && <FieldError>{error}</FieldError>}
					<div>
						<Button type="submit" disabled={create.isPending}>
							{create.isPending ? t("form.submitting") : t("form.submit")}
						</Button>
					</div>
				</form>
			</Panel>
		</div>
	);
}
