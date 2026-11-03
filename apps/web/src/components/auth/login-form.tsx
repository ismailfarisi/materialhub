"use client";

import { apiErrorMessage } from "@/components/account/types";
import { Field, FieldError, Input } from "@/components/account/account-ui";
import { Button } from "@/components/swatch";
import { useLogin } from "@/lib/queries/auth";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

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

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError("");
		try {
			await login.mutateAsync({ email, password });
			onAuthenticated();
		} catch (err) {
			setError(apiErrorMessage(err, tCommon("error")));
		}
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
