"use client";

import { type AuthMethod, AuthShell, MethodSwitch } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { PhoneAuthForm } from "@/components/auth/phone-auth-form";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { safeReturnTo } from "@/lib/safe-return-to";

function LoginContent() {
	const t = useTranslations("auth");
	const locale = useLocale();
	const router = useRouter();
	const searchParams = useSearchParams();
	const returnTo = safeReturnTo(searchParams.get("returnTo"), `/${locale}`);
	const [method, setMethod] = useState<AuthMethod>(searchParams.get("method") === "email" ? "email" : "phone");
	// Set by the account settings page after a password change ends the session.
	const passwordChanged = searchParams.get("notice") === "password_changed";

	const onAuthenticated = () => router.push(returnTo);

	return (
		<AuthShell title={t("loginTitle")} description={method === "phone" ? t("phoneLoginDescription") : t("emailLoginDescription")}>
			{passwordChanged && (
				<output className="mb-5 block rounded-md bg-green-700/10 px-4 py-3 text-sm text-green-800">
					{t("passwordChangedSignIn")}
				</output>
			)}
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
