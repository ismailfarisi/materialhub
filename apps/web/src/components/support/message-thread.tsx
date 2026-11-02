"use client";

import type { TicketMessage } from "@/lib/queries/support";
import { cn } from "@/lib/utils";
import { useLocale, useTranslations } from "next-intl";

export function MessageThread({ messages }: { messages: TicketMessage[] }) {
	const t = useTranslations("support");
	const locale = useLocale();
	if (messages.length === 0) {
		return <p className="m-0 text-sm text-nl-russet">{t("thread.empty")}</p>;
	}
	return (
		<ol className="m-0 flex list-none flex-col gap-3 p-0">
			{messages.map((m) => {
				const isCustomer = m.sender_role === "customer";
				return (
					<li key={m.id} className={cn("grid max-w-[85%] gap-1", isCustomer ? "justify-items-end self-end" : "justify-items-start self-start")}>
						<span className="text-[12px] text-nl-russet">
							{isCustomer ? t("thread.you") : t("thread.team")}
							{m.created_at && (
								<>
									{" · "}
									<time dateTime={m.created_at} className="font-mono tabular-nums">
										{new Date(m.created_at).toLocaleString(locale === "ar" ? "ar-AE" : "en-AE", {
											month: "short",
											day: "numeric",
											hour: "2-digit",
											minute: "2-digit",
										})}
									</time>
								</>
							)}
						</span>
						<div
							className={cn(
								"whitespace-pre-wrap break-words rounded-md px-3.5 py-2.5 text-[14.5px] leading-relaxed",
								isCustomer ? "bg-nl-cacao text-white" : "bg-nl-linen text-nl-cacao",
							)}
						>
							{m.message}
						</div>
					</li>
				);
			})}
		</ol>
	);
}
