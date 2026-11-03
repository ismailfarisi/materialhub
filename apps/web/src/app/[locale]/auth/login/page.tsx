"use client";

import { type AuthMethod, AuthShell, MethodSwitch } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { PhoneAuthForm } from "@/components/auth/phone-auth-form";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function LoginContent() {
	const t = useTranslations("auth");
	const locale = useLocale();
	const router = useRouter();
	const searchParams = useSearchParams();
	const returnTo = searchParams.get("returnTo") || `/${locale}`;
	const [method, setMethod] = useState<AuthMethod>(searchParams.get("method") === "email" ? "email" : "phone");

	const onAuthenticated = () => router.push(returnTo);

	return (
		<AuthShell title={t("loginTitle")} description={method === "phone" ? t("phoneLoginDescription") : t("emailLoginDescription")}>
			<MethodSwitch value={method} onChange={setMethod} className="mb-6" />
			<div role="tabpanel">
				{method === "phone" ? <PhoneAuthForm onAuthenticated={onAuthenticated} /> : <LoginForm onAuthenticated={onAuthenticated} />}
			</div>
		</AuthShell>
	);
}

export default function LoginPage() {
	return (
		<Suspense>
			<LoginContent />
		</Suspense>
	);
}
