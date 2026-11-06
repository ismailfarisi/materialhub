"use client";

import { Textarea } from "@/components/account/account-ui";
import { Button } from "@/components/swatch";
import type {
	QuoteAttachment,
	QuoteMessage,
	QuoteSupplier,
} from "@/lib/queries/rfq";
import { cn } from "@/lib/utils";
import { Paperclip, SendHorizontal } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";

/**
 * One thread per supplier. Supplier tabs on top (they're the same request,
 * different conversations), messages, then the composer.
 */
export function QuoteThread({
	suppliers,
	onSend,
	onOpenAttachment,
	sending,
	readOnly = false,
}: {
	suppliers: QuoteSupplier[];
	onSend?: (supplierId: string, body: string) => Promise<unknown>;
	onOpenAttachment?: (a: QuoteAttachment) => void;
	sending?: boolean;
	readOnly?: boolean;
}) {
	const t = useTranslations("rfq.detail");
	const locale = useLocale();
	const baseId = useId();
	const [activeId, setActiveId] = useState(suppliers[0]?.id);
	const [text, setText] = useState("");
	const [error, setError] = useState(false);
	const active = suppliers.find((s) => s.id === activeId) ?? suppliers[0];
	if (!active) return null;
	const supplierName = active.vendor?.name ?? "—";

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		if (!onSend || !text.trim() || !active) return;
		const value = text;
		setText("");
		setError(false);
		try {
			await onSend(active.id, value.trim());
		} catch {
			setText(value);
			setError(true);
		}
	}

	return (
		<div>
			{suppliers.length > 1 && (
				<div
					role="tablist"
					aria-label={t("thread")}
					className="scrollbar-hide flex gap-1 overflow-x-auto border-b border-nl-cacao/10 px-4 md:px-5"
				>
					{suppliers.map((s) => {
						const on = s.id === active.id;
						return (
							<button
								key={s.id}
								type="button"
								role="tab"
								id={`${baseId}-tab-${s.id}`}
								aria-selected={on}
								aria-controls={`${baseId}-panel`}
								onClick={() => setActiveId(s.id)}
								className={cn(
									"relative flex h-11 shrink-0 items-center gap-2 whitespace-nowrap px-3 text-sm transition-colors",
									"after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-[1px]",
									on
										? "font-medium text-nl-cacao after:bg-nl-cacao"
										: "text-nl-russet after:bg-transparent hover:text-nl-cacao",
								)}
							>
								{s.vendor?.name ?? "—"}
								{s.messages.length > 0 && (
									<span className="font-mono text-[12px] tabular-nums text-nl-russet">
										{s.messages.length}
									</span>
								)}
							</button>
						);
					})}
				</div>
			)}

			<div
				id={`${baseId}-panel`}
				role={suppliers.length > 1 ? "tabpanel" : undefined}
				aria-labelledby={
					suppliers.length > 1 ? `${baseId}-tab-${active.id}` : undefined
				}
				aria-label={
					suppliers.length > 1
						? undefined
						: t("threadWith", { supplier: supplierName })
				}
				className="p-4 md:p-5"
			>
				{active.messages.length === 0 ? (
					<p className="m-0 text-sm text-nl-russet">{t("threadEmpty")}</p>
				) : (
					<ol className="m-0 flex list-none flex-col gap-3 p-0">
						{active.messages.map((m) => (
							<MessageBubble
								key={m.id}
								message={m}
								mine={m.sender_role === "buyer"}
								author={
									m.sender_role === "buyer"
										? t("you")
										: m.sender_role === "system"
											? t("system")
											: supplierName
								}
								locale={locale}
								onOpenAttachment={onOpenAttachment}
							/>
						))}
					</ol>
				)}
			</div>

			{!readOnly &&
				onSend &&
				(active.can_message ? (
					<form
						onSubmit={submit}
						className="grid gap-2 border-t border-nl-cacao/10 p-4 md:p-5"
					>
						<label
							htmlFor={`${baseId}-reply`}
							className="text-[13px] font-medium text-nl-cacao"
						>
							{t("reply", { supplier: supplierName })}
						</label>
						<Textarea
							id={`${baseId}-reply`}
							rows={3}
							className="min-h-[88px]"
							value={text}
							maxLength={4000}
							onChange={(e) => setText(e.target.value)}
							placeholder={t("replyPlaceholder")}
							onKeyDown={(e) => {
								if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
									e.currentTarget.form?.requestSubmit();
							}}
						/>
						<div className="flex flex-wrap items-center justify-between gap-2">
							<span
								className={
									error
										? "text-[13px] text-destructive"
										: "text-[13px] text-nl-russet"
								}
								role={error ? "alert" : undefined}
							>
								{error ? t("actionFailed") : t("replyHint")}
							</span>
							<Button type="submit" disabled={sending || !text.trim()}>
								<SendHorizontal
									className="h-4 w-4 rtl:-scale-x-100"
									strokeWidth={1.75}
									aria-hidden="true"
								/>
								{t("send")}
							</Button>
						</div>
					</form>
				) : (
					<p className="m-0 border-t border-nl-cacao/10 p-4 text-sm text-nl-russet md:p-5">
						{t("threadClosed")}
					</p>
				))}
		</div>
	);
}

function MessageBubble({
	message: m,
	mine,
	author,
	locale,
	onOpenAttachment,
}: {
	message: QuoteMessage;
	mine: boolean;
	author: string;
	locale: string;
	onOpenAttachment?: (a: QuoteAttachment) => void;
}) {
	const t = useTranslations("rfq.detail");
	return (
		<li
			className={cn(
				"grid max-w-[85%] gap-1",
				mine ? "justify-items-end self-end" : "justify-items-start self-start",
			)}
		>
			<span className="text-[12px] text-nl-russet">
				{author}
				{" · "}
				<time dateTime={m.created_at} className="font-mono tabular-nums">
					{new Date(m.created_at).toLocaleString(
						locale === "ar" ? "ar-AE" : "en-AE",
						{
							month: "short",
							day: "numeric",
							hour: "2-digit",
							minute: "2-digit",
							timeZone: "Asia/Dubai",
						},
					)}
				</time>
			</span>
			<div
				className={cn(
					"whitespace-pre-wrap break-words rounded-md px-3.5 py-2.5 text-[14.5px] leading-relaxed",
					mine ? "bg-nl-cacao text-white" : "bg-nl-linen text-nl-cacao",
				)}
			>
				{m.body}
			</div>
			{m.attachments.length > 0 && (
				<ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
					{m.attachments.map((a) => (
						<li key={a.key}>
							<button
								type="button"
								onClick={() => onOpenAttachment?.(a)}
								className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-nl-linen px-2.5 text-[12.5px] text-nl-cacao hover:bg-nl-cacao/[0.08]"
								aria-label={t("openAttachment", { name: a.filename })}
							>
								<Paperclip
									className="h-3.5 w-3.5"
									strokeWidth={1.75}
									aria-hidden="true"
								/>
								<span className="max-w-[20ch] truncate">{a.filename}</span>
							</button>
						</li>
					))}
				</ul>
			)}
		</li>
	);
}
