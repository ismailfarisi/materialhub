"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";

const SUBSCRIBED_FLAG = "materialhub:newsletter-subscribed";

export function NewsletterForm() {
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
				className="w-full"
				{...(status === "just-subscribed"
					? { role: "status", "aria-live": "polite" as const }
					: {})}
				data-state="newsletter-subscribed"
			>
				<div className="flex items-center gap-2.5 border-b border-nl-cacao pb-3">
					<Check className="h-5 w-5 text-nl-cacao" strokeWidth={1.25} />
					<span className="font-serif text-lg md:text-[22px] text-nl-cacao">
						You're subscribed — welcome to the edit.
					</span>
				</div>
				<p className="mt-5 text-[10.5px] tracking-[0.18em] uppercase text-nl-russet">
					Check your inbox for a confirmation.
				</p>
			</div>
		);
	}

	return (
		<form className="w-full" onSubmit={handleSubmit} aria-label="Newsletter signup">
			<div className="flex items-end border-b border-nl-cacao pb-1">
				<input
					type="email"
					required
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					placeholder="your@email.com"
					aria-label="Email address"
					className="flex-1 min-w-0 bg-transparent outline-none font-serif text-lg md:text-[22px] text-nl-cacao placeholder:text-nl-cacao/40 py-3"
				/>
				<button
					type="submit"
					disabled={status === "submitting"}
					className="inline-flex items-center gap-2.5 bg-nl-cacao text-nl-linen px-5 py-3.5 md:px-6 md:py-[14px] text-[10.5px] tracking-[0.22em] uppercase hover:bg-nl-espresso transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
				>
					{status === "submitting" ? "Subscribing…" : "Subscribe"}
					<ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" strokeWidth={1.25} />
				</button>
			</div>
			{status === "error" && (
				<p className="mt-3 text-[10.5px] tracking-[0.18em] uppercase text-red-700" role="alert">
					Something went wrong. Please try again.
				</p>
			)}
			<div className="flex flex-wrap gap-4 md:gap-[18px] mt-5 text-[10.5px] tracking-[0.18em] uppercase text-nl-russet">
				<span className="inline-flex items-center gap-1.5">
					<Check className="h-3.5 w-3.5" strokeWidth={1.25} />
					No spam
				</span>
				<span className="inline-flex items-center gap-1.5">
					<Check className="h-3.5 w-3.5" strokeWidth={1.25} />
					Unsubscribe anytime
				</span>
				<span className="inline-flex items-center gap-1.5">
					<Check className="h-3.5 w-3.5" strokeWidth={1.25} />
					38K subscribers
				</span>
			</div>
		</form>
	);
}
