"use client";

import { Button, STOCKS, STOCK_ORDER } from "@/components/swatch";
import { useChannelEvents } from "@/lib/channels/use-channel-events";
import { useAuthModalStore } from "@/stores/auth-modal";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@materialhub/ui";
import { X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { switchClassName } from "./login-form";
import { PhoneAuthForm } from "./phone-auth-form";
import { safeReturnTo } from "@/lib/safe-return-to";

export function AuthModal() {
	const { isOpen, mode, returnTo, close } = useAuthModalStore();
	const router = useRouter();
	const locale = useLocale();
	const t = useTranslations("auth.modal");
	const { fire } = useChannelEvents();

	useEffect(() => {
		if (isOpen) {
			fire("AuthModalOpen", { mode, returnTo: returnTo || undefined });
		}
	}, [isOpen, mode, returnTo, fire]);

	function handleAuthenticated() {
		close();
		router.push(safeReturnTo(returnTo, `/${locale}`));
	}

	const emailHref = `/${locale}/auth/${mode === "login" ? "login" : "register"}?method=email${
		returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ""
	}`;

	return (
		<Dialog
			open={isOpen}
			onOpenChange={(v) => {
				if (!v) close();
			}}
		>
			<DialogContent
				hideCloseButton
				className="max-h-[calc(100dvh-24px)] w-[calc(100%-24px)] max-w-[440px] gap-0 overflow-y-auto overscroll-contain rounded-md border-0 bg-nl-pearl p-0 shadow-lift sm:rounded-md"
			>
				{/* The book's edge: one strip of all seven stocks. */}
				<div aria-hidden="true" className="flex h-1.5 w-full">
					{STOCK_ORDER.map((k) => (
						<span key={k} className="flex-1" style={{ background: STOCKS[k].color }} />
					))}
				</div>
				<div className="relative px-5 pb-6 pt-6 sm:px-8 sm:pb-8 sm:pt-8">
					<Button variant="ghost" size="icon" onClick={close} aria-label={t("close")} className="absolute end-2 top-2">
						<X className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
					</Button>
					<DialogHeader className="mb-6 space-y-2 pe-8 text-start sm:text-start">
						<DialogTitle className="m-0 font-display text-[26px] font-semibold leading-[1.08] tracking-[-0.02em] text-nl-cacao">
							{mode === "login" ? t("loginTitle") : t("registerTitle")}
						</DialogTitle>
						<DialogDescription className="text-[15px] leading-relaxed text-nl-russet">
							{mode === "login" ? t("loginDescription") : t("registerDescription")}
						</DialogDescription>
					</DialogHeader>
					<PhoneAuthForm key={mode} onAuthenticated={handleAuthenticated} />
					<p className="m-0 mt-5 border-t border-nl-cacao/10 pt-4 text-center text-sm text-nl-russet">
						<Link href={emailHref} onClick={close} className={switchClassName}>
							{t("useEmail")}
						</Link>
					</p>
				</div>
			</DialogContent>
		</Dialog>
	);
}
