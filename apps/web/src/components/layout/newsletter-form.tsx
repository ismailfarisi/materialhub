"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/swatch";
import { AlertCircle, ArrowRight, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";

const SUBSCRIBED_FLAG = "materialhub:newsletter-subscribed";

export function NewsletterForm() {
	const t = useTranslations("content.newsletter");
	const user = useAuthStore((s) => s.user);
	const [email, setEmail] = useState("");
	const [status, setStatus] = useState<
		"idle" | "submitting" | "just-subscribed" | "already-subscribed" | "error"
	>("idle");

	// Prefill from the logged-in account (store is hydrated by the app shell's
	// useMe(); if not yet hydrated, the field simply starts empty).
	useEffect(() => {
		if (user?.email) setEmail(user.email);
	}, [user?.email]);

	// Decide whether to hide the form: guests via localStorage (per-browser),
	// logged-in via GET /newsletter/status (cross-device). The status endpoint
	// returns { subscribed:false } for anonymous callers, so this is safe to
	// always call.
	useEffect(() => {
		let cancelled = false;
		if (localStorage.getItem(SUBSCRIBED_FLAG) === "true") {
			setStatus("already-subscribed");
			return;
		}
		(async () => {
			try {
				const { data } = await api.get("/newsletter/status");
				if (!cancelled && data?.data?.subscribed) setStatus("already-subscribed");
			} catch {
				// Non-fatal: leave the form visible.
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (status === "submitting") return;
		setStatus("submitting");
		try {
			const locale = localStorage.getItem("materialhub-locale") || "en";
			await api.post("/newsletter/subscribe", { email, locale, source: "homepage" });
			localStorage.setItem(SUBSCRIBED_FLAG, "true");
			setStatus("just-subscribed");
		} catch {
			setStatus("error");
		}
	}

	if (status === "just-subscribed" || status === "already-subscribed") {
		return (
			<div
				className="w-full flex items-start gap-3 rounded-md bg-nl-pearl shadow-card p-4"
				{...(status === "just-subscribed"
					? { role: "status", "aria-live": "polite" as const }
					: {})}
				data-state="newsletter-subscribed"
			>
				<span className="grid place-items-center h-6 w-6 shrink-0 rounded-sm bg-nl-cacao text-nl-pearl">
					<Check className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
				</span>
				<div className="grid gap-0.5">
					<p className="m-0 text-[15px] font-medium text-nl-cacao">{t("subscribed")}</p>
					<p className="m-0 text-[13px] text-nl-russet">{t("subscribedNote")}</p>
				</div>
			</div>
		);
	}

	const invalid = status === "error";
	return (
		<form className="w-full grid gap-2" onSubmit={handleSubmit} aria-label={t("label")}>
			<label htmlFor="newsletter-email" className="text-[13px] font-medium text-nl-cacao">
				{t("label")}
			</label>
			<div className="flex gap-2">
				<input
					id="newsletter-email"
					type="email"
					required
					autoComplete="email"
					value={email}
					onChange={(e) => {
						setEmail(e.target.value);
						if (invalid) setStatus("idle");
					}}
					placeholder={t("placeholder")}
					aria-invalid={invalid || undefined}
					aria-describedby={invalid ? "newsletter-error" : "newsletter-promise"}
					className="h-12 flex-1 min-w-0 rounded-md border border-nl-cacao/15 bg-nl-pearl px-3.5 text-[15px] text-nl-cacao placeholder:text-nl-russet/80 transition-colors hover:border-nl-cacao/35 focus:border-nl-cacao focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber aria-[invalid=true]:border-red-700"
				/>
				<Button type="submit" size="lg" disabled={status === "submitting"}>
					{status === "submitting" ? t("submitting") : t("submit")}
					<ArrowRight className="h-4 w-4 rtl:rotate-180" strokeWidth={1.75} aria-hidden="true" />
				</Button>
			</div>
			{invalid ? (
				<p id="newsletter-error" className="m-0 flex items-center gap-1.5 text-[13px] text-red-700" role="alert">
					<AlertCircle className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
					{t("error")}
				</p>
			) : (
				<p id="newsletter-promise" className="m-0 text-[13px] text-nl-russet">
					{t("promise")}
				</p>
			)}
		</form>
	);
}
