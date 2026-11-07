"use client";

import { Field, FieldError, Input } from "@/components/account/account-ui";
import { apiErrorMessage } from "@/components/account/types";
import { Button } from "@/components/swatch";
import { api } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AuthShell } from "./auth-shell";
import { switchClassName } from "./login-form";

/**
 * Pages behind the links in MaterialHub's account emails (verify, reset,
 * magic link) and the two forms that send them. The API endpoints take the
 * token in a POST body; these pages read `?token=` and post it.
 */

function useToken(): string {
	return useSearchParams().get("token")?.trim() ?? "";
}

function BackToLogin() {
	const t = useTranslations("auth.recovery");
	const locale = useLocale();
	return (
		<p className="m-0 text-center text-sm text-nl-russet">
			<Link href={`/${locale}/auth/login?method=email`} className={switchClassName}>
				{t("backToLogin")}
			</Link>
		</p>
	);
}

/** Request a link by email (password reset or magic sign-in). */
function EmailRequestForm({ kind }: { kind: "reset" | "magic" }) {
	const t = useTranslations("auth.recovery");
	const tAuth = useTranslations("auth");
	const [email, setEmail] = useState("");
	const [sentTo, setSentTo] = useState<string | null>(null);
	const [error, setError] = useState("");
	const [pending, setPending] = useState(false);

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		setError("");
		setPending(true);
		try {
			await api.post(kind === "reset" ? "/auth/forgot-password" : "/auth/magic-link", { email });
			setSentTo(email);
		} catch (err) {
			setError(apiErrorMessage(err, t("linkInvalid")));
		} finally {
			setPending(false);
		}
	}

	if (sentTo) {
		return (
			<div className="grid gap-5">
				<p role="status" className="m-0 text-[15px] text-nl-cacao">
					{t(kind === "reset" ? "forgotSent" : "magicSent", { email: sentTo })}
				</p>
				<BackToLogin />
			</div>
		);
	}

	return (
		<form onSubmit={submit} className="grid gap-5">
			<Field label={tAuth("email")} id={`${kind}-email`}>
				{(p) => (
					<Input
						{...p}
						type="email"
						autoComplete="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						required
					/>
				)}
			</Field>
			{error && <FieldError>{error}</FieldError>}
			<Button type="submit" size="lg" disabled={pending} className="w-full">
				{pending ? t("sending") : t(kind === "reset" ? "sendLink" : "sendMagicLink")}
			</Button>
			<BackToLogin />
		</form>
	);
}

export function ForgotPasswordFlow() {
	const t = useTranslations("auth.recovery");
	return (
		<AuthShell title={t("forgotTitle")} description={t("forgotDescription")}>
			<EmailRequestForm kind="reset" />
		</AuthShell>
	);
}

export function MagicLinkRequestFlow() {
	const t = useTranslations("auth.recovery");
	return (
		<AuthShell title={t("magicTitle")} description={t("magicDescription")}>
			<EmailRequestForm kind="magic" />
		</AuthShell>
	);
}

export function ResetPasswordFlow() {
	const t = useTranslations("auth.recovery");
	const tAuth = useTranslations("auth");
	const locale = useLocale();
	const token = useToken();
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [error, setError] = useState("");
	const [done, setDone] = useState(false);
	const [pending, setPending] = useState(false);

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		setError("");
		if (password !== confirm) {
			setError(tAuth("passwordMismatch"));
			return;
		}
		setPending(true);
		try {
			await api.post("/auth/reset-password", { token, new_password: password });
			setDone(true);
		} catch (err) {
			setError(apiErrorMessage(err, t("linkInvalid")));
		} finally {
			setPending(false);
		}
	}

	return (
		<AuthShell title={t("resetTitle")} description={done ? undefined : t("resetDescription")}>
			{!token ? (
				<p role="alert" className="m-0 text-[15px] text-nl-cacao">
					{t("linkMissing")}
				</p>
			) : done ? (
				<div className="grid gap-5">
					<p role="status" className="m-0 text-[15px] text-nl-cacao">
						{t("resetDone")}
					</p>
					<Button asChild size="lg" className="w-full">
						<Link href={`/${locale}/auth/login?method=email`}>{t("signIn")}</Link>
					</Button>
				</div>
			) : (
				<form onSubmit={submit} className="grid gap-5">
					<Field label={t("newPassword")} id="reset-password">
						{(p) => (
							<Input
								{...p}
								type="password"
								autoComplete="new-password"
								minLength={8}
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								required
							/>
						)}
					</Field>
					<Field label={tAuth("confirmPassword")} id="reset-confirm">
						{(p) => (
							<Input
								{...p}
								type="password"
								autoComplete="new-password"
								minLength={8}
								value={confirm}
								onChange={(e) => setConfirm(e.target.value)}
								required
							/>
						)}
					</Field>
					{error && <FieldError>{error}</FieldError>}
					<Button type="submit" size="lg" disabled={pending} className="w-full">
						{pending ? t("saving") : t("savePassword")}
					</Button>
				</form>
			)}
		</AuthShell>
	);
}

/** Posts the token once on load (guarded against React strict-mode double run). */
function useTokenAction(path: string, token: string, fallback: string) {
	const [state, setState] = useState<"working" | "done" | "failed">(token ? "working" : "failed");
	const [message, setMessage] = useState("");
	const ran = useRef(false);
	useEffect(() => {
		if (!token || ran.current) return;
		ran.current = true;
		api
			.post(path, { token })
			.then(() => setState("done"))
			.catch((err) => {
				setMessage(apiErrorMessage(err, fallback));
				setState("failed");
			});
	}, [path, token, fallback]);
	return { state, message };
}

export function VerifyEmailFlow() {
	const t = useTranslations("auth.recovery");
	const locale = useLocale();
	const token = useToken();
	const qc = useQueryClient();
	const { state, message } = useTokenAction("/auth/verify-email", token, t("linkInvalid"));
	useEffect(() => {
		if (state === "done") qc.invalidateQueries({ queryKey: ["auth", "me"] });
	}, [state, qc]);

	return (
		<AuthShell title={t("verifyTitle")}>
			<div className="grid gap-5">
				<p role={state === "failed" ? "alert" : "status"} className="m-0 text-[15px] text-nl-cacao">
					{state === "working"
						? t("verifying")
						: state === "done"
							? t("verifyDone")
							: !token
								? t("linkMissing")
								: message}
				</p>
				{state === "done" && (
					<Button asChild size="lg" className="w-full">
						<Link href={`/${locale}`}>{t("continueShopping")}</Link>
					</Button>
				)}
			</div>
		</AuthShell>
	);
}

export function MagicLinkVerifyFlow() {
	const t = useTranslations("auth.recovery");
	const locale = useLocale();
	const router = useRouter();
	const token = useToken();
	const qc = useQueryClient();
	const { state, message } = useTokenAction("/auth/magic-link/verify", token, t("linkInvalid"));
	useEffect(() => {
		if (state !== "done") return;
		qc.invalidateQueries({ queryKey: ["auth", "me"] });
		router.replace(`/${locale}/account`);
	}, [state, qc, router, locale]);

	return (
		<AuthShell title={t("magicTitle")}>
			<div className="grid gap-5">
				<p role={state === "failed" ? "alert" : "status"} className="m-0 text-[15px] text-nl-cacao">
					{state === "failed" ? (!token ? t("linkMissing") : message) : t("magicVerifying")}
				</p>
				{state === "failed" && <BackToLogin />}
			</div>
		</AuthShell>
	);
}
