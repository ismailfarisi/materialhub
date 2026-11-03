"use client";

import { FanDeck } from "@/components/swatch";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

export type AuthMethod = "phone" | "email";

/**
 * Auth page frame: the form on a white card at the start edge; at lg the
 * end side shows the fanned swatch book (its one use on the page) with three
 * plain facts about the store. No claims beyond what the product does.
 */
export function AuthShell({ title, description, children }: { title: ReactNode; description?: ReactNode; children: ReactNode }) {
	const t = useTranslations("auth.shell");
	return (
		<div className="bg-nl-linen">
			<div className="mx-auto grid max-w-[1400px] items-center gap-10 px-4 py-8 md:px-8 md:py-14 lg:min-h-[calc(100dvh-180px)] lg:grid-cols-[minmax(0,480px)_minmax(0,1fr)] lg:gap-16 xl:gap-24">
				<div className="mx-auto w-full max-w-[480px] rounded-md bg-nl-pearl p-5 shadow-card sm:p-8">
					<div className="mb-6 grid gap-2">
						<h1 className="m-0 font-display text-[clamp(26px,3vw,32px)] font-semibold leading-[1.08] tracking-[-0.02em] text-nl-cacao">
							{title}
						</h1>
						{description && <p className="m-0 text-[15px] text-nl-russet">{description}</p>}
					</div>
					{children}
				</div>
				<aside aria-label={t("label")} className="hidden lg:grid lg:gap-10">
					<FanDeck className="max-w-[460px]" />
					<ul className="m-0 grid max-w-[520px] list-none gap-0 border-t-2 border-nl-cacao p-0">
						{(["catalogue", "reorder", "payments"] as const).map((k) => (
							<li key={k} className="grid gap-1 border-b border-nl-cacao/12 py-3.5">
								<span className="font-display text-[15.5px] font-semibold text-nl-cacao">{t(`${k}Title`)}</span>
								<span className="text-sm text-nl-russet">{t(`${k}Body`)}</span>
							</li>
						))}
					</ul>
				</aside>
			</div>
		</div>
	);
}

/** Phone / email switch, a two-segment control. */
export function MethodSwitch({ value, onChange, className }: { value: AuthMethod; onChange: (m: AuthMethod) => void; className?: string }) {
	const t = useTranslations("auth");
	return (
		<div role="tablist" aria-label={t("methodLabel")} className={cn("grid grid-cols-2 gap-1 rounded-md bg-nl-linen p-1", className)}>
			{(["phone", "email"] as const).map((m) => {
				const active = value === m;
				return (
					<button
						key={m}
						type="button"
						role="tab"
						aria-selected={active}
						onClick={() => onChange(m)}
						className={cn(
							"h-10 rounded-[4px] text-sm transition-[background-color,color,box-shadow]",
							active ? "bg-nl-pearl font-medium text-nl-cacao shadow-card" : "text-nl-russet hover:text-nl-cacao",
						)}
					>
						{m === "phone" ? t("methodPhone") : t("methodEmail")}
					</button>
				);
			})}
		</div>
	);
}
