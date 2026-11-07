"use client";

import { apiErrorMessage } from "@/components/account/types";
import { Field, FieldError, Input } from "@/components/account/account-ui";
import { Button } from "@/components/swatch";
import { useLogin } from "@/lib/queries/auth";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { TwoFactorStep } from "./two-factor-step";

interface LoginFormProps {
	onAuthenticated: () => void;
	onSwitchToRegister?: () => void;
}

export const switchClassName =
	"font-medium text-nl-cacao underline decoration-nl-cacao/30 underline-offset-4 transition-colors hover:decoration-nl-amber";

export function LoginForm({ onAuthenticated, onSwitchToRegister }: LoginFormProps) {
	const t = useTranslations("auth");
	const tCommon = useTranslations("common");
	const locale = useLocale();
	const login = useLogin();

	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [challengeToken, setChallengeToken] = useState<string | null>(null);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError("");
		try {
			const result = await login.mutateAsync({ email, password });
			if (result?.requires_2fa) {
				// Password accepted; the account needs its second step.
				setChallengeToken(result.challenge_token);
				return;
			}
			onAuthenticated();
		} catch (err) {
			setError(apiErrorMessage(err, tCommon("error")));
		}
	}

	if (challengeToken) {
		return (
			<TwoFactorStep
				challengeToken={challengeToken}
				onAuthenticated={onAuthenticated}
				onRestart={(notice) => {
					setChallengeToken(null);
					setPassword("");
					setError(notice ?? "");
				}}
			/>
		);
	}

	return (
		<form onSubmit={handleSubmit} className="grid gap-5">
			<Field label={t("email")} id="login-email">
				{(p) => <Input {...p} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />}
			</Field>
			<Field label={t("password")} id="login-password">
				{(p) => (
					<Input
						{...p}
						type="password"
						autoComplete="current-password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						required
					/>
				)}
			</Field>
			{error && <FieldError>{error}</FieldError>}
			<Button type="submit" size="lg" disabled={login.isPending} className="w-full">
				{login.isPending ? tCommon("loading") : t("loginTitle")}
			</Button>
			<p className="m-0 flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-nl-russet">
				<Link href={`/${locale}/auth/forgot-password`} className={switchClassName}>
					{t("forgotPassword")}
				</Link>
				<Link href={`/${locale}/auth/magic-link`} className={switchClassName}>
					{t("recovery.emailLink")}
				</Link>
			</p>
			<p className="m-0 text-center text-sm text-nl-russet">
				{t("noAccount")}{" "}
				{onSwitchToRegister ? (
					<button type="button" onClick={onSwitchToRegister} className={switchClassName}>
						{t("registerTitle")}
					</button>
				) : (
					<Link href={`/${locale}/auth/register`} className={switchClassName}>
						{t("registerTitle")}
					</Link>
				)}
			</p>
		</form>
	);
}
