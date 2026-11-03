"use client";

import { apiErrorMessage } from "@/components/account/types";
import { Field, FieldError, Input } from "@/components/account/account-ui";
import { Button } from "@/components/swatch";
import { useLogin, useRegister } from "@/lib/queries/auth";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { switchClassName } from "./login-form";

interface RegisterFormProps {
	onAuthenticated: () => void;
	onSwitchToLogin?: () => void;
}

export function RegisterForm({ onAuthenticated, onSwitchToLogin }: RegisterFormProps) {
	const t = useTranslations("auth");
	const tCommon = useTranslations("common");
	const locale = useLocale();
	const register = useRegister();
	const login = useLogin();

	const [form, setForm] = useState({
		first_name: "",
		last_name: "",
		email: "",
		password: "",
		confirmPassword: "",
	});
	const [error, setError] = useState("");
	const [mismatch, setMismatch] = useState(false);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError("");
		if (form.password !== form.confirmPassword) {
			setMismatch(true);
			return;
		}
		setMismatch(false);
		try {
			await register.mutateAsync({
				first_name: form.first_name,
				last_name: form.last_name,
				email: form.email,
				password: form.password,
			});
			// Auto-login after registration
			await login.mutateAsync({ email: form.email, password: form.password });
			onAuthenticated();
		} catch (err) {
			setError(apiErrorMessage(err, tCommon("error")));
		}
	}

	return (
		<form onSubmit={handleSubmit} className="grid gap-5">
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<Field label={t("firstName")} id="register-first-name">
					{(p) => (
						<Input {...p} autoComplete="given-name" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} required />
					)}
				</Field>
				<Field label={t("lastName")} id="register-last-name">
					{(p) => (
						<Input {...p} autoComplete="family-name" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} required />
					)}
				</Field>
			</div>
			<Field label={t("email")} id="register-email">
				{(p) => (
					<Input {...p} type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
				)}
			</Field>
			<Field label={t("password")} id="register-password" hint={t("passwordHint")}>
				{(p) => (
					<Input
						{...p}
						type="password"
						autoComplete="new-password"
						minLength={8}
						value={form.password}
						onChange={(e) => setForm({ ...form, password: e.target.value })}
						required
					/>
				)}
			</Field>
			<Field label={t("confirmPassword")} id="register-confirm-password" error={mismatch ? t("passwordMismatch") : undefined}>
				{(p) => (
					<Input
						{...p}
						type="password"
						autoComplete="new-password"
						value={form.confirmPassword}
						onChange={(e) => {
							setForm({ ...form, confirmPassword: e.target.value });
							if (mismatch) setMismatch(false);
						}}
						required
					/>
				)}
			</Field>
			{error && <FieldError>{error}</FieldError>}
			<Button type="submit" size="lg" disabled={register.isPending || login.isPending} className="w-full">
				{register.isPending || login.isPending ? tCommon("loading") : t("registerTitle")}
			</Button>
			<p className="m-0 text-center text-sm text-nl-russet">
				{t("hasAccount")}{" "}
				{onSwitchToLogin ? (
					<button type="button" onClick={onSwitchToLogin} className={switchClassName}>
						{t("loginTitle")}
					</button>
				) : (
					<Link href={`/${locale}/auth/login`} className={switchClassName}>
						{t("loginTitle")}
					</Link>
				)}
			</p>
		</form>
	);
}
